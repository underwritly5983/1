const db = require('../config/database');

/**
 * Requires prior authenticate. Sets req.rbacOrg = { organizationId, roleSlug } for org in route param.
 */
async function loadOrgMembership(req, res, next) {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (!Number.isFinite(orgId)) {
      return res.status(400).json({ error: 'Invalid organization id' });
    }
    if (req.user?.is_admin) {
      req.rbacOrg = { organizationId: orgId, roleSlug: 'platform_admin' };
      return next();
    }
    const r = await db.query(
      `SELECT om.organization_id, r.slug AS role_slug
       FROM organization_memberships om
       JOIN roles r ON r.id = om.role_id
       WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
      [req.user.id, orgId]
    );
    if (r.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    req.rbacOrg = {
      organizationId: r.rows[0].organization_id,
      roleSlug: r.rows[0].role_slug,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Resolve organization id from query/body/params (first match). Requires authenticate.
 */
function resolveOrganizationId(req) {
  const q = req.query?.organizationId;
  const b = req.body?.organizationId;
  const p = req.params?.orgId;
  const raw = q ?? b ?? p;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

module.exports = { loadOrgMembership, resolveOrganizationId };
