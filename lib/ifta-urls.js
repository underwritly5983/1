/**
 * Single source for IFTA deployment + ingest URLs so you only set IFTA_DEPLOYMENT_URL on Vercel.
 * Ingest POST URL defaults to {origin}/api/ingest/underwritly-insured unless IFTA_INGEST_WEBHOOK_URL overrides.
 */

var DEFAULT_IFTA_REPORTS_URL = "https://ifta-dev-underwritly.vercel.app/reports";

function normalizeIftaDeploymentUrl(url) {
  var u = String(url || "")
    .trim()
    .replace(/\/+$/, "");
  if (!u) return DEFAULT_IFTA_REPORTS_URL;
  if (/\/reports\/upload\/?$/i.test(u)) {
    return u.replace(/\/reports\/upload\/?$/i, "/reports");
  }
  return u;
}

function iftaDeploymentBase() {
  return normalizeIftaDeploymentUrl(process.env.IFTA_DEPLOYMENT_URL || "");
}

/**
 * Explicit IFTA_INGEST_WEBHOOK_URL, or derived from IFTA_DEPLOYMENT_URL (same host as broker launch link).
 */
function resolveIftaIngestWebhookUrl() {
  var explicit = String(process.env.IFTA_INGEST_WEBHOOK_URL || "").trim();
  if (explicit) return explicit;
  var base = iftaDeploymentBase();
  try {
    var u = base.indexOf("://") < 0 ? "https://" + base : base;
    var parsed = new URL(u);
    return parsed.origin + "/api/ingest/underwritly-insured";
  } catch (e) {
    return "";
  }
}

module.exports = {
  DEFAULT_IFTA_REPORTS_URL: DEFAULT_IFTA_REPORTS_URL,
  normalizeIftaDeploymentUrl: normalizeIftaDeploymentUrl,
  iftaDeploymentBase: iftaDeploymentBase,
  resolveIftaIngestWebhookUrl: resolveIftaIngestWebhookUrl,
};
