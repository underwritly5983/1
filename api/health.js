/**
 * GET — lightweight readiness check (no secrets). Use after deploy: GET /api/health
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

module.exports = async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      return res.status(204).end();
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, OPTIONS");
      return sendJson(res, 405, { ok: false, error: "Method not allowed" });
    }

    var hasKv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
    var hasSmtp =
      !!(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.MAIL_FROM);
    var hasAdmin =
      !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD != null && String(process.env.ADMIN_PASSWORD).length > 0);
    var hasSiteUrl = !!(process.env.SITE_URL || process.env.PUBLIC_SITE_URL);
    var hasProfileSecret = !!(process.env.PROFILE_ACCESS_SECRET || "").trim();
    var hasSessionSigning =
      !!(process.env.SESSION_SECRET || "").trim() ||
      !!(process.env.PROFILE_ACCESS_SECRET || "").trim();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "HEAD") {
      res.statusCode = 200;
      return res.end();
    }

    return sendJson(res, 200, {
      ok: true,
      service: "underwritly-landing",
      runtime: process.env.VERCEL === "1" ? "vercel" : "other",
      checks: {
        kvStorage: hasKv,
        smtpEmail: hasSmtp,
        adminCredentials: hasAdmin,
        siteUrlForEmailLinks: hasSiteUrl,
        profileAccessSecret: hasProfileSecret,
        sessionSigningSecret: hasSessionSigning,
      },
    });
  } catch (fatal) {
    console.error("[health] fatal", fatal);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
};
