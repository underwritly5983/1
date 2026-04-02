const perm = require('../services/permissionService');
const { resolveOrganizationId } = require('./rbacContext');

/**
 * Enforce hasPermission(userId, organizationId, permissionKey).
 * Uses req.rbacOrg.organizationId if set; otherwise resolveOrganizationId(req).
 */
function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      const orgId = req.rbacOrg?.organizationId ?? resolveOrganizationId(req);
      if (!orgId) {
        return res.status(400).json({ error: 'organizationId required' });
      }
      const allowed = await perm.hasPermission(req.user.id, orgId, permissionKey);
      if (!allowed) {
        return res.status(403).json({ error: 'Permission denied', permission: permissionKey });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePermission };
