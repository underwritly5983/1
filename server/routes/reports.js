const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const { parsePDF, extractQuarterInfo } = require('../services/pdfParser');
const { summarizeIFTAReport, checkReportAge } = require('../services/aiService');
const { generateReport, generateTemplateExcel } = require('../services/reportGenerator');
const { generateSummaryPDF } = require('../services/pdfGenerator');

const router = express.Router();

// Configure multer for IFTA report uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || './uploads/reports';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ifta-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB per file
    files: 4 // Maximum 4 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Upload multiple IFTA reports and generate summary PDF
router.post('/upload-multiple', authenticate, (req, res, next) => {
  upload.array('files', 4)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Maximum 4 files allowed' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds 10MB limit' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload error' });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('Upload-multiple endpoint called');
    console.log('Files received:', req.files ? req.files.length : 0);
    console.log('Body:', req.body);
    
    if (!req.files || req.files.length === 0) {
      console.error('No files in request');
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const autoGenerate = req.body.autoGenerate === 'true';
    const results = [];
    const reportIds = [];

    // Process each file
    for (const file of req.files) {
      try {
        console.log(`Processing file: ${file.originalname}`);
        const filePath = file.path;
        const fileName = file.originalname;
        const fileSize = file.size;

        // Parse PDF
        console.log(`Parsing PDF: ${filePath}`);
        const pdfData = await parsePDF(filePath);
        console.log(`PDF parsed successfully, text length: ${pdfData.text.length}`);
        
        // Extract quarter information
        const quarterInfo = extractQuarterInfo(pdfData.text);
        
        // Check if report is older than 6 months
        const isOldReport = checkReportAge(quarterInfo.detectedDate);
        
        // Store report in database
        const rawTextToStore = pdfData.text.length > 200000 
          ? pdfData.text.substring(0, 200000) 
          : pdfData.text;
        
        const result = await db.query(
          `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id, quarter_label, year, detected_date, status`,
          [
            req.user.id,
            fileName,
            filePath,
            fileSize,
            quarterInfo.quarter,
            quarterInfo.year,
            quarterInfo.quarter,
            quarterInfo.detectedDate,
            rawTextToStore,
            'processing'
          ]
        );

        const report = result.rows[0];
        reportIds.push(report.id);

        // Track analytics
        await db.query(
          'INSERT INTO usage_analytics (user_id, event_type, event_data) VALUES ($1, $2, $3)',
          [req.user.id, 'report_uploaded', JSON.stringify({ reportId: report.id, fileName })]
        );

        // Process summary in background (async)
        summarizeIFTAReport(pdfData.text, quarterInfo.quarter, quarterInfo.year)
          .then(async (summary) => {
            await db.query(
              'UPDATE ifta_reports SET summary = $1, status = $2 WHERE id = $3',
              [JSON.stringify(summary), 'completed', report.id]
            );
            console.log(`Summary completed for report ${report.id}`);
          })
          .catch(async (error) => {
            console.error(`Summary processing error for report ${report.id}:`, error);
            // Still mark as completed if we have raw text for jurisdiction extraction
            await db.query(
              'UPDATE ifta_reports SET status = $1 WHERE id = $2',
              ['completed', report.id]
            );
          });

        results.push({
          fileName,
          report: {
            id: report.id,
            quarter: report.quarter_label,
            year: report.year,
            detectedDate: report.detected_date,
            status: report.status,
            isOldReport
          },
          warning: isOldReport ? 'This report appears to be older than 6 months. Please verify the data is current.' : null
        });
      } catch (error) {
        console.error(`Error processing ${file.originalname}:`, error);
        results.push({
          fileName: file.originalname,
          error: error.message || 'Failed to process file'
        });
      }
    }

    // If auto-generate is enabled and we have reports, generate summary PDF
    let summaryPdfUrl = null;
    let generatedReportId = null;
    
    if (autoGenerate && reportIds.length > 0) {
      try {
        // Wait a bit for PDFs to be parsed and stored
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Get user branding
        const userResult = await db.query(
          'SELECT company_name, logo_url, brand_color_primary, brand_color_secondary FROM users WHERE id = $1',
          [req.user.id]
        );
        const user = userResult.rows[0];

        // Get reports with raw text - we'll use raw text even if summaries aren't ready
        let reportsResult = await db.query(
          `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
           FROM ifta_reports
           WHERE id = ANY($1::int[]) AND user_id = $2`,
          [reportIds, req.user.id]
        );
        
        // Poll for summaries, but proceed with raw text if available
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          const hasRawText = reportsResult.rows.some(r => r.raw_text && r.raw_text.length > 100);
          const allCompleted = reportsResult.rows.every(r => r.status === 'completed' && r.summary);
          
          if (hasRawText || allCompleted || attempts >= maxAttempts - 1) {
            break;
          }
          
          // Wait 2 seconds before next attempt
          await new Promise(resolve => setTimeout(resolve, 2000));
          attempts++;
          
          // Re-fetch reports
          reportsResult = await db.query(
            `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
             FROM ifta_reports
             WHERE id = ANY($1::int[]) AND user_id = $2`,
            [reportIds, req.user.id]
          );
        }

        if (reportsResult.rows.length > 0) {
          // Use reports even if summaries aren't ready - we have raw text for jurisdiction extraction
          // Filter to reports that have at least raw text
          const reportsWithData = reportsResult.rows.filter(r => r.raw_text && r.raw_text.length > 100);
          
          if (reportsWithData.length === 0) {
            console.warn('No reports with raw text yet, creating placeholder report');
            // Create a placeholder report that will be updated when data is ready
            const reportName = `IFTA Summary - ${new Date().toLocaleDateString()}`;
            const placeholderData = {
              companyName: user.company_name,
              generatedAt: new Date().toISOString(),
              quarters: reportsResult.rows.map(r => ({
                quarter: r.quarter_label,
                year: r.year,
                fileName: r.file_name,
                status: r.status,
                summary: 'Processing...'
              })),
              totals: { totalMiles: 0 },
              jurisdictionData: { 
                jurisdictions: [], 
                grandTotal: 0, 
                canVsUs: { 
                  can: { total: 0, percentage: 0 }, 
                  us: { total: 0, percentage: 0 },
                  grandTotal: 0
                } 
              },
              processing: true
            };
            
            const placeholderResult = await db.query(
              `INSERT INTO generated_reports (user_id, report_name, report_data, template_used)
               VALUES ($1, $2, $3, $4)
               RETURNING id`,
              [req.user.id, reportName, JSON.stringify(placeholderData), 'auto-generated-pending']
            );
            
            generatedReportId = placeholderResult.rows[0].id;
            console.log('Created placeholder report:', generatedReportId);
          } else {
            const reports = reportsWithData.map(r => ({
              id: r.id,
              fileName: r.file_name,
              quarter: r.quarter_label,
              year: r.year,
              summary: r.summary || { summary: 'Processing...', jurisdictions: [] },
              detectedDate: r.detected_date,
              rawText: r.raw_text
            }));

          // Sort chronologically
          reports.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            const qOrder = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4 };
            return (qOrder[a.quarter] || 0) - (qOrder[b.quarter] || 0);
          });

            // Generate report data
            const reportData = await generateReport(reports, user);

            // Generate and save summary PDF
            const pdfBuffer = await generateSummaryPDF(reportData, user);
            
            // Save PDF to file
            const pdfFilename = `summary-${req.user.id}-${Date.now()}.pdf`;
            const uploadDir = process.env.UPLOAD_DIR || './uploads';
            const summariesDir = path.join(uploadDir, 'summaries');
            if (!fs.existsSync(summariesDir)) {
              fs.mkdirSync(summariesDir, { recursive: true });
            }
            const pdfPath = path.join(summariesDir, pdfFilename);
            fs.writeFileSync(pdfPath, pdfBuffer);

            // Check if a report for today already exists, update it instead of creating new
            const reportName = `IFTA Summary - ${new Date().toLocaleDateString()}`;
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Check for existing report from today
            const existingReport = await db.query(
              `SELECT id FROM generated_reports 
               WHERE user_id = $1 AND report_name = $2 
               ORDER BY created_at DESC LIMIT 1`,
              [req.user.id, reportName]
            );
            
            let saveResult;
            if (existingReport.rows.length > 0) {
              // Update existing report
              await db.query(
                `UPDATE generated_reports 
                 SET report_data = $1, file_path = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [JSON.stringify(reportData), pdfPath, existingReport.rows[0].id]
              );
              saveResult = { rows: [{ id: existingReport.rows[0].id }] };
              console.log('Updated existing report:', existingReport.rows[0].id);
            } else {
              // Create new report
              saveResult = await db.query(
                `INSERT INTO generated_reports (user_id, report_name, report_data, file_path, template_used)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [
                  req.user.id,
                  reportName,
                  JSON.stringify(reportData),
                  pdfPath,
                  'auto-generated'
                ]
              );
              console.log('Created new report:', saveResult.rows[0].id);
            }

            summaryPdfUrl = `/uploads/summaries/${pdfFilename}`;
            generatedReportId = saveResult.rows[0].id;
            console.log('Created/updated report with data:', generatedReportId);
          }
        }
      } catch (error) {
        console.error('Error generating summary PDF:', error);
        console.error('Error stack:', error.stack);
        // Still create a basic report entry even if generation fails
        if (!generatedReportId) {
          try {
            const reportName = `IFTA Summary - ${new Date().toLocaleDateString()}`;
            const userResult = await db.query(
              'SELECT company_name FROM users WHERE id = $1',
              [req.user.id]
            );
            const user = userResult.rows[0];
            
            const errorReportData = {
              companyName: user.company_name,
              generatedAt: new Date().toISOString(),
              quarters: [],
              totals: { totalMiles: 0 },
              jurisdictionData: { jurisdictions: [], grandTotal: 0 },
              error: 'Report generation encountered an error. Please try generating manually.'
            };
            
            const errorSaveResult = await db.query(
              `INSERT INTO generated_reports (user_id, report_name, report_data, template_used)
               VALUES ($1, $2, $3, $4)
               RETURNING id`,
              [req.user.id, reportName, JSON.stringify(errorReportData), 'auto-generated-error']
            );
            generatedReportId = errorSaveResult.rows[0].id;
          } catch (createError) {
            console.error('Failed to create error report:', createError);
          }
        }
      }
    }

    res.json({
      message: `${req.files.length} file(s) uploaded successfully`,
      results,
      summaryPdfUrl,
      generatedReportId
    });
  } catch (error) {
    console.error('Upload error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to upload reports',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Upload single IFTA report (keep for backward compatibility)
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    // Parse PDF
    const pdfData = await parsePDF(filePath);
    
    // Extract quarter information
    const quarterInfo = extractQuarterInfo(pdfData.text);
    
    // Check if report is older than 6 months
    const isOldReport = checkReportAge(quarterInfo.detectedDate);
    
    // Store report in database (store more text for jurisdiction extraction)
    const rawTextToStore = pdfData.text.length > 200000 
      ? pdfData.text.substring(0, 200000) 
      : pdfData.text;
    
    const result = await db.query(
      `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, quarter_label, year, detected_date, status`,
      [
        req.user.id,
        fileName,
        filePath,
        fileSize,
        quarterInfo.quarter,
        quarterInfo.year,
        quarterInfo.quarter,
        quarterInfo.detectedDate,
        rawTextToStore,
        'processing'
      ]
    );

    const report = result.rows[0];

    // Track analytics
    await db.query(
      'INSERT INTO usage_analytics (user_id, event_type, event_data) VALUES ($1, $2, $3)',
      [req.user.id, 'report_uploaded', JSON.stringify({ reportId: report.id, fileName })]
    );

    // Process summary in background (async)
    summarizeIFTAReport(pdfData.text, quarterInfo.quarter, quarterInfo.year)
      .then(async (summary) => {
        await db.query(
          'UPDATE ifta_reports SET summary = $1, status = $2 WHERE id = $3',
          [JSON.stringify(summary), 'completed', report.id]
        );
      })
      .catch(async (error) => {
        console.error('Summary processing error:', error);
        await db.query(
          'UPDATE ifta_reports SET status = $1 WHERE id = $2',
          ['error', report.id]
        );
      });

    res.json({
      message: 'Report uploaded successfully',
      report: {
        id: report.id,
        fileName,
        quarter: report.quarter_label,
        year: report.year,
        detectedDate: report.detected_date,
        status: report.status,
        isOldReport
      },
      warning: isOldReport ? 'This report appears to be older than 6 months. Please verify the data is current.' : null
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload report' });
  }
});

// Get all reports for user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, file_name, quarter_label, year, detected_date, status, created_at, summary
       FROM ifta_reports
       WHERE user_id = $1
       ORDER BY year DESC, quarter_label DESC, created_at DESC`,
      [req.user.id]
    );

    const reports = result.rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      quarter: row.quarter_label,
      year: row.year,
      detectedDate: row.detected_date,
      status: row.status,
      createdAt: row.created_at,
      summary: row.summary
    }));

    res.json({ reports });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Get single report
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, file_name, file_path, quarter_label, year, detected_date, status, summary, raw_text, created_at
       FROM ifta_reports
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = result.rows[0];
    res.json({
      id: report.id,
      fileName: report.file_name,
      filePath: report.file_path,
      quarter: report.quarter_label,
      year: report.year,
      detectedDate: report.detected_date,
      status: report.status,
      summary: report.summary,
      rawText: report.raw_text?.substring(0, 1000), // First 1000 chars for preview
      createdAt: report.created_at
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Delete report
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT file_path FROM ifta_reports WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Delete file
    const filePath = result.rows[0].file_path;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await db.query('DELETE FROM ifta_reports WHERE id = $1', [req.params.id]);

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Generate final summary report
router.post('/generate-summary', authenticate, async (req, res) => {
  try {
    const { reportIds, reportName } = req.body;

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
      return res.status(400).json({ error: 'Report IDs required' });
    }

    // Get all reports with raw text for jurisdiction extraction
    const reportsResult = await db.query(
      `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text
       FROM ifta_reports
       WHERE id = ANY($1::int[]) AND user_id = $2 AND status = 'completed'`,
      [reportIds, req.user.id]
    );

    if (reportsResult.rows.length === 0) {
      return res.status(404).json({ error: 'No valid reports found' });
    }

    // Get user branding
    const userResult = await db.query(
      'SELECT company_name, logo_url, brand_color_primary, brand_color_secondary FROM users WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    // Organize reports by quarter chronologically
    const reports = reportsResult.rows.map(r => ({
      id: r.id,
      fileName: r.file_name,
      quarter: r.quarter_label,
      year: r.year,
      summary: r.summary,
      detectedDate: r.detected_date,
      rawText: r.raw_text // Include raw text for jurisdiction extraction
    }));

    // Sort chronologically
    reports.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const qOrder = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4 };
      return (qOrder[a.quarter] || 0) - (qOrder[b.quarter] || 0);
    });

    // Generate report
    const reportData = await generateReport(reports, user);

    // Check if report with same name exists, update instead of creating new
    const finalReportName = reportName || 'IFTA Summary Report';
    const existingReport = await db.query(
      `SELECT id FROM generated_reports 
       WHERE user_id = $1 AND report_name = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, finalReportName]
    );
    
    let saveResult;
    if (existingReport.rows.length > 0) {
      // Update existing report
      await db.query(
        `UPDATE generated_reports 
         SET report_data = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [JSON.stringify(reportData), existingReport.rows[0].id]
      );
      const updated = await db.query(
        `SELECT id, created_at FROM generated_reports WHERE id = $1`,
        [existingReport.rows[0].id]
      );
      saveResult = updated;
      console.log('Updated existing report:', existingReport.rows[0].id);
    } else {
      // Create new report
      saveResult = await db.query(
        `INSERT INTO generated_reports (user_id, report_name, report_data, template_used)
         VALUES ($1, $2, $3, $4)
         RETURNING id, created_at`,
        [req.user.id, finalReportName, JSON.stringify(reportData), 'default']
      );
      console.log('Created new report:', saveResult.rows[0].id);
    }

    // Track analytics
    await db.query(
      'INSERT INTO usage_analytics (user_id, event_type, event_data) VALUES ($1, $2, $3)',
      [req.user.id, 'report_generated', JSON.stringify({ reportId: saveResult.rows[0].id, reportCount: reports.length })]
    );

    res.json({
      message: 'Report generated successfully',
      report: {
        id: saveResult.rows[0].id,
        name: reportName || 'IFTA Summary Report',
        data: reportData,
        createdAt: saveResult.rows[0].created_at
      },
      // Include jurisdiction summary for immediate display
      summary: {
        totalJurisdictions: reportData.jurisdictionData?.jurisdictions?.length || 0,
        grandTotalKM: reportData.jurisdictionData?.grandTotal || 0,
        canTotal: reportData.jurisdictionData?.canVsUs?.can?.total || 0,
        usTotal: reportData.jurisdictionData?.canVsUs?.us?.total || 0
      }
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// Get generated reports
router.get('/generated/list', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, report_name, created_at, updated_at
       FROM generated_reports
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ reports: result.rows });
  } catch (error) {
    console.error('Get generated reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Get single generated report
router.get('/generated/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, report_name, report_data, created_at, updated_at, file_path
       FROM generated_reports
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ report: result.rows[0] });
  } catch (error) {
    console.error('Get generated report error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Delete generated report
router.delete('/generated/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT file_path FROM generated_reports WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Delete PDF file if it exists
    const filePath = result.rows[0].file_path;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileError) {
        console.error('Error deleting file:', fileError);
        // Continue even if file deletion fails
      }
    }

    // Delete from database
    await db.query('DELETE FROM generated_reports WHERE id = $1', [req.params.id]);

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Delete generated report error:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Download report as Excel (matching template)
router.get('/generated/:id/excel', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT gr.id, gr.report_name, gr.report_data, u.company_name, u.logo_url, 
              u.brand_color_primary, u.brand_color_secondary
       FROM generated_reports gr
       JOIN users u ON u.id = gr.user_id
       WHERE gr.id = $1 AND gr.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = result.rows[0];
    const reportData = typeof report.report_data === 'string' 
      ? JSON.parse(report.report_data) 
      : report.report_data;

    // Generate Excel matching template
    const templatePath = path.join(process.cwd(), 'IFTA SUMMARY.xlsx');
    const workbook = generateTemplateExcel(reportData, templatePath);

    // Generate filename
    const filename = `${report.report_name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.xlsx`;

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send file
    const XLSX = require('xlsx');
    XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }).then(buffer => {
      res.send(buffer);
    });
  } catch (error) {
    console.error('Download Excel error:', error);
    res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});

// Download report as PDF
router.get('/generated/:id/pdf', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT gr.id, gr.report_name, gr.report_data, u.company_name, u.logo_url, 
              u.brand_color_primary, u.brand_color_secondary
       FROM generated_reports gr
       JOIN users u ON u.id = gr.user_id
       WHERE gr.id = $1 AND gr.user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = result.rows[0];
    const reportData = typeof report.report_data === 'string' 
      ? JSON.parse(report.report_data) 
      : report.report_data;

    // Generate PDF using pdfkit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'LETTER'
    });
    
    const filename = `${report.report_name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    doc.pipe(res);

    // Title and header
    doc.fontSize(20).font('Helvetica-Bold').text(report.report_name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').text(`Company: ${report.company_name}`, { align: 'center' });
    doc.fontSize(10).text(`Generated: ${new Date(report.created_at).toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1);

    // Jurisdiction table
    if (reportData.jurisdictionData && reportData.jurisdictionData.jurisdictions) {
      doc.fontSize(14).font('Helvetica-Bold').text('Jurisdiction Summary', { underline: true });
      doc.moveDown(0.5);

      // Table headers
      doc.fontSize(9).font('Helvetica-Bold');
      let startY = doc.y;
      doc.text('Jurisdiction', 50, startY);
      doc.text('Q1', 150, startY);
      doc.text('Q2', 200, startY);
      doc.text('Q3', 250, startY);
      doc.text('Q4', 300, startY);
      doc.text('Total KM', 350, startY);
      doc.text('%', 450, startY);
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(0.3);

      // Table rows
      doc.font('Helvetica').fontSize(9);
      reportData.jurisdictionData.jurisdictions.forEach((juris, index) => {
        if (doc.y > 700) { // New page if needed
          doc.addPage();
          startY = doc.y;
        }
        
        const y = doc.y;
        doc.text(juris.code, 50, y);
        juris.quarters.forEach((q, idx) => {
          const x = 150 + (idx * 50);
          doc.text(q ? q.km.toLocaleString() : '-', x, y, { width: 45, align: 'right' });
        });
        doc.text(juris.totalKM.toLocaleString(), 350, y, { width: 90, align: 'right' });
        doc.text(`${juris.percentage.toFixed(2)}%`, 450, y, { width: 50, align: 'right' });
        doc.moveDown(0.4);
      });

      // Grand total row
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold');
      doc.text('Grand Total', 50, doc.y);
      doc.text(reportData.jurisdictionData.grandTotal.toLocaleString(), 350, doc.y, { width: 90, align: 'right' });
      doc.text('100.00%', 450, doc.y, { width: 50, align: 'right' });
    }

    doc.end();
  } catch (error) {
    console.error('Download PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF file' });
  }
});

module.exports = router;
