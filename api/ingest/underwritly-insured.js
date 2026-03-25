/**
 * Vercel serverless — POST /api/ingest/underwritly-insured
 * Persists Underwritly landing webhook payloads into ifta_reports (same as upload-multiple).
 */

const crypto = require("crypto");

function sendJson(res, status, obj) {
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function readJsonBody(req, maxLen) {
  if (!maxLen) maxLen = 6 * 1024 * 1024;
  return new Promise(function (resolve, reject) {
    var data = "";
    req.on("data", function (chunk) {
      data += chunk;
      if (data.length > maxLen) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", function () {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function verifyIngestSecret(req) {
  var expected = String(process.env.IFTA_INGEST_SECRET || "").trim();
  if (!expected) return true;
  var got = String(req.headers["x-underwritly-ingest-secret"] || "");
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Underwritly-Ingest-Secret"
  );
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { ok: false, error: "Method not allowed — use POST with JSON." });
  }
  if (!verifyIngestSecret(req)) {
    return sendJson(res, 401, { ok: false, error: "Invalid ingest secret." });
  }
  try {
    var processUnderwritlyIngestWebhook = require("../../server/services/underwritlyIngest")
      .processUnderwritlyIngestWebhook;
    var body = await readJsonBody(req);
    var result = await processUnderwritlyIngestWebhook(body);
    return sendJson(res, 200, {
      ok: true,
      reportIds: result.reportIds,
      brokerEmail: result.brokerEmail,
      errors: result.errors && result.errors.length ? result.errors : undefined,
    });
  } catch (e) {
    console.error("[underwritly-insured]", e && e.message, e && e.stack);
    var msg = (e && e.message) || "Error";
    var status = /not found|Invalid|Missing|No files/i.test(msg) ? 400 : 500;
    return sendJson(res, status, { ok: false, error: msg });
  }
};
