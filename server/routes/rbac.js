const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { loadOrgMembership, resolveOrganizationId } = require('../middleware/rbacContext');
const { requirePermission } = require('../middleware/requirePermission');
const perm = require('../services/permissionService');
const { PERMISSIONS } = require('../services/permissionCatalog');

const router = express.Router();

/** Effective permissions for current user (must be org member or platform admin). */
router.get('/me/permissions', authenticate, async (req, res, next) => {
  try {
    const orgId = resolveOrganizationId(req);
    if (!orgId) {
      return res.status(400).json({ error: 'Pass organizationId as query parameter' });
    }
    const userRow = await perm.getUserRow(req.user.id);
    if (userRow?.is_admin) {
      const all = {};
      for (const p of PERMISSIONS) all[p.key] = true;
      return res.json({ organizationId: orgId, permissions: all, roleSlug: 'platform_admin' });
    }
    const member = await db.query(
      `SELECT 1 FROM organization_memberships
       WHERE user_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [req.user.id, orgId]
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }
    const effective = await perm.getEffectivePermissions(req.user.id, orgId);
    const roleSlug = await perm.getMembershipRoleSlug(req.user.id, orgId);
    res.json({ organizationId: orgId, permissions: effective, roleSlug });
  } catch (err) {
    next(err);
  }
});

/** List organization members. */
router.get(
  '/organizations/:orgId/members',
  authenticate,
  loadOrgMembership,
  requirePermission('user_management.invite_users'),
  async (req, res, next) => {
    try {
      const orgId = req.rbacOrg.organizationId;
      const result = await db.query(
        `SELECT u.id, u.email, u.company_name, r.slug AS role_slug, om.created_at, om.invited_by
         FROM organization_memberships om
         JOIN users u ON u.id = om.user_id
         JOIN roles r ON r.id = om.role_id
         WHERE om.organization_id = $1 AND om.deleted_at IS NULL
         ORDER BY u.email ASC`,
        [orgId]
      );
      res.json({ members: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

/** Create team member (new account) or add existing user to the organization. */
router.post(
  '/organizations/:orgId/members',
  authenticate,
  loadOrgMembership,
  requirePermission('user_management.invite_users'),
  [
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 8 }),
    body('roleSlug').isIn(['manager', 'contributor', 'viewer']),
    body('companyName').optional().trim(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const orgId = req.rbacOrg.organizationId;
      const { email, password, roleSlug, companyName } = req.body;

      await perm.assertCanAssignRole(req.user.id, orgId, roleSlug);

      const roleId = await perm.getSystemRoleIdBySlug(roleSlug);
      if (!roleId) return res.status(400).json({ error: 'Invalid role' });

      const orgRow = await db.query('SELECT name FROM organizations WHERE id = $1', [orgId]);
      const orgName = orgRow.rows[0]?.name || 'Organization';

      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        const targetUserId = existing.rows[0].id;
        const prev = await db.query(
          `SELECT id, deleted_at FROM organization_memberships
           WHERE user_id = $1 AND organization_id = $2`,
          [targetUserId, orgId]
        );
        if (prev.rows.length > 0) {
          const row = prev.rows[0];
          if (row.deleted_at == null) {
            return res.status(400).json({ error: 'User is already a member of this organization' });
          }
          await db.query(
            `UPDATE organization_memberships
             SET deleted_at = NULL, role_id = $1, invited_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [roleId, req.user.id, row.id]
          );
          await perm.appendAudit(orgId, req.user.id, targetUserId, 'member_reactivated', {
            roleSlug,
            existingUser: true,
          });
          return res.status(201).json({ message: 'User re-added to organization', userId: targetUserId });
        }
        await db.query(
          `INSERT INTO organization_memberships (organization_id, user_id, role_id, invited_by)
           VALUES ($1, $2, $3, $4)`,
          [orgId, targetUserId, roleId, req.user.id]
        );
        await perm.appendAudit(orgId, req.user.id, targetUserId, 'member_added', {
          roleSlug,
          existingUser: true,
        });
        return res.status(201).json({ message: 'User added to organization', userId: targetUserId });
      }

      if (!password) {
        return res.status(400).json({ error: 'password is required for new users (min 8 characters)' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const ins = await db.query(
        `INSERT INTO users (email, password_hash, company_name, phone, brand_color_primary, brand_color_secondary)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          email,
          passwordHash,
          companyName || orgName,
          null,
          '#2563eb',
          '#1e40af',
        ]
      );
      const newUserId = ins.rows[0].id;
      await db.query('INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)', [
        newUserId,
        'free',
        'active',
      ]);
      await db.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role_id, invited_by)
         VALUES ($1, $2, $3, $4)`,
        [orgId, newUserId, roleId, req.user.id]
      );
      await perm.appendAudit(orgId, req.user.id, newUserId, 'member_created', { roleSlug });
      res.status(201).json({ message: 'Team member created', userId: newUserId });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Membership conflict' });
      }
      next(err);
    }
  }
);

/** Change a member's role. */
router.patch(
  '/organizations/:orgId/members/:memberUserId/role',
  authenticate,
  loadOrgMembership,
  requirePermission('user_management.edit_user_roles'),
  [body('roleSlug').isIn(['manager', 'contributor', 'viewer'])],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const orgId = req.rbacOrg.organizationId;
      const memberUserId = parseInt(req.params.memberUserId, 10);
      const { roleSlug } = req.body;
      if (memberUserId === req.user.id) {
        return res.status(400).json({ error: 'Cannot change your own role via this endpoint' });
      }

      await perm.assertCanAssignRole(req.user.id, orgId, roleSlug);

      const targetRow = await db.query(
        `SELECT om.id, r.slug AS current_slug
         FROM organization_memberships om
         JOIN roles r ON r.id = om.role_id
         WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
        [memberUserId, orgId]
      );
      if (targetRow.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }
      if (targetRow.rows[0].current_slug === 'owner') {
        return res.status(403).json({ error: 'Organization owner role cannot be changed here' });
      }

      const newRoleId = await perm.getSystemRoleIdBySlug(roleSlug);
      if (!newRoleId) return res.status(400).json({ error: 'Invalid role' });

      await db.query(`UPDATE organization_memberships SET role_id = $1 WHERE id = $2`, [
        newRoleId,
        targetRow.rows[0].id,
      ]);
      await perm.appendAudit(orgId, req.user.id, memberUserId, 'role_changed', {
        from: targetRow.rows[0].current_slug,
        to: roleSlug,
      });
      res.json({ message: 'Role updated' });
    } catch (err) {
      next(err);
    }
  }
);

/** Set or clear a permission override for a member. */
router.put(
  '/organizations/:orgId/members/:memberUserId/overrides',
  authenticate,
  loadOrgMembership,
  requirePermission('user_management.edit_user_roles'),
  [
    body('permissionKey').isString().notEmpty(),
    body('effect').isIn(['allow', 'deny', 'clear']),
    body('expiresAt').optional().isISO8601(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const orgId = req.rbacOrg.organizationId;
      const memberUserId = parseInt(req.params.memberUserId, 10);
      const { permissionKey, effect, expiresAt } = req.body;

      const targetRow = await db.query(
        `SELECT r.slug FROM organization_memberships om
         JOIN roles r ON r.id = om.role_id
         WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
        [memberUserId, orgId]
      );
      if (targetRow.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }
      if (targetRow.rows[0].slug === 'owner') {
        return res.status(403).json({ error: 'Overrides for organization owner are not supported' });
      }

      const pid = await db.query('SELECT id FROM permissions WHERE key = $1', [permissionKey]);
      if (pid.rows.length === 0) return res.status(400).json({ error: 'Unknown permission key' });
      const permissionId = pid.rows[0].id;

      if (effect === 'clear') {
        await perm.assertCanManageOverrides(req.user.id, orgId);
        await db.query(
          `DELETE FROM user_permission_overrides
           WHERE user_id = $1 AND organization_id = $2 AND permission_id = $3`,
          [memberUserId, orgId, permissionId]
        );
        await perm.appendAudit(orgId, req.user.id, memberUserId, 'override_cleared', { permissionKey });
        return res.json({ message: 'Override cleared' });
      }

      await perm.assertCanSetOverride(req.user.id, orgId, permissionKey, effect);

      await db.query(
        `INSERT INTO user_permission_overrides (organization_id, user_id, permission_id, effect, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, user_id, permission_id)
         DO UPDATE SET effect = EXCLUDED.effect, expires_at = EXCLUDED.expires_at, created_by = EXCLUDED.created_by`,
        [orgId, memberUserId, permissionId, effect, expiresAt || null, req.user.id]
      );
      await perm.appendAudit(orgId, req.user.id, memberUserId, 'override_set', {
        permissionKey,
        effect,
        expiresAt: expiresAt || null,
      });
      res.json({ message: 'Override saved' });
    } catch (err) {
      next(err);
    }
  }
);

/** Soft-remove a member from the organization. */
router.delete(
  '/organizations/:orgId/members/:memberUserId',
  authenticate,
  loadOrgMembership,
  requirePermission('user_management.remove_users'),
  async (req, res, next) => {
    try {
      const orgId = req.rbacOrg.organizationId;
      const memberUserId = parseInt(req.params.memberUserId, 10);
      if (memberUserId === req.user.id) {
        return res.status(400).json({ error: 'Cannot remove yourself' });
      }

      const targetRow = await db.query(
        `SELECT om.id, r.slug FROM organization_memberships om
         JOIN roles r ON r.id = om.role_id
         WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
        [memberUserId, orgId]
      );
      if (targetRow.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }
      if (targetRow.rows[0].slug === 'owner') {
        const owners = await db.query(
          `SELECT COUNT(*)::int AS c FROM organization_memberships om
           JOIN roles r ON r.id = om.role_id
           WHERE om.organization_id = $1 AND om.deleted_at IS NULL AND r.slug = 'owner'`,
          [orgId]
        );
        if (owners.rows[0].c <= 1) {
          return res.status(403).json({ error: 'Cannot remove the sole organization owner' });
        }
      }

      await db.query(
        `UPDATE organization_memberships SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [targetRow.rows[0].id]
      );
      await perm.appendAudit(orgId, req.user.id, memberUserId, 'member_removed', {});
      res.json({ message: 'Member removed' });
    } catch (err) {
      next(err);
    }
  }
);

/** Audit log (organization). */
router.get(
  '/organizations/:orgId/audit',
  authenticate,
  loadOrgMembership,
  requirePermission('system.manage_settings'),
  async (req, res, next) => {
    try {
      const orgId = req.rbacOrg.organizationId;
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const result = await db.query(
        `SELECT id, actor_user_id, target_user_id, action, detail, created_at
         FROM permission_audit_log
         WHERE organization_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [orgId, limit]
      );
      res.json({ entries: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
