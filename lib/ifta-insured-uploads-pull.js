/**
 * GET /api/session?pull=insured_uploads&ifta_token=…&insuredId=…
 * Returns stored IFTA file payloads for the broker/insured (signed launch token).
 * The IFTA Summary app should call this after verifying ifta_token to load PDFs/CSVs for reporting.
 */

var iftaLaunch = require("./ifta-launch-token");
var insuredDb = require("./insured-db");

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function parseUploads(row) {
  var u = row.uploads;
  if (typeof u === "string") {
    try {
      u = JSON.parse(u);
    } catch (e) {
      u = [];
    }
  }
  if (!Array.isArray(u)) u = [];
  return u;
}

function sendJson(res, status, obj) {
  if (!res || typeof res.status !== "function") return;
  if (typeof res.json === "function") {
    return res.status(status).json(obj);
  }
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

module.exports = async function handleIftaInsuredUploadsPull(req, res, q) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  var tok = String((q && (q.ifta_token || q.iftaToken)) || "").trim();
  var v = iftaLaunch.verifyIftaLaunchToken(tok);
  if (!v.ok) {
    return sendJson(res, 401, { ok: false, error: v.error || "Invalid token." });
  }
  var p = v.payload;
  var brokerEmail = normEmail(p.email);
  if (!brokerEmail) {
    return sendJson(res, 400, { ok: false, error: "Invalid token payload." });
  }
  if (!insuredDb.hasPostgres()) {
    return sendJson(res, 503, { ok: false, error: "Insured storage is not configured (DATABASE_URL)." });
  }
  var insuredIdParam = q.insuredId != null ? q.insuredId : q.insured_id;
  if (insuredIdParam == null || insuredIdParam === "") {
    return sendJson(res, 400, { ok: false, error: "Missing insuredId." });
  }
  var idNum = parseInt(String(insuredIdParam), 10);
  if (isNaN(idNum) || idNum < 1) {
    return sendJson(res, 400, { ok: false, error: "Invalid insured id." });
  }
  if (p.insuredId != null && p.insuredId !== idNum) {
    return sendJson(res, 403, { ok: false, error: "Launch token does not match this insured." });
  }
  try {
    var row = await insuredDb.getByBrokerAndId(brokerEmail, idNum);
    if (!row) {
      return sendJson(res, 404, { ok: false, error: "Insured not found." });
    }
    var uploads = parseUploads(row);
    var files = uploads.map(function (f) {
      return {
        name: f.name,
        mime: f.mime,
        size: f.size,
        receivedAt: f.receivedAt,
        bodyBase64: f.bodyBase64,
      };
    });
    return sendJson(res, 200, {
      ok: true,
      event: "insured_ifta_upload_payload",
      brokerEmail: brokerEmail,
      companyKey: row.company_key || "",
      insuredId: row.id,
      insuredName: row.name || "",
      insuredEmail: normEmail(row.email),
      status: row.status,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : "",
      files: files,
    });
  } catch (e) {
    console.error("[ifta-insured-uploads-pull]", e);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
