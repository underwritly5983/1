/**
 * Single source for IFTA deployment + ingest URLs — set IFTA_DEPLOYMENT_URL on Vercel (landing project).
 * Ingest POST URL defaults to {origin}/api/ingest/underwritly-insured unless IFTA_INGEST_WEBHOOK_URL overrides.
 *
 * No fallback hostname: an unset env used to default to ifta-dev-underwritly.vercel.app, which often 404s
 * if that deployment was renamed or never deployed for your team.
 */

function normalizeIftaDeploymentUrl(url) {
  var u = String(url || "")
    .trim()
    .replace(/\/+$/, "");
  if (!u) return "";
  if (/\/reports\/upload\/?$/i.test(u)) {
    return u.replace(/\/reports\/upload\/?$/i, "/reports");
  }
  return u;
}

function iftaDeploymentBase() {
  return normalizeIftaDeploymentUrl(process.env.IFTA_DEPLOYMENT_URL || "");
}

var _warnedPlaceholderHost = false;

/**
 * Explicit IFTA_INGEST_WEBHOOK_URL, or derived from IFTA_DEPLOYMENT_URL (same host as broker launch link).
 */
function resolveIftaIngestWebhookUrl() {
  var explicit = String(process.env.IFTA_INGEST_WEBHOOK_URL || "").trim();
  if (explicit) return explicit;
  var base = iftaDeploymentBase();
  if (!base) return "";
  if (
    /ifta-dev-underwritly\.vercel\.app/i.test(base) &&
    process.env.VERCEL === "1" &&
    !_warnedPlaceholderHost
  ) {
    _warnedPlaceholderHost = true;
    console.error(
      "[ifta-urls] IFTA_DEPLOYMENT_URL still uses the placeholder host ifta-dev-underwritly.vercel.app. " +
        "On Vercel → landing project → Environment Variables, set IFTA_DEPLOYMENT_URL to your real IFTA Summary URL " +
        "(Vercel → IFTA project → Domains), e.g. https://YOUR-ifta-project.vercel.app/reports — then Redeploy."
    );
  }
  try {
    var u = base.indexOf("://") < 0 ? "https://" + base : base;
    var parsed = new URL(u);
    return parsed.origin + "/api/ingest/underwritly-insured";
  } catch (e) {
    return "";
  }
}

module.exports = {
  normalizeIftaDeploymentUrl: normalizeIftaDeploymentUrl,
  iftaDeploymentBase: iftaDeploymentBase,
  resolveIftaIngestWebhookUrl: resolveIftaIngestWebhookUrl,
};
