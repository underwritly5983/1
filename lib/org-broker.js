/**
 * Organization scope: insureds and IFTA data are keyed by the primary broker email.
 * Sub-users (accountType === "sub", primaryEmail set) share that org data.
 */

function normEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function orgBrokerEmail(record) {
  if (!record || typeof record !== "object") return "";
  if (record.accountType === "sub" && record.primaryEmail) {
    return normEmail(record.primaryEmail);
  }
  return normEmail(record.email);
}

function isSubAccount(record) {
  return !!(record && record.accountType === "sub");
}

function canManageTeam(record) {
  return !!(record && record.passwordHash && record.accountType !== "sub");
}

function canDeleteInsured(record) {
  return !isSubAccount(record);
}

module.exports = {
  normEmail: normEmail,
  orgBrokerEmail: orgBrokerEmail,
  isSubAccount: isSubAccount,
  canManageTeam: canManageTeam,
  canDeleteInsured: canDeleteInsured,
};
