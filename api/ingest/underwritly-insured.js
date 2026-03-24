/**
 * Vercel serverless function — POST /api/ingest/underwritly-insured
 *
 * Your IFTA app is built with Vite (not Next.js). The browser “API” path was
 * serving the SPA HTML on GET and had no POST handler → 405.
 *
 * Copy this file into your IFTA project at the same path:
 *   api/ingest/underwritly-insured.js
 * (next to package.json — same style as the Underwritly landing site.)
 *
 * Redeploy the IFTA project on Vercel.
 */

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

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { ok: false, error: "Method not allowed — use POST with JSON." });
  }
  try {
    var body = await readJsonBody(req);
    var event = body && body.event;
    var files = Array.isArray(body && body.files) ? body.files : [];
    var insuredId = body && body.insuredId;

    if (event !== "insured_ifta_upload") {
      return sendJson(res, 400, { ok: false, error: "Unknown event." });
    }

    console.log("[underwritly-insured] ingest", {
      insuredId: insuredId,
      brokerEmail: body && body.brokerEmail,
      fileCount: files.length,
    });

    // TODO: wire body.files[].bodyBase64 into your IFTA report pipeline

    return sendJson(res, 200, { ok: true, received: files.length, insuredId: insuredId });
  } catch (e) {
    console.error("[underwritly-insured]", e && e.message);
    return sendJson(res, 500, { ok: false, error: (e && e.message) || "Error" });
  }
};
