/**
 * Stable tenant key from company name (and fallback from email domain).
 */

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizeCompanyKey(company, email) {
  var s = String(company || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (s) return s;
  var em = normEmail(email);
  var dom = em.indexOf("@") > 0 ? em.split("@")[1] : "";
  var d = String(dom || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return d || "unknown";
}

function resolveCompanyKey(record) {
  if (record && typeof record.companyKey === "string" && record.companyKey.trim()) {
    return record.companyKey.trim();
  }
  return normalizeCompanyKey(record && record.company, record && record.email);
}

module.exports = {
  normalizeCompanyKey: normalizeCompanyKey,
  resolveCompanyKey: resolveCompanyKey,
};
