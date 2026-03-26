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
const { generateReportPrintPdf } = require('../services/reportPrintPdfService');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { getUploadsRoot, resolveStoredUploadPath } = require('../lib/uploadPaths');

const router = express.Router();

// Generated report name: "COMPANY NAME IFTA Summary"
function getGeneratedReportName(companyName) {
  return `${String(companyName || 'Company').trim()} IFTA Summary`;
}

/** Authenticated download URL (works on Vercel; raw /uploads/* is not reliably served). */
function sourceFileViewUrl(reportId) {
  if (reportId == null) return null;
  return `/api/reports/source-file/${reportId}`;
}

function rowToSourceFileRow(r) {
  return {
    id: r.id,
    fileName: r.file_name,
    quarter: r.quarter_label,
    year: r.year,
    viewUrl: sourceFileViewUrl(r.id)
  };
}

/** Normalize IDs saved on generated report JSON (may be strings from JSON). */
function normalizeSourceReportIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
}

function parseReportDataJson(reportData) {
  if (reportData == null) return {};
  if (Buffer.isBuffer(reportData)) {
    try {
      return JSON.parse(reportData.toString('utf8'));
    } catch {
      return {};
    }
  }
  if (typeof reportData === 'string') {
    try {
      return JSON.parse(reportData);
    } catch {
      return {};
    }
  }
  if (typeof reportData === 'object') return reportData;
  return {};
}

/**
 * PDFs uploaded via "Upload Notice of Assessment" (ifta_reports) used to build this summary.
 * Uses sourceReportIds when present, matches report_data.quarters to the DB, and falls back to
 * uploads created shortly before the generated report when JSON is incomplete.
 */
async function buildSourceFilesForGeneratedReport(reportData, userId, options = {}) {
  const { reportCreatedAt } = options;
  const parsed = parseReportDataJson(reportData);
  const ids = normalizeSourceReportIds(parsed.sourceReportIds);
  let quarters = Array.isArray(parsed.quarters) ? parsed.quarters : [];
  if (quarters.length === 0 && Array.isArray(parsed.quarterSummaries)) {
    quarters = parsed.quarterSummaries;
  }

  const seen = new Set();
  const out = [];

  const pushFile = (f) => {
    const nameKey = `name:${f.fileName}|${f.quarter ?? ''}|${f.year ?? ''}`;
    if (f.id != null) {
      if (seen.has(`id:${f.id}`)) return;
      seen.add(`id:${f.id}`);
      seen.add(nameKey);
    } else {
      if (seen.has(nameKey)) return;
      seen.add(nameKey);
    }
    out.push(f);
  };

  if (ids.length > 0) {
    const src = await db.query(
      `SELECT id, file_name, quarter_label, year, file_path
       FROM ifta_reports
       WHERE id = ANY($1::int[]) AND user_id = $2
       ORDER BY year NULLS LAST, quarter_label NULLS LAST, id ASC`,
      [ids, userId]
    );
    src.rows.forEach((r) => pushFile(rowToSourceFileRow(r)));
  }

  for (const q of quarters) {
    const fileName = q.fileName || q.file_name;
    if (!fileName || fileName === '—') continue;

    const quarter = q.quarter !== undefined && q.quarter !== null ? q.quarter : null;
    const year = q.year !== undefined && q.year !== null ? q.year : null;
    const nameKey = `name:${fileName}|${quarter ?? ''}|${year ?? ''}`;
    if (seen.has(nameKey)) continue;

    let row = null;
    const strict = await db.query(
      `SELECT id, file_name, quarter_label, year, file_path
       FROM ifta_reports
       WHERE user_id = $1 AND file_name = $2
         AND (year IS NOT DISTINCT FROM $3::int)
         AND (quarter_label IS NOT DISTINCT FROM $4)
       ORDER BY id DESC
       LIMIT 1`,
      [userId, fileName, year, quarter]
    );
    if (strict.rows.length) row = strict.rows[0];
    if (!row) {
      const loose = await db.query(
        `SELECT id, file_name, quarter_label, year, file_path
         FROM ifta_reports
         WHERE user_id = $1 AND file_name = $2
         ORDER BY id DESC
         LIMIT 1`,
        [userId, fileName]
      );
      if (loose.rows.length) row = loose.rows[0];
    }

    if (row) {
      pushFile(rowToSourceFileRow(row));
    } else {
      pushFile({
        id: null,
        fileName,
        quarter,
        year,
        viewUrl: null
      });
    }
  }

  // Last resort: correlate uploads to this summary by time (when JSON lacks sourceReportIds / quarters)
  if (out.length === 0 && reportCreatedAt) {
    try {
      let fallback = await db.query(
        `SELECT id, file_name, quarter_label, year, file_path
         FROM ifta_reports
         WHERE user_id = $1
           AND file_path IS NOT NULL
           AND file_path != ''
           AND created_at >= ($2::timestamptz - interval '2 hours')
           AND created_at <= ($2::timestamptz + interval '2 minutes')
         ORDER BY created_at ASC
         LIMIT 8`,
        [userId, reportCreatedAt]
      );
      if (fallback.rows.length === 0) {
        fallback = await db.query(
          `SELECT id, file_name, quarter_label, year, file_path
           FROM (
             SELECT id, file_name, quarter_label, year, file_path, created_at
             FROM ifta_reports
             WHERE user_id = $1
               AND file_path IS NOT NULL
               AND file_path != ''
               AND created_at <= ($2::timestamptz + interval '1 minute')
               AND created_at >= ($2::timestamptz - interval '72 hours')
             ORDER BY created_at DESC
             LIMIT 4
           ) AS recent
           ORDER BY recent.created_at ASC`,
          [userId, reportCreatedAt]
        );
      }
      fallback.rows.forEach((r) => pushFile(rowToSourceFileRow(r)));
    } catch (e) {
      console.warn('buildSourceFilesForGeneratedReport fallback:', e.message);
    }
  }

  return out;
}

// Configure multer for IFTA report uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(getUploadsRoot(), 'reports');
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
    const mime = String(file.mimetype || '').toLowerCase();
    const name = String(file.originalname || '').toLowerCase();
    const looksPdf =
      mime === 'application/pdf' ||
      mime === 'application/x-pdf' ||
      (mime === 'application/octet-stream' && name.endsWith('.pdf')) ||
      name.endsWith('.pdf');
    if (looksPdf) {
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
        // Determine quarter/year using FIRST PAGE period dates (not filename)
        let quarterInfo = extractQuarterInfo(pdfData.firstPageText || '');
        // Fallback: if first page didn’t contain period dates, use full text
        if (!quarterInfo.quarter || !quarterInfo.year) {
          quarterInfo = extractQuarterInfo(pdfData.text || '');
        }
        
        // Store report in database
        const rawTextToStore = pdfData.text.length > 2000000
          ? pdfData.text.substring(0, 2000000)
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
            status: report.status
          }
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
          // Include every file in this upload batch in the combined summary. Do not drop rows with
          // short raw_text (scanned PDFs, odd layouts); jurisdiction extraction falls back to
          // AI summary.jurisdictions when raw text is missing or sparse.
          const reports = reportsResult.rows.map((r) => ({
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
            const qOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
            return (qOrder[a.quarter] || 0) - (qOrder[b.quarter] || 0);
          });

          // Generate report data
          const reportData = await generateReport(reports, user);
          reportData.sourceReportIds = reportIds;

          // Generate and save summary PDF
          const pdfBuffer = await generateSummaryPDF(reportData, user);

          // Save PDF to file
          const pdfFilename = `summary-${req.user.id}-${Date.now()}.pdf`;
          const summariesDir = path.join(getUploadsRoot(), 'summaries');
          if (!fs.existsSync(summariesDir)) {
            fs.mkdirSync(summariesDir, { recursive: true });
          }
          const pdfPath = path.join(summariesDir, pdfFilename);
          fs.writeFileSync(pdfPath, pdfBuffer);

          // Check if a report for today already exists, update it instead of creating new
          const reportName = getGeneratedReportName(user.company_name);

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
      } catch (error) {
        console.error('Error generating summary PDF:', error);
        console.error('Error stack:', error.stack);
        // Still create a basic report entry even if generation fails
        if (!generatedReportId) {
          try {
            const userResult = await db.query(
              'SELECT company_name FROM users WHERE id = $1',
              [req.user.id]
            );
            const user = userResult.rows[0];
            const reportName = getGeneratedReportName(user.company_name);
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

    // Only show quarter-age warning if the MOST RECENT quarter (among uploaded) is over 6 months old
    let showQuarterAgeWarning = false;
    const datesWithResults = results
      .filter(r => r.report && r.report.detectedDate)
      .map(r => r.report.detectedDate);
    if (datesWithResults.length > 0) {
      const mostRecentDate = new Date(Math.max(...datesWithResults.map(d => new Date(d).getTime())));
      showQuarterAgeWarning = checkReportAge(mostRecentDate);
    }

    res.json({
      message: `${req.files.length} file(s) uploaded successfully`,
      results,
      summaryPdfUrl,
      generatedReportId,
      showQuarterAgeWarning
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
    let quarterInfo = extractQuarterInfo(pdfData.firstPageText || '');
    if (!quarterInfo.quarter || !quarterInfo.year) {
      quarterInfo = extractQuarterInfo(pdfData.text || '');
    }
    
    // Check if report is older than 6 months
    const isOldReport = checkReportAge(quarterInfo.detectedDate);
    
    // Store report in database (store more text for jurisdiction extraction)
    const rawTextToStore = pdfData.text.length > 2000000
      ? pdfData.text.substring(0, 2000000)
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

// Get all reports for user (with company name from users)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.id, r.file_name, r.quarter_label, r.year, r.detected_date, r.status, r.created_at, r.summary, u.company_name
       FROM ifta_reports r
       JOIN users u ON u.id = r.user_id
       WHERE r.user_id = $1
       ORDER BY r.year DESC NULLS LAST, r.quarter_label DESC NULLS LAST, r.created_at DESC`,
      [req.user.id]
    );

    const reports = result.rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      companyName: row.company_name || '',
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

// Delete multiple reports — same base path as GET / so URL is /api/reports (no /delete-batch)
const deleteBatchHandler = async (req, res) => {
  try {
    let { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Report IDs array required' });
    }
    ids = ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Valid report IDs required' });
    }

    const result = await db.query(
      'SELECT id, file_path FROM ifta_reports WHERE id = ANY($1::int[]) AND user_id = $2',
      [ids, req.user.id]
    );

    for (const row of result.rows) {
      const resolved = resolveStoredUploadPath(row.file_path);
      if (resolved && fs.existsSync(resolved)) {
        try {
          fs.unlinkSync(resolved);
        } catch (e) {
          console.warn('Could not delete file:', resolved, e.message);
        }
      }
    }

    await db.query('DELETE FROM ifta_reports WHERE id = ANY($1::int[]) AND user_id = $2', [ids, req.user.id]);
    const deleted = result.rows.length;
    res.json({ message: `${deleted} report${deleted !== 1 ? 's' : ''} deleted successfully`, deleted });
  } catch (error) {
    console.error('Delete batch reports error:', error);
    res.status(500).json({ error: 'Failed to delete reports' });
  }
};
router.delete('/', authenticate, deleteBatchHandler);

/**
 * Stream an uploaded Notice of Assessment PDF (session cookie).
 * Required for Vercel: raw /uploads/* URLs do not reach Express static reliably.
 */
router.get('/source-file/:id', authenticate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid file id' });
    }
    const result = await db.query(
      'SELECT file_path, file_name FROM ifta_reports WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        fileId: id,
        userId: req.user?.id ?? null
      });
    }
    const { file_path: storedPath, file_name: fileName } = result.rows[0];
    const absPath = resolveStoredUploadPath(storedPath);
    const uploadRoot = getUploadsRoot();
    const base = storedPath ? path.basename(String(storedPath).replace(/\\/g, '/')) : '';
    const candidates = base
      ? [path.join(uploadRoot, 'reports', base), path.join(uploadRoot, base)]
      : [];
    const exists = !!(absPath && fs.existsSync(absPath));
    if (!absPath || !exists) {
      return res.status(404).json({
        error: 'File is no longer available on the server. Re-upload the PDF if needed.',
        fileId: id,
        fileName: fileName || null,
        storedPath: storedPath || null,
        resolvedPath: absPath || null,
        uploadRoot,
        candidates,
        exists
      });
    }
    const downloadName = (fileName && String(fileName).trim()) || path.basename(absPath) || 'notice.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.sendFile(path.resolve(absPath));
  } catch (error) {
    console.error('source-file error:', error);
    return res.status(500).json({ error: 'Failed to open file' });
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

// Rename uploaded IFTA PDF (display name only; does not change the file on disk)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { fileName } = req.body;
    if (fileName == null || typeof fileName !== 'string') {
      return res.status(400).json({ error: 'fileName is required' });
    }
    const trimmed = fileName.trim();
    if (trimmed.length < 1 || trimmed.length > 512) {
      return res.status(400).json({ error: 'fileName must be 1–512 characters' });
    }

    const result = await db.query(
      `UPDATE ifta_reports
       SET file_name = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, file_name`,
      [trimmed, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'File name updated', report: result.rows[0] });
  } catch (error) {
    console.error('Patch upload report error:', error);
    res.status(500).json({ error: 'Failed to update file name' });
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

    const resolved = resolveStoredUploadPath(result.rows[0].file_path);
    if (resolved && fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch (e) {
        console.warn('Could not delete file on disk:', e.message);
      }
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
    const { reportIds: rawReportIds, reportName } = req.body;
    const reportIds = normalizeSourceReportIds(
      Array.isArray(rawReportIds) ? rawReportIds : []
    );

    if (reportIds.length === 0) {
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

    // Generate report (persist upload IDs so Generated Reports can list Notice of Assessment PDFs)
    const reportData = await generateReport(reports, user);
    reportData.sourceReportIds = reportIds;

    // Check if report with same name exists, update instead of creating new
    const finalReportName = getGeneratedReportName(user.company_name);
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
        name: finalReportName,
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

// Get generated reports (includes source PDFs used for each summary)
router.get('/generated/list', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, report_name, created_at, updated_at, report_data
       FROM generated_reports
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const reports = await Promise.all(
      result.rows.map(async (row) => {
        let sourceFiles = [];
        try {
          sourceFiles = await buildSourceFilesForGeneratedReport(row.report_data, req.user.id, {
            reportCreatedAt: row.created_at
          });
        } catch (e) {
          console.warn('buildSourceFilesForGeneratedReport list:', e.message);
        }
        return {
          id: row.id,
          report_name: row.report_name,
          created_at: row.created_at,
          updated_at: row.updated_at,
          sourceFiles
        };
      })
    );

    res.json({ reports });
  } catch (error) {
    console.error('Get generated reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Delete multiple generated reports (must be before /generated/:id)
router.post('/generated/delete-batch', authenticate, async (req, res) => {
  try {
    let ids = req.body.ids;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Report IDs array required' });
    }
    ids = ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({ error: 'Valid report IDs required' });
    }

    const result = await db.query(
      'SELECT id, file_path FROM generated_reports WHERE id = ANY($1::int[]) AND user_id = $2',
      [ids, req.user.id]
    );

    for (const row of result.rows) {
      if (row.file_path && fs.existsSync(row.file_path)) {
        try {
          fs.unlinkSync(row.file_path);
        } catch (e) {
          console.warn('Could not delete file:', row.file_path, e.message);
        }
      }
    }

    await db.query('DELETE FROM generated_reports WHERE id = ANY($1::int[]) AND user_id = $2', [ids, req.user.id]);
    const deleted = result.rows.length;
    res.json({ message: `${deleted} report${deleted !== 1 ? 's' : ''} deleted`, deleted });
  } catch (error) {
    console.error('Delete batch generated reports error:', error);
    res.status(500).json({ error: 'Failed to delete reports' });
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

    const row = result.rows[0];
    let sourceFiles = [];
    try {
      sourceFiles = await buildSourceFilesForGeneratedReport(row.report_data, req.user.id, {
        reportCreatedAt: row.created_at
      });
    } catch (e) {
      console.warn('buildSourceFilesForGeneratedReport:', e.message);
    }

    res.json({ report: { ...row, sourceFiles } });
  } catch (error) {
    console.error('Get generated report error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Rename generated report
router.patch('/generated/:id', authenticate, async (req, res) => {
  try {
    const { reportName } = req.body;
    if (reportName == null || typeof reportName !== 'string') {
      return res.status(400).json({ error: 'reportName is required' });
    }
    const trimmed = reportName.trim();
    if (trimmed.length < 1 || trimmed.length > 255) {
      return res.status(400).json({ error: 'Report name must be 1–255 characters' });
    }

    const result = await db.query(
      `UPDATE generated_reports
       SET report_name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, report_name`,
      [trimmed, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ message: 'Report updated', report: result.rows[0] });
  } catch (error) {
    console.error('Patch generated report error:', error);
    res.status(500).json({ error: 'Failed to update report' });
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

    // Generate Excel matching IFTA SUMMARY.xlsx (project root or cwd)
    const templatePath = fs.existsSync(path.join(process.cwd(), 'IFTA SUMMARY.xlsx'))
      ? path.join(process.cwd(), 'IFTA SUMMARY.xlsx')
      : path.join(__dirname, '..', '..', 'IFTA SUMMARY.xlsx');
    const workbook = generateTemplateExcel(reportData, fs.existsSync(templatePath) ? templatePath : null);

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

// Download report as PDF (summary first, then source PDFs in chronological order)
router.get('/generated/:id/pdf', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT gr.id, gr.report_name, gr.report_data, gr.created_at, u.company_name, u.logo_url, 
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
      : report.report_data || {};

    // PDF = screen-matching layout (report name, 4 cards, jurisdiction table + Grand Total, Top 15) via pdfkit
    const summaryBuffer = await generateReportPrintPdf(report, reportData, {});

    let sourceReportIds = normalizeSourceReportIds(reportData.sourceReportIds || []);
    if (sourceReportIds.length === 0) {
      try {
        const built = await buildSourceFilesForGeneratedReport(reportData, req.user.id, {
          reportCreatedAt: report.created_at
        });
        sourceReportIds = built.map((f) => f.id).filter((id) => id != null);
      } catch (e) {
        console.warn('buildSourceFilesForGeneratedReport (download pdf):', e.message);
      }
    }

    let finalBuffer = summaryBuffer;

    if (sourceReportIds.length > 0) {
      const sourceResult = await db.query(
        `SELECT id, file_path, file_name, year, quarter_label, detected_date
         FROM ifta_reports
         WHERE id = ANY($1::int[]) AND user_id = $2 AND file_path IS NOT NULL AND file_path != ''`,
        [sourceReportIds, req.user.id]
      );

      if (sourceResult.rows.length > 0) {
        // Sort chronologically: oldest to newest (year asc, quarter asc, detected_date asc)
        const qOrder = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4 };
        sourceResult.rows.sort((a, b) => {
          const yearA = a.year ?? 0;
          const yearB = b.year ?? 0;
          if (yearA !== yearB) return yearA - yearB;
          const qA = qOrder[a.quarter_label] ?? 0;
          const qB = qOrder[b.quarter_label] ?? 0;
          if (qA !== qB) return qA - qB;
          const dateA = a.detected_date ? new Date(a.detected_date).getTime() : 0;
          const dateB = b.detected_date ? new Date(b.detected_date).getTime() : 0;
          return dateA - dateB;
        });

        const mergedPdf = await PDFDocument.create();

        // 1) Summary pages first — add disclaimer to bottom of first page
        const summaryDoc = await PDFDocument.load(summaryBuffer);
        const font = await summaryDoc.embedStandardFont(StandardFonts.Helvetica);
        const fontBold = await summaryDoc.embedStandardFont(StandardFonts.HelveticaBold);
        const firstPage = summaryDoc.getPage(0);
        // Disclaimer at bottom of first page (y from bottom)
        let y = 32;
        firstPage.drawText('Source Reports', { x: 50, y, size: 10, font: fontBold });
        y += 16;
        firstPage.drawText('Chronological (Oldest to Newest)', { x: 50, y, size: 9, font });
        y += 14;
        firstPage.drawText('The following pages are the uploaded IFTA reports used to generate the summary above.', { x: 50, y, size: 8, font });
        y += 18;
        for (const row of sourceResult.rows) {
          const label = [row.quarter_label, row.year].filter(Boolean).join(' ') || 'Report';
          const name = row.file_name || `Report ${row.id}`;
          firstPage.drawText(`• ${label} — ${name}`, { x: 50, y, size: 8, font });
          y += 14;
        }

        const summaryPageCount = summaryDoc.getPageCount();
        const summaryIndices = Array.from({ length: summaryPageCount }, (_, i) => i);
        const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryIndices);
        summaryPages.forEach(p => mergedPdf.addPage(p));

        // 2) Add a "Source Reports" divider page listing uploaded files (chronological)
        const dividerPage = mergedPdf.addPage([612, 792]);
        const helvetica = await mergedPdf.embedStandardFont(StandardFonts.Helvetica);
        const helveticaBold = await mergedPdf.embedStandardFont(StandardFonts.HelveticaBold);
        const pageHeight = 792;
        const marginPx = 50;
        let divY = pageHeight - marginPx;
        dividerPage.drawText('Source Reports', { x: marginPx, y: divY, size: 16, font: helveticaBold });
        divY -= 24;
        dividerPage.drawText('The following uploaded files (in chronological order) were used to generate the summary above.', { x: marginPx, y: divY, size: 10, font: helvetica });
        divY -= 20;
        dividerPage.drawText('Each document appears on the subsequent pages in the order listed below.', { x: marginPx, y: divY, size: 10, font: helvetica });
        divY -= 28;
        for (let i = 0; i < sourceResult.rows.length; i++) {
          const row = sourceResult.rows[i];
          const label = [row.quarter_label, row.year].filter(Boolean).join(' ') || 'Report';
          const name = row.file_name || `Report ${row.id}`;
          dividerPage.drawText(`${i + 1}. ${label} — ${name}`, { x: marginPx, y: divY, size: 10, font: helvetica });
          divY -= 18;
        }

        // 3) Append each source PDF in chronological order (on subsequent pages)
        for (const row of sourceResult.rows) {
          const filePath = resolveStoredUploadPath(row.file_path);
          if (!filePath || !fs.existsSync(filePath)) continue;
          try {
            const bytes = fs.readFileSync(filePath);
            const doc = await PDFDocument.load(bytes);
            const pageCount = doc.getPageCount();
            const indices = Array.from({ length: pageCount }, (_, i) => i);
            const pages = await mergedPdf.copyPages(doc, indices);
            pages.forEach(p => mergedPdf.addPage(p));
          } catch (err) {
            console.warn('Could not merge source PDF:', row.file_path, err.message);
          }
        }

        finalBuffer = Buffer.from(await mergedPdf.save());
      }
    }

    const filename = 'IFTA Summary.PDF';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.send(finalBuffer);
  } catch (error) {
    console.error('Download PDF error:', error);
    res.status(500).json({ error: 'Failed to generate PDF file' });
  }
});

module.exports = router;
