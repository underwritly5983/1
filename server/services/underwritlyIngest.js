/**
 * Process Underwritly landing webhook payload: decode files, parse PDFs, insert ifta_reports.
 * Used by api/ingest/underwritly-insured.js (Vercel serverless).
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../config/database');
const { parsePDF, extractQuarterInfo } = require('./pdfParser');
const { summarizeIFTAReport } = require('./aiService');
const { generateReport } = require('./reportGenerator');
const { generateSummaryPDF } = require('./pdfGenerator');
const { getUploadsRoot } = require('../lib/uploadPaths');

function getGeneratedReportName(companyName) {
  return `${String(companyName || 'Company').trim()} IFTA Summary`;
}

function sortRowsChronologically(rows) {
  const qOrder = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
  return [...rows].sort((a, b) => {
    const ya = a.year != null ? Number(a.year) : 0;
    const yb = b.year != null ? Number(b.year) : 0;
    if (ya !== yb) return ya - yb;
    return (qOrder[a.quarter_label] || 0) - (qOrder[b.quarter_label] || 0);
  });
}

/**
 * Build generated_reports for the IFTA UI (same table as upload-multiple).
 * Uses all Notice of Assessment rows for the broker, keeps the latest four periods (product max).
 */
async function generateAndSaveGeneratedReport(userId, ingestBatchReportIds) {
  if (!ingestBatchReportIds || ingestBatchReportIds.length === 0) return null;

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const userResult = await db.query(
    'SELECT company_name, logo_url, brand_color_primary, brand_color_secondary FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const allRowsRes = await db.query(
    `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
     FROM ifta_reports
     WHERE user_id = $1
       AND (document_kind IS NULL OR document_kind = 'notice_of_assessment')`,
    [userId]
  );
  const sortedAll = sortRowsChronologically(allRowsRes.rows || []);
  const cappedRows = sortedAll.length > 4 ? sortedAll.slice(-4) : sortedAll;
  if (cappedRows.length === 0) return null;

  const pollIds = cappedRows.map((r) => r.id);

  let reportsResult = await db.query(
    `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
     FROM ifta_reports
     WHERE id = ANY($1::int[]) AND user_id = $2`,
    [pollIds, userId]
  );

  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    const hasRawText = reportsResult.rows.some((r) => r.raw_text && r.raw_text.length > 100);
    const allCompleted = reportsResult.rows.every((r) => r.status === 'completed' && r.summary);
    if (hasRawText || allCompleted || attempts >= maxAttempts - 1) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    attempts += 1;
    reportsResult = await db.query(
      `SELECT id, file_name, quarter_label, year, summary, detected_date, raw_text, status
       FROM ifta_reports
       WHERE id = ANY($1::int[]) AND user_id = $2`,
      [pollIds, userId]
    );
  }

  if (reportsResult.rows.length === 0) return null;

  const sortedResult = sortRowsChronologically(reportsResult.rows);
  const reports = sortedResult.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    quarter: r.quarter_label,
    year: r.year,
    summary: r.summary || { summary: 'Processing...', jurisdictions: [] },
    detectedDate: r.detected_date,
    rawText: r.raw_text,
  }));

  const reportData = await generateReport(reports, user);
  reportData.sourceReportIds = reports.map((r) => r.id);

  const pdfBuffer = await generateSummaryPDF(reportData, user);
  const pdfFilename = `summary-${userId}-${Date.now()}.pdf`;
  const summariesDir = path.join(getUploadsRoot(), 'summaries');
  if (!fs.existsSync(summariesDir)) {
    fs.mkdirSync(summariesDir, { recursive: true });
  }
  const pdfPath = path.join(summariesDir, pdfFilename);
  fs.writeFileSync(pdfPath, pdfBuffer);

  const reportName = getGeneratedReportName(user.company_name);
  const existingReport = await db.query(
    `SELECT id FROM generated_reports
     WHERE user_id = $1 AND report_name = $2
     ORDER BY created_at DESC LIMIT 1`,
    [userId, reportName]
  );

  if (existingReport.rows.length > 0) {
    const id = existingReport.rows[0].id;
    await db.query(
      `UPDATE generated_reports
       SET report_data = $1, file_path = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [JSON.stringify(reportData), pdfPath, id]
    );
    console.log('[underwritlyIngest] updated generated_report', id);
    return id;
  }

  const ins = await db.query(
    `INSERT INTO generated_reports (user_id, report_name, report_data, file_path, template_used)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [userId, reportName, JSON.stringify(reportData), pdfPath, 'underwritly-insured-ingest']
  );
  const newId = ins.rows[0].id;
  console.log('[underwritlyIngest] created generated_report', newId);
  return newId;
}

function normEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {object} body - { event, brokerEmail, companyKey, insuredId, insuredName, insuredEmail, files[] }
 */
async function processUnderwritlyIngestWebhook(body) {
  if (!body || body.event !== 'insured_ifta_upload') {
    throw new Error('Invalid event');
  }
  const brokerEmail = normEmail(body.brokerEmail);
  const files = Array.isArray(body.files) ? body.files : [];
  if (!brokerEmail) {
    throw new Error('Missing brokerEmail');
  }
  if (!files.length) {
    throw new Error('No files in payload');
  }

  const userRes = await db.query('SELECT id FROM users WHERE LOWER(TRIM(email)) = $1', [brokerEmail]);
  if (!userRes.rows.length) {
    throw new Error(
      'No IFTA account for this email: ' +
        brokerEmail +
        '. Sign up or log in to IFTA with the same email as your Underwritly broker account.'
    );
  }
  const userId = userRes.rows[0].id;

  const uploadBase = process.env.UPLOAD_DIR || '/tmp/uploads';
  const uploadDir = path.join(uploadBase, 'reports');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const reportIds = [];
  const errors = [];

  for (const f of files) {
    const name = (f && f.name) || 'upload.bin';
    const b64 = f && f.bodyBase64;
    if (!b64) {
      errors.push({ name, error: 'Missing bodyBase64' });
      continue;
    }
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch (e) {
      errors.push({ name, error: 'Invalid base64' });
      continue;
    }
    if (!buf.length) {
      errors.push({ name, error: 'Empty file' });
      continue;
    }

    const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(
      uploadDir,
      `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeName}`
    );
    fs.writeFileSync(filePath, buf);

    const mime = String((f && f.mime) || '');
    const lower = name.toLowerCase();
    const isPdf = mime.includes('pdf') || lower.endsWith('.pdf');

    try {
      if (isPdf) {
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
           RETURNING id`,
          [
            userId,
            name,
            filePath,
            buf.length,
            quarterInfo.quarter,
            quarterInfo.year,
            quarterInfo.quarter,
            quarterInfo.detectedDate,
            rawTextToStore,
            'processing',
            buf,
          ]
        );
        const reportId = result.rows[0].id;
        reportIds.push(reportId);

        summarizeIFTAReport(pdfData.text, quarterInfo.quarter, quarterInfo.year)
          .then(async (summary) => {
            await db.query(
              'UPDATE ifta_reports SET summary = $1, status = $2 WHERE id = $3',
              [JSON.stringify(summary), 'completed', reportId]
            );
          })
          .catch(async () => {
            await db.query('UPDATE ifta_reports SET status = $1 WHERE id = $2', ['completed', reportId]);
          });
      } else {
        const raw = buf.toString('utf8');
        const result = await db.query(
          `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status, file_blob)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [userId, name, filePath, buf.length, null, null, null, null, raw.substring(0, 2000000), 'completed', buf]
        );
        reportIds.push(result.rows[0].id);
      }
    } catch (err) {
      console.error('[underwritlyIngest] file error', name, err);
      errors.push({ name, error: err.message || String(err) });
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (reportIds.length === 0 && files.length > 0) {
    var detail =
      errors.length > 0
        ? errors.map(function (e) {
            return e.name + ': ' + e.error;
          }).join('; ')
        : 'No files could be processed';
    throw new Error(detail);
  }

  let generatedReportId = null;
  try {
    generatedReportId = await generateAndSaveGeneratedReport(userId, reportIds);
  } catch (genErr) {
    console.error('[underwritlyIngest] generated_reports step failed (ifta_reports were saved)', genErr);
  }

  return { userId, brokerEmail, reportIds, errors, generatedReportId };
}

module.exports = {
  processUnderwritlyIngestWebhook,
};
