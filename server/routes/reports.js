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

function normalizeQuarterLabelForMatch(q) {
  if (q == null) return null;
  const s = String(q).trim().toUpperCase();
  if (/^Q[1-4]$/.test(s)) return s;
  const m = s.match(/^Q?([1-4])$/);
  return m ? `Q${m[1]}` : null;
}

function sameIftaPeriodRow(a, b) {
  const ya = a.year != null ? Number(a.year) : null;
  const yb = b.year != null ? Number(b.year) : null;
  if (ya == null || yb == null || ya !== yb) return false;
  const qa = normalizeQuarterLabelForMatch(a.quarter_label ?? a.quarter);
  const qb = normalizeQuarterLabelForMatch(b.quarter_label ?? b.quarter);
  return Boolean(qa && qb && qa === qb);
}

function sortIftaRowsChronologically(rows) {
  const qOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
  return [...rows].sort((a, b) => {
    const yA = a.year ?? 0;
    const yB = b.year ?? 0;
    if (yA !== yB) return yA - yB;
    return (qOrder[a.quarter_label] || 0) - (qOrder[b.quarter_label] || 0);
  });
}

function parseAcceptancePairMap(reportData) {
  const parsed = parseReportDataJson(reportData);
  const raw = parsed.acceptanceReassessmentBySourceId;
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const sid = parseInt(k, 10);
    const aid = parseInt(v, 10);
    if (!Number.isNaN(sid) && !Number.isNaN(aid)) out[sid] = aid;
  }
  return out;
}

async function buildAcceptanceAttachmentsForReport(reportData, userId, sourceFiles) {
  const pairs = parseAcceptancePairMap(reportData);
  const accIds = [...new Set(Object.values(pairs))];
  let byId = new Map();
  if (accIds.length > 0) {
    const accResult = await db.query(
      `SELECT id, file_name, quarter_label, year
       FROM ifta_reports
       WHERE id = ANY($1::int[]) AND user_id = $2
         AND document_kind = 'acceptance_reassessment'`,
      [accIds, userId]
    );
    byId = new Map(accResult.rows.map((r) => [r.id, r]));
  }
  return (sourceFiles || []).map((sf) => {
    const aid = sf.id != null ? pairs[sf.id] : null;
    const r = aid != null ? byId.get(aid) : null;
    return {
      sourceReportId: sf.id,
      quarter: sf.quarter,
      year: sf.year,
      acceptance: r
        ? {
            id: r.id,
            fileName: r.file_name,
            quarter: r.quarter_label,
            year: r.year,
            viewUrl: sourceFileViewUrl(r.id),
          }
        : null,
    };
  });
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

function normalizeQuarterLabelForCoverage(q) {
  if (q == null) return null;
  const s = String(q).trim().toUpperCase();
  if (['Q1', 'Q2', 'Q3', 'Q4'].includes(s)) return s;
  const m = s.match(/^Q?([1-4])$/);
  return m ? `Q${m[1]}` : null;
}

/** Single calendar quarter on a fixed timeline (Q1=0 .. Q4=3 per year). */
function quarterCoverageSerial(year, qLabel) {
  const q = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 }[qLabel];
  if (q == null || year == null || Number.isNaN(Number(year))) return null;
  return Number(year) * 4 + q;
}

function areFourConsecutiveQuarterSerials(serials) {
  const valid = serials.filter((s) => s != null);
  if (valid.length !== 4) return false;
  const s = [...valid].sort((a, b) => a - b);
  for (let i = 1; i < 4; i += 1) {
    if (s[i] !== s[i - 1] + 1) return false;
  }
  return true;
}

/**
 * IFTA workflow expects up to four uploads that represent four *consecutive* calendar quarters
 * (may span years, e.g. Q4 2024 + Q1–Q3 2025). Not "Q1–Q4 within each calendar year."
 */
function buildQuarterCoverage(results) {
  const successful = (results || []).filter((r) => r.report && !r.error);
  const undetectedFiles = [];
  const pairRows = [];

  for (const r of successful) {
    const rawQ = r.report.quarter;
    const y = r.report.year;
    const q = normalizeQuarterLabelForCoverage(rawQ);
    if (!q || y == null || Number.isNaN(Number(y))) {
      if (r.fileName) undetectedFiles.push(r.fileName);
      continue;
    }
    pairRows.push({ year: Number(y), quarter: q, fileName: r.fileName });
  }

  const uniqueKey = new Map();
  for (const row of pairRows) {
    const k = `${row.year}|${row.quarter}`;
    if (!uniqueKey.has(k)) uniqueKey.set(k, row);
  }
  const uniqueRows = [...uniqueKey.values()];
  const possibleDuplicateUpload = pairRows.length > uniqueRows.length;

  const serials = uniqueRows.map((row) => quarterCoverageSerial(row.year, row.quarter));
  const distinctCount = uniqueRows.length;
  const uploadCount = successful.length;

  const messages = [];

  if (undetectedFiles.length) {
    messages.push(
      `Quarter or year could not be read from: ${undetectedFiles.join(', ')}. Try a clearer PDF or check the Notice of Assessment.`
    );
  }
  if (possibleDuplicateUpload) {
    messages.push(
      'More than one file may map to the same quarter and year. Remove duplicates or use one PDF per quarter.'
    );
  }

  let hasIssue = undetectedFiles.length > 0 || possibleDuplicateUpload;

  if (!hasIssue && distinctCount === 4 && areFourConsecutiveQuarterSerials(serials)) {
    return {
      years: [],
      undetectedFiles,
      possibleDuplicateUpload: false,
      message: null,
      hasIssue: false,
    };
  }

  if (!hasIssue && distinctCount === 0 && uploadCount === 0) {
    return {
      years: [],
      undetectedFiles: [],
      possibleDuplicateUpload: false,
      message: null,
      hasIssue: false,
    };
  }

  if (distinctCount < 4 && undetectedFiles.length === 0 && !possibleDuplicateUpload) {
    messages.push(
      `Only ${distinctCount} distinct quarter period(s) could be detected${uploadCount > distinctCount ? ` from ${uploadCount} file(s)` : ''}. Upload four consecutive quarterly IFTA notices (or fix PDFs missing a clear period).`
    );
    hasIssue = true;
  } else if (distinctCount === 4 && !areFourConsecutiveQuarterSerials(serials)) {
    messages.push(
      'The four reports are not four consecutive calendar quarters (for example Q4 2024 through Q3 2025, or Q1–Q4 within one year). Check each PDF’s detected period or upload a consecutive run.'
    );
    hasIssue = true;
  } else if (distinctCount > 4) {
    messages.push('More than four distinct quarter periods were detected. Use at most four PDFs for one consecutive run.');
    hasIssue = true;
  }

  return {
    years: [],
    undetectedFiles,
    possibleDuplicateUpload,
    message: messages.length ? messages.join(' ') : null,
    hasIssue,
  };
}

async function computeShowQuarterAgeWarningForGeneratedReport(reportData, userId) {
  try {
    const ids = normalizeSourceReportIds(parseReportDataJson(reportData).sourceReportIds || []);
    if (ids.length === 0) return false;
    const r = await db.query(
      `SELECT MAX(detected_date) AS d FROM ifta_reports WHERE id = ANY($1::int[]) AND user_id = $2`,
      [ids, userId]
    );
    const d = r.rows[0]?.d;
    return checkReportAge(d) === true;
  } catch (e) {
    console.warn('computeShowQuarterAgeWarningForGeneratedReport:', e.message);
    return false;
  }
}

/**
 * PDFs uploaded via "Upload Notice of Assessment" (ifta_reports) used to build this summary.
 * When report_data includes sourceReportIds as an array, that list is authoritative (including []).
 * Legacy rows without that property resolve from embedded quarters and/or a created_at time window.
 */
async function buildSourceFilesForGeneratedReport(reportData, userId, options = {}) {
  const { reportCreatedAt } = options;
  const parsed = parseReportDataJson(reportData);
  const hasExplicitSourceIds =
    Object.prototype.hasOwnProperty.call(parsed, 'sourceReportIds') && Array.isArray(parsed.sourceReportIds);

  /**
   * When report_data includes sourceReportIds as an array (including []), that list is authoritative.
   * Otherwise empty [] was treated like "missing" and legacy filename / time-window fallbacks repopulated
   * the UI with unrelated uploads after deletes.
   */
  if (hasExplicitSourceIds) {
    const ids = normalizeSourceReportIds(parsed.sourceReportIds);
    if (ids.length === 0) {
      return [];
    }
    const src = await db.query(
      `SELECT id, file_name, quarter_label, year, file_path
       FROM ifta_reports
       WHERE id = ANY($1::int[]) AND user_id = $2
         AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')`,
      [ids, userId]
    );
    const byId = new Map(src.rows.map((r) => [r.id, rowToSourceFileRow(r)]));
    const ordered = [];
    for (const raw of ids) {
      const id = typeof raw === 'number' ? raw : parseInt(raw, 10);
      if (Number.isNaN(id)) continue;
      const row = byId.get(id);
      if (row) ordered.push(row);
    }
    return ordered;
  }

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

  const createdBeforeReport = reportCreatedAt || null;

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
         AND ($5::timestamptz IS NULL OR created_at <= $5::timestamptz)
         AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')
       ORDER BY id DESC
       LIMIT 1`,
      [userId, fileName, year, quarter, createdBeforeReport]
    );
    if (strict.rows.length) row = strict.rows[0];
    if (!row) {
      const loose = await db.query(
        `SELECT id, file_name, quarter_label, year, file_path
         FROM ifta_reports
         WHERE user_id = $1 AND file_name = $2
           AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)
           AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')
         ORDER BY id DESC
         LIMIT 1`,
        [userId, fileName, createdBeforeReport]
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
           AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')
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
               AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')
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

/**
 * Rewrite summary PDF + report_data for a generated report from Notice of Assessment IDs (max 4 after sort).
 * Preserves acceptance/reassessment pairings for source IDs that remain.
 */
async function finalizeGeneratedReportUpdate(userId, generatedReportId, reportData, previousFilePath) {
  const userResult = await db.query(
    'SELECT company_name, logo_url, brand_color_primary, brand_color_secondary FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw new Error('User not found');
  const pdfBuffer = await generateSummaryPDF(reportData, user);
  const pdfFilename = `summary-${userId}-${generatedReportId}-${Date.now()}.pdf`;
  const summariesDir = path.join(getUploadsRoot(), 'summaries');
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true });
  }
  const pdfPath = path.join(summariesDir, pdfFilename);
  fs.writeFileSync(pdfPath, pdfBuffer);
  if (previousFilePath) {
    const prev = resolveStoredUploadPath(previousFilePath);
    if (prev && fs.existsSync(prev) && prev !== pdfPath) {
      try {
        fs.unlinkSync(prev);
      } catch (_) {
        /* ignore */
      }
    }
  }
  await db.query(
    `UPDATE generated_reports SET report_data = $1, file_path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4`,
    [JSON.stringify(reportData), pdfPath, generatedReportId, userId]
  );
}

async function persistGeneratedReportFromSources(userId, generatedRow, sourceReportIds) {
  const userResult = await db.query(
    'SELECT company_name, logo_url, brand_color_primary, brand_color_secondary FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw new Error('User not found');

  const normalized = [...new Set(normalizeSourceReportIds(sourceReportIds))];
  const oldPairs = parseAcceptancePairMap(generatedRow.report_data);

  if (normalized.length === 0) {
    const reportData = await generateReport([], user);
    reportData.sourceReportIds = [];
    reportData.acceptanceReassessmentBySourceId = {};
    await finalizeGeneratedReportUpdate(userId, generatedRow.id, reportData, generatedRow.file_path);
    return;
  }

  const reportsResult = await db.query(
    `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
     FROM ifta_reports
     WHERE id = ANY($1::int[]) AND user_id = $2
       AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')`,
    [normalized, userId]
  );
  const sorted = sortIftaRowsChronologically(reportsResult.rows);
  const capped = sorted.slice(0, 4);
  const idsOrdered = capped.map((r) => r.id);

  const reports = capped.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    quarter: r.quarter_label,
    year: r.year,
    summary: r.summary || { summary: 'Processing...', jurisdictions: [] },
    detectedDate: r.detected_date,
    rawText: r.raw_text,
  }));

  const reportData = await generateReport(reports, user);
  reportData.sourceReportIds = idsOrdered;

  const nextAcc = {};
  for (const sid of idsOrdered) {
    if (oldPairs[sid]) nextAcc[String(sid)] = oldPairs[sid];
  }
  reportData.acceptanceReassessmentBySourceId = nextAcc;

  await finalizeGeneratedReportUpdate(userId, generatedRow.id, reportData, generatedRow.file_path);
}

async function regenerateAffectedGeneratedReports(userId, deletedIds) {
  const deletedSet = new Set(
    deletedIds.map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n))
  );
  if (deletedSet.size === 0) return;
  const gr = await db.query(
    `SELECT id, report_data, file_path FROM generated_reports WHERE user_id = $1`,
    [userId]
  );
  for (const row of gr.rows) {
    const parsed = parseReportDataJson(row.report_data);
    const ids = normalizeSourceReportIds(parsed.sourceReportIds || []);
    const affected = ids.some((id) => deletedSet.has(id));
    if (!affected) continue;
    const newIds = ids.filter((id) => !deletedSet.has(id));
    try {
      await persistGeneratedReportFromSources(userId, row, newIds);
    } catch (e) {
      console.error('regenerateAffectedGeneratedReports:', e.message);
    }
  }
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
        return res.status(400).json({
          error: 'Maximum 4 files allowed per upload (4 PDFs total).',
          code: 'LIMIT_FILE_COUNT',
        });
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
        const fileBytes = fs.readFileSync(filePath);

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
          `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status, file_blob)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
            'processing',
            fileBytes,
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

    const quarterCoverage = buildQuarterCoverage(results);

    res.json({
      message: `${req.files.length} file(s) uploaded successfully`,
      results,
      summaryPdfUrl,
      generatedReportId,
      showQuarterAgeWarning,
      quarterCoverage,
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
    const fileBytes = fs.readFileSync(filePath);

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
      `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status, file_blob)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        'processing',
        fileBytes,
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
         AND (r.document_kind IS NULL OR r.document_kind = 'notice_of_assessment')
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
    await regenerateAffectedGeneratedReports(req.user.id, ids);
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
      'SELECT file_path, file_name, file_blob FROM ifta_reports WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        fileId: id,
        userId: req.user?.id ?? null
      });
    }
    const { file_path: storedPath, file_name: fileName, file_blob: fileBlob } = result.rows[0];

    // Prefer DB-stored bytes (durable on Vercel); fall back to disk.
    if (fileBlob && (Buffer.isBuffer(fileBlob) || fileBlob instanceof Uint8Array)) {
      const buf = Buffer.from(fileBlob);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${String(fileName || 'notice.pdf').replace(/"/g, '')}"`);
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.send(buf);
    }
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
    // Read once so we can opportunistically persist into file_blob for future requests.
    const bytes = fs.readFileSync(absPath);
    try {
      await db.query(
        'UPDATE ifta_reports SET file_blob = $1 WHERE id = $2 AND user_id = $3',
        [bytes, id, req.user.id]
      );
    } catch (_) {
      // Non-fatal: file may still be served from disk.
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.send(bytes);
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

    const deletedId = parseInt(req.params.id, 10);
    await db.query('DELETE FROM ifta_reports WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    await regenerateAffectedGeneratedReports(req.user.id, [deletedId]);

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

// Add Notice of Assessment PDFs to an existing generated summary (at most 4 source PDFs per summary).
router.post(
  '/generated/:id/add-source-pdfs',
  authenticate,
  (req, res, next) => {
    upload.array('files', 4)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Maximum 4 PDFs per request.',
            code: 'LIMIT_FILE_COUNT',
          });
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
  },
  async (req, res) => {
    try {
      const generatedId = parseInt(req.params.id, 10);
      if (Number.isNaN(generatedId)) {
        return res.status(400).json({ error: 'Invalid report id' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const gr = await db.query(
        `SELECT id, report_data, file_path FROM generated_reports WHERE id = $1 AND user_id = $2`,
        [generatedId, req.user.id]
      );
      if (gr.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const reportDataObj =
        typeof gr.rows[0].report_data === 'string'
          ? JSON.parse(gr.rows[0].report_data)
          : gr.rows[0].report_data || {};
      const currentIds = normalizeSourceReportIds(reportDataObj.sourceReportIds || []);
      const slots = 4 - currentIds.length;
      if (slots <= 0) {
        return res.status(400).json({
          error:
            'This summary already has 4 Notice of Assessment PDFs. Delete one to upload a replacement.',
        });
      }
      if (req.files.length > slots) {
        return res.status(400).json({
          error: `You can add at most ${slots} more PDF(s) (4 per summary total).`,
          code: 'LIMIT_FILE_COUNT',
        });
      }

      const newReportIds = [];
      for (const file of req.files) {
        try {
          const filePath = file.path;
          const fileName = file.originalname;
          const fileSize = file.size;
          const fileBytes = fs.readFileSync(filePath);
          const pdfData = await parsePDF(filePath);
          let quarterInfo = extractQuarterInfo(pdfData.firstPageText || '');
          if (!quarterInfo.quarter || !quarterInfo.year) {
            quarterInfo = extractQuarterInfo(pdfData.text || '');
          }
          const rawTextToStore =
            pdfData.text.length > 2000000 ? pdfData.text.substring(0, 2000000) : pdfData.text;

          const result = await db.query(
            `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status, file_blob)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
              'processing',
              fileBytes,
            ]
          );
          const report = result.rows[0];
          newReportIds.push(report.id);

          await db.query(
            'INSERT INTO usage_analytics (user_id, event_type, event_data) VALUES ($1, $2, $3)',
            [req.user.id, 'report_uploaded', JSON.stringify({ reportId: report.id, fileName })]
          );

          summarizeIFTAReport(pdfData.text, quarterInfo.quarter, quarterInfo.year)
            .then(async (summary) => {
              await db.query(
                'UPDATE ifta_reports SET summary = $1, status = $2 WHERE id = $3',
                [JSON.stringify(summary), 'completed', report.id]
              );
            })
            .catch(async (error) => {
              console.error(`Summary processing error for report ${report.id}:`, error);
              await db.query('UPDATE ifta_reports SET status = $1 WHERE id = $2', ['completed', report.id]);
            });
        } catch (error) {
          console.error(`Error processing ${file.originalname}:`, error);
          return res.status(400).json({
            error: error.message || `Failed to process ${file.originalname}`,
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));

      let reportsResult = await db.query(
        `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
         FROM ifta_reports
         WHERE id = ANY($1::int[]) AND user_id = $2`,
        [newReportIds, req.user.id]
      );

      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        const hasRawText = reportsResult.rows.some((r) => r.raw_text && r.raw_text.length > 100);
        const allCompleted = reportsResult.rows.every((r) => r.status === 'completed' && r.summary);
        if (hasRawText || allCompleted || attempts >= maxAttempts - 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts += 1;
        reportsResult = await db.query(
          `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
           FROM ifta_reports
           WHERE id = ANY($1::int[]) AND user_id = $2`,
          [newReportIds, req.user.id]
        );
      }

      const mergedIds = [...currentIds, ...newReportIds];
      await persistGeneratedReportFromSources(req.user.id, gr.rows[0], mergedIds);

      res.json({
        message: 'Summary updated with new Notice of Assessment PDF(s).',
        generatedReportId: generatedId,
        addedIds: newReportIds,
      });
    } catch (error) {
      console.error('Add source PDFs error:', error);
      res.status(500).json({ error: error.message || 'Failed to update summary' });
    }
  }
);

// Upload up to 4 Notice of Acceptance/Reassessment PDFs; matched to Notice of Assessment by quarter/year; appended after each NOA on Download Report PDF only.
router.post(
  '/generated/:id/acceptance-upload',
  authenticate,
  (req, res, next) => {
    upload.array('files', 4)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            error: 'Maximum 4 Notice of Acceptance/Reassessment PDFs per upload.',
            code: 'LIMIT_FILE_COUNT',
          });
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
  },
  async (req, res) => {
    try {
      const generatedId = parseInt(req.params.id, 10);
      if (Number.isNaN(generatedId)) {
        return res.status(400).json({ error: 'Invalid report id' });
      }
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const gr = await db.query(
        `SELECT id, report_data FROM generated_reports WHERE id = $1 AND user_id = $2`,
        [generatedId, req.user.id]
      );
      if (gr.rows.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const reportDataObj =
        typeof gr.rows[0].report_data === 'string'
          ? JSON.parse(gr.rows[0].report_data)
          : gr.rows[0].report_data || {};
      const sourceIds = normalizeSourceReportIds(reportDataObj.sourceReportIds || []);
      if (sourceIds.length === 0) {
        return res.status(400).json({
          error:
            'This summary has no linked Notice of Assessment uploads. Regenerate the report from uploaded IFTAs first.',
        });
      }

      const oldPairs = parseAcceptancePairMap(gr.rows[0].report_data);
      const oldAccIds = [...new Set(Object.values(oldPairs))].filter((n) => !Number.isNaN(n));
      if (oldAccIds.length > 0) {
        await db.query(
          `DELETE FROM ifta_reports
           WHERE id = ANY($1::int[]) AND user_id = $2 AND document_kind = 'acceptance_reassessment'`,
          [oldAccIds, req.user.id]
        );
      }

      const srcRes = await db.query(
        `SELECT id, quarter_label, year
         FROM ifta_reports
         WHERE id = ANY($1::int[]) AND user_id = $2
           AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')`,
        [sourceIds, req.user.id]
      );
      if (srcRes.rows.length === 0) {
        return res.status(400).json({ error: 'Notice of Assessment source files were not found. Re-upload your IFTAs.' });
      }
      const sortedSources = sortIftaRowsChronologically(srcRes.rows);

      const uploadedMeta = [];
      const fileResults = [];

      for (const file of req.files) {
        const filePath = file.path;
        const fileName = file.originalname;
        const fileSize = file.size;
        try {
          const fileBytes = fs.readFileSync(filePath);
          const pdfData = await parsePDF(filePath);
          let quarterInfo = extractQuarterInfo(pdfData.firstPageText || '');
          if (!quarterInfo.quarter || !quarterInfo.year) {
            quarterInfo = extractQuarterInfo(pdfData.text || '');
          }
          if (!quarterInfo.quarter || !quarterInfo.year) {
            fileResults.push({
              fileName,
              error: 'Could not detect quarter and year on this PDF. Use a file that shows the IFTA period clearly.',
            });
            continue;
          }
          const rawTextToStore =
            pdfData.text.length > 2000000 ? pdfData.text.substring(0, 2000000) : pdfData.text;

          const ins = await db.query(
            `INSERT INTO ifta_reports (
               user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date,
               raw_text, status, file_blob, document_kind
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, quarter_label, year`,
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
              'completed',
              fileBytes,
              'acceptance_reassessment',
            ]
          );
          const row = ins.rows[0];
          uploadedMeta.push({
            id: row.id,
            quarter_label: row.quarter_label,
            year: row.year,
          });
          fileResults.push({
            fileName,
            report: {
              id: row.id,
              quarter: row.quarter_label,
              year: row.year,
            },
          });
        } catch (e) {
          console.error('acceptance-upload file error:', e);
          fileResults.push({ fileName, error: e.message || 'Failed to process file' });
        }
      }

      if (uploadedMeta.length === 0) {
        return res.status(400).json({
          error: 'No valid Notice of Acceptance/Reassessment files could be saved.',
          results: fileResults,
        });
      }

      const pool = uploadedMeta.slice();
      const pairs = {};
      const unmatchedSources = [];
      for (const src of sortedSources) {
        const idx = pool.findIndex((u) => sameIftaPeriodRow(src, u));
        if (idx >= 0) {
          pairs[src.id] = pool[idx].id;
          pool.splice(idx, 1);
        } else {
          unmatchedSources.push([src.quarter_label, src.year].filter(Boolean).join(' ') || `id ${src.id}`);
        }
      }

      const nextData = {
        ...reportDataObj,
        acceptanceReassessmentBySourceId: Object.fromEntries(
          Object.entries(pairs).map(([k, v]) => [String(k), v])
        ),
      };

      await db.query(
        `UPDATE generated_reports SET report_data = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
        [JSON.stringify(nextData), generatedId, req.user.id]
      );

      res.json({
        message: 'Notice of Acceptance/Reassessment files saved.',
        acceptanceReassessmentBySourceId: nextData.acceptanceReassessmentBySourceId,
        results: fileResults,
        unmatchedSourcePeriods: unmatchedSources,
        unmatchedAcceptanceUploads: pool.map((u) => [u.quarter_label, u.year].filter(Boolean).join(' ')),
      });
    } catch (error) {
      console.error('acceptance-upload error:', error);
      res.status(500).json({ error: 'Failed to save acceptance/reassessment files' });
    }
  }
);

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

    let acceptanceAttachments = [];
    try {
      acceptanceAttachments = await buildAcceptanceAttachmentsForReport(
        row.report_data,
        req.user.id,
        sourceFiles
      );
    } catch (e) {
      console.warn('buildAcceptanceAttachmentsForReport:', e.message);
    }

    let showQuarterAgeWarning = false;
    try {
      showQuarterAgeWarning = await computeShowQuarterAgeWarningForGeneratedReport(row.report_data, req.user.id);
    } catch (e) {
      console.warn('computeShowQuarterAgeWarningForGeneratedReport:', e.message);
    }

    res.json({
      report: { ...row, sourceFiles, acceptanceAttachments, showQuarterAgeWarning },
    });
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
        `SELECT id, file_path, file_blob, file_name, year, quarter_label, detected_date, document_kind
         FROM ifta_reports
         WHERE id = ANY($1::int[]) AND user_id = $2
           AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')
           AND (file_blob IS NOT NULL OR (file_path IS NOT NULL AND file_path != ''))`,
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

        const acceptancePairMap = parseAcceptancePairMap(reportData);
        const accIdsFromPairs = [...new Set(Object.values(acceptancePairMap))];
        let accById = new Map();
        if (accIdsFromPairs.length > 0) {
          const accRes = await db.query(
            `SELECT id, file_path, file_blob, file_name, year, quarter_label, detected_date
             FROM ifta_reports
             WHERE id = ANY($1::int[]) AND user_id = $2
               AND document_kind = 'acceptance_reassessment'
               AND (file_blob IS NOT NULL OR (file_path IS NOT NULL AND file_path != ''))`,
            [accIdsFromPairs, req.user.id]
          );
          accById = new Map(accRes.rows.map((r) => [r.id, r]));
        }

        const mergedPdf = await PDFDocument.create();

        const loadPdfBytes = (row) => {
          if (!row) return null;
          if (row.file_blob) return Buffer.from(row.file_blob);
          const fp = resolveStoredUploadPath(row.file_path);
          if (!fp || !fs.existsSync(fp)) return null;
          return fs.readFileSync(fp);
        };

        // 1) Summary pages first — add disclaimer to bottom of first page
        const summaryDoc = await PDFDocument.load(summaryBuffer);
        const font = await summaryDoc.embedStandardFont(StandardFonts.Helvetica);
        const fontBold = await summaryDoc.embedStandardFont(StandardFonts.HelveticaBold);
        const firstPage = summaryDoc.getPage(0);
        // Disclaimer at bottom of first page (y from bottom)
        let y = 28;
        firstPage.drawText('Source documents (download bundle)', { x: 50, y, size: 10, font: fontBold });
        y += 14;
        firstPage.drawText('Chronological by quarter. For each period: Notice of Assessment, then Notice of Acceptance/Reassessment when provided.', { x: 50, y, size: 8, font });
        y += 16;
        for (const row of sourceResult.rows) {
          const label = [row.quarter_label, row.year].filter(Boolean).join(' ') || 'Report';
          const name = row.file_name || `Report ${row.id}`;
          firstPage.drawText(`• ${label} — Notice of Assessment: ${name}`, { x: 50, y, size: 7, font });
          y += 12;
          const accId = acceptancePairMap[row.id];
          if (accId && accById.has(accId)) {
            const ar = accById.get(accId);
            firstPage.drawText(`  → Notice of Acceptance/Reassessment: ${ar.file_name || `File ${ar.id}`}`, {
              x: 50,
              y,
              size: 7,
              font,
            });
            y += 12;
          }
          y += 4;
        }

        const summaryPageCount = summaryDoc.getPageCount();
        const summaryIndices = Array.from({ length: summaryPageCount }, (_, i) => i);
        const summaryPages = await mergedPdf.copyPages(summaryDoc, summaryIndices);
        summaryPages.forEach((p) => mergedPdf.addPage(p));

        // 2) Divider page
        const dividerPage = mergedPdf.addPage([612, 792]);
        const helvetica = await mergedPdf.embedStandardFont(StandardFonts.Helvetica);
        const helveticaBold = await mergedPdf.embedStandardFont(StandardFonts.HelveticaBold);
        const pageHeight = 792;
        const marginPx = 50;
        let divY = pageHeight - marginPx;
        dividerPage.drawText('Source documents', { x: marginPx, y: divY, size: 16, font: helveticaBold });
        divY -= 22;
        dividerPage.drawText(
          'Per quarter: Notice of Assessment PDF, then the matching Notice of Acceptance/Reassessment PDF (when uploaded).',
          { x: marginPx, y: divY, size: 10, font: helvetica }
        );
        divY -= 22;
        for (let i = 0; i < sourceResult.rows.length; i++) {
          const row = sourceResult.rows[i];
          const label = [row.quarter_label, row.year].filter(Boolean).join(' ') || 'Report';
          const name = row.file_name || `Report ${row.id}`;
          dividerPage.drawText(`${i + 1}. ${label} — Notice of Assessment: ${name}`, { x: marginPx, y: divY, size: 10, font: helvetica });
          divY -= 16;
          const accId = acceptancePairMap[row.id];
          if (accId && accById.has(accId)) {
            const ar = accById.get(accId);
            dividerPage.drawText(`   Then — Acceptance/Reassessment: ${ar.file_name || `File ${ar.id}`}`, {
              x: marginPx,
              y: divY,
              size: 9,
              font: helvetica,
            });
            divY -= 14;
          }
          divY -= 6;
        }

        // 3) Append each Notice of Assessment, then its matched Acceptance/Reassessment (same quarter/year)
        for (const row of sourceResult.rows) {
          try {
            const bytes = loadPdfBytes(row);
            if (bytes) {
              const doc = await PDFDocument.load(bytes);
              const pageCount = doc.getPageCount();
              const indices = Array.from({ length: pageCount }, (_, i) => i);
              const pages = await mergedPdf.copyPages(doc, indices);
              pages.forEach((p) => mergedPdf.addPage(p));
            }
          } catch (err) {
            console.warn('Could not merge Notice of Assessment PDF:', row.file_path, err.message);
          }
          const accId = acceptancePairMap[row.id];
          if (accId && accById.has(accId)) {
            const accRow = accById.get(accId);
            try {
              const accBytes = loadPdfBytes(accRow);
              if (accBytes) {
                const accDoc = await PDFDocument.load(accBytes);
                const accCount = accDoc.getPageCount();
                const accIdx = Array.from({ length: accCount }, (_, i) => i);
                const accPages = await mergedPdf.copyPages(accDoc, accIdx);
                accPages.forEach((p) => mergedPdf.addPage(p));
              }
            } catch (err) {
              console.warn('Could not merge Acceptance/Reassessment PDF:', accRow.file_path, err.message);
            }
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
