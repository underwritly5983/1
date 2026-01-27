const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const { parsePDF, extractQuarterInfo } = require('../services/pdfParser');
const { summarizeIFTAReport, checkReportAge } = require('../services/aiService');
const { generateReport } = require('../services/reportGenerator');

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
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Upload IFTA report
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
    
    // Store report in database
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
        pdfData.text.substring(0, 50000), // Store first 50k chars
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

    // Get all reports
    const reportsResult = await db.query(
      `SELECT id, file_name, quarter_label, year, summary, detected_date
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
      detectedDate: r.detected_date
    }));

    // Sort chronologically
    reports.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const qOrder = { 'Q1': 1, 'Q2': 2, 'Q3': 3, 'Q4': 4 };
      return (qOrder[a.quarter] || 0) - (qOrder[b.quarter] || 0);
    });

    // Generate report
    const reportData = await generateReport(reports, user);

    // Save generated report
    const saveResult = await db.query(
      `INSERT INTO generated_reports (user_id, report_name, report_data, template_used)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [req.user.id, reportName || 'IFTA Summary Report', JSON.stringify(reportData), 'default']
    );

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
      `SELECT id, report_name, report_data, created_at, updated_at
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

module.exports = router;
