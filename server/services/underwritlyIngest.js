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
          `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
          `INSERT INTO ifta_reports (user_id, file_name, file_path, file_size, quarter, year, quarter_label, detected_date, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [userId, name, filePath, buf.length, null, null, null, null, raw.substring(0, 2000000), 'completed']
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

  return { userId, brokerEmail, reportIds, errors };
}

module.exports = {
  processUnderwritlyIngestWebhook,
};
