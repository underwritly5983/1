const db = require('../config/database');
const {
  PERMISSIONS,
  ROLE_RANK,
  ROLE_PERMISSION_KEYS,
  ASSIGNABLE_ROLES,
} = require('./permissionCatalog');

/**
 * Resolution order (deny-first):
 * 1. Explicit DENY override (including expired overrides ignored)
 * 2. Explicit ALLOW override
 * 3. Role grant
 * 4. Default DENY
 */

async function getPermissionIdByKey(key) {
  const r = await db.query('SELECT id FROM permissions WHERE key = $1', [key]);
  return r.rows[0]?.id ?? null;
}

async function getUserRow(userId) {
  const r = await db.query(
    'SELECT id, email, company_name, is_admin FROM users WHERE id = $1',
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * @returns {Promise<boolean>}
 */
async function hasPermission(userId, organizationId, permissionKey, options = {}) {
  const userRow = options.userRow || (await getUserRow(userId));
  if (!userRow) return false;
  if (userRow.is_admin === true) return true;
  if (!organizationId) return false;

  const permId = await getPermissionIdByKey(permissionKey);
  if (!permId) return false;

  const membership = await db.query(
    `SELECT om.id, r.slug AS role_slug
     FROM organization_memberships om
     JOIN roles r ON r.id = om.role_id
     WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
    [userId, organizationId]
  );
  if (membership.rows.length === 0) return false;

  const now = new Date();
  const overrides = await db.query(
    `SELECT effect, expires_at
     FROM user_permission_overrides
     WHERE user_id = $1 AND organization_id = $2 AND permission_id = $3`,
    [userId, organizationId, permId]
  );
  if (overrides.rows.length > 0) {
    const o = overrides.rows[0];
    if (o.expires_at && new Date(o.expires_at) < now) {
      /* expired — fall through to role */
    } else if (o.effect === 'deny') return false;
    else if (o.effect === 'allow') return true;
  }

  const roleId = await db.query(
    `SELECT om.role_id FROM organization_memberships om
     WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
    [userId, organizationId]
  );
  if (roleId.rows.length === 0) return false;

  const rp = await db.query(
    `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
    [roleId.rows[0].role_id, permId]
  );
  return rp.rows.length > 0;
}

/**
 * Effective permission map: key -> boolean
 */
async function getEffectivePermissions(userId, organizationId) {
  const userRow = await getUserRow(userId);
  if (!userRow) return {};
  if (userRow.is_admin === true) {
    const all = {};
    for (const p of PERMISSIONS) all[p.key] = true;
    return all;
  }
  if (!organizationId) return {};

  const membership = await db.query(
    `SELECT om.role_id, r.slug AS role_slug
     FROM organization_memberships om
     JOIN roles r ON r.id = om.role_id
     WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
    [userId, organizationId]
  );
  if (membership.rows.length === 0) return {};

  const roleId = membership.rows[0].role_id;
  const now = new Date();

  const allPermIds = await db.query('SELECT id, key FROM permissions');
  const result = {};

  const rolePerms = await db.query(
    'SELECT permission_id FROM role_permissions WHERE role_id = $1',
    [roleId]
  );
  const roleSet = new Set(rolePerms.rows.map((x) => x.permission_id));

  const overrides = await db.query(
    `SELECT permission_id, effect, expires_at
     FROM user_permission_overrides
     WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId]
  );
  const overrideByPermId = new Map(overrides.rows.map((o) => [o.permission_id, o]));

  for (const row of allPermIds.rows) {
    const key = row.key;
    const pid = row.id;
    const o = overrideByPermId.get(pid);
    if (o) {
      if (o.expires_at && new Date(o.expires_at) < now) {
        result[key] = roleSet.has(pid);
      } else if (o.effect === 'deny') result[key] = false;
      else if (o.effect === 'allow') result[key] = true;
    } else {
      result[key] = roleSet.has(pid);
    }
  }

  return result;
}

function canAssignRole(creatorRoleSlug, targetRoleSlug) {
  const allowed = ASSIGNABLE_ROLES[creatorRoleSlug];
  if (!allowed) return false;
  return allowed.includes(targetRoleSlug);
}

function roleRank(slug) {
  return ROLE_RANK[slug] ?? 0;
}

/**
 * Creator must have edit_user_roles + cannot assign a role they couldn't per ASSIGNABLE_ROLES.
 */
async function assertCanAssignRole(creatorUserId, organizationId, targetRoleSlug) {
  const creatorRow = await getUserRow(creatorUserId);
  if (creatorRow?.is_admin) return;

  const cr = await db.query(
    `SELECT r.slug FROM organization_memberships om
     JOIN roles r ON r.id = om.role_id
     WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
    [creatorUserId, organizationId]
  );
  if (cr.rows.length === 0) {
    const e = new Error('Not a member of this organization');
    e.status = 403;
    throw e;
  }
  const creatorSlug = cr.rows[0].slug;
  if (!canAssignRole(creatorSlug, targetRoleSlug)) {
    const e = new Error('You cannot assign this role');
    e.status = 403;
    throw e;
  }
  if (roleRank(targetRoleSlug) > roleRank(creatorSlug)) {
    const e = new Error('Cannot assign a role with higher privileges than your own');
    e.status = 403;
    throw e;
  }
  const ok = await hasPermission(creatorUserId, organizationId, 'user_management.edit_user_roles');
  if (!ok) {
    const e = new Error('Permission denied: user_management.edit_user_roles');
    e.status = 403;
    throw e;
  }
}

async function assertCanManageOverrides(actorUserId, organizationId) {
  const actor = await getUserRow(actorUserId);
  if (actor?.is_admin) return;
  const okEdit = await hasPermission(actorUserId, organizationId, 'user_management.edit_user_roles');
  if (!okEdit) {
    const e = new Error('Permission denied: user_management.edit_user_roles');
    e.status = 403;
    throw e;
  }
}

/**
 * Setting ALLOW on a permission requires the actor to have that permission.
 * DENY only requires user_management.edit_user_roles.
 */
async function assertCanSetOverride(actorUserId, organizationId, permissionKey, effect) {
  await assertCanManageOverrides(actorUserId, organizationId);
  const actor = await getUserRow(actorUserId);
  if (actor?.is_admin) return;
  if (effect === 'allow') {
    const has = await hasPermission(actorUserId, organizationId, permissionKey);
    if (!has) {
      const e = new Error('You cannot grant a permission you do not have');
      e.status = 403;
      throw e;
    }
  }
}

async function appendAudit(organizationId, actorUserId, targetUserId, action, detail) {
  await db.query(
    `INSERT INTO permission_audit_log (organization_id, actor_user_id, target_user_id, action, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [organizationId, actorUserId, targetUserId, action, JSON.stringify(detail || {})]
  );
}

async function seedPermissionsAndRoles() {
  for (const p of PERMISSIONS) {
    await db.query(
      `INSERT INTO permissions (category, key, description) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description`,
      [p.category, p.key, p.description]
    );
  }

  const systemRoles = [
    { slug: 'owner', display_name: 'Organization Owner', rank: ROLE_RANK.owner },
    { slug: 'manager', display_name: 'Manager', rank: ROLE_RANK.manager },
    { slug: 'contributor', display_name: 'Contributor', rank: ROLE_RANK.contributor },
    { slug: 'viewer', display_name: 'Viewer', rank: ROLE_RANK.viewer },
  ];

  for (const sr of systemRoles) {
    await db.query(
      `INSERT INTO roles (organization_id, slug, display_name, is_system, rank)
       SELECT NULL, $1, $2, TRUE, $3
       WHERE NOT EXISTS (SELECT 1 FROM roles WHERE organization_id IS NULL AND slug = $1)`,
      [sr.slug, sr.display_name, sr.rank]
    );
  }

  const rolesRes = await db.query(
    `SELECT id, slug FROM roles WHERE organization_id IS NULL AND slug = ANY($1)`,
    [['owner', 'manager', 'contributor', 'viewer']]
  );
  const slugToRoleId = new Map(rolesRes.rows.map((r) => [r.slug, r.id]));

  const keyToIdRes = await db.query('SELECT id, key FROM permissions');
  const keyToId = new Map(keyToIdRes.rows.map((r) => [r.key, r.id]));

  for (const [slug, keys] of Object.entries(ROLE_PERMISSION_KEYS)) {
    const roleId = slugToRoleId.get(slug);
    if (!roleId) continue;
    for (const key of keys) {
      const permId = keyToId.get(key);
      if (!permId) continue;
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [roleId, permId]
      );
    }
  }

  console.log('✅ RBAC: permissions and system roles seeded');
}

/**
 * One organization per existing user as owner (migration).
 */
async function migrateUsersToOrganizations() {
  const users = await db.query(
    `SELECT u.id, u.company_name FROM users u
     WHERE NOT EXISTS (
       SELECT 1 FROM organization_memberships om
       WHERE om.user_id = u.id AND om.deleted_at IS NULL
     )`
  );

  const ownerRole = await db.query(
    `SELECT id FROM roles WHERE organization_id IS NULL AND slug = 'owner' LIMIT 1`
  );
  if (ownerRole.rows.length === 0) {
    console.warn('⚠️  RBAC: owner role missing, skip user migration');
    return;
  }
  const ownerRoleId = ownerRole.rows[0].id;

  for (const u of users.rows) {
    const slug = `org-${u.id}`;
    const orgIns = await db.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [u.company_name || `Organization ${u.id}`, slug]
    );
    const orgId = orgIns.rows[0].id;
    await db.query(
      `INSERT INTO organization_memberships (organization_id, user_id, role_id)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (
         SELECT 1 FROM organization_memberships
         WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL
       )`,
      [orgId, u.id, ownerRoleId]
    );
  }

  if (users.rows.length > 0) {
    console.log(`✅ RBAC: migrated ${users.rows.length} user(s) to organizations`);
  }
}

/**
 * Call after new user registration.
 */
async function ensureOwnerOrganization(userId, companyName) {
  const existing = await db.query(
    `SELECT id FROM organization_memberships WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if (existing.rows.length > 0) return;

  const ownerRole = await db.query(
    `SELECT id FROM roles WHERE organization_id IS NULL AND slug = 'owner' LIMIT 1`
  );
  if (ownerRole.rows.length === 0) {
    console.warn('⚠️  RBAC: cannot ensure org — seed roles first');
    return;
  }

  const slug = `org-${userId}`;
  const orgIns = await db.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
    [companyName || `Organization ${userId}`, slug]
  );
  const orgId = orgIns.rows[0].id;
  await db.query(
    `INSERT INTO organization_memberships (organization_id, user_id, role_id)
     VALUES ($1, $2, $3)`,
    [orgId, userId, ownerRole.rows[0].id]
  );
}

/**
 * Default org for a user (first membership).
 */
async function getDefaultOrganizationIdForUser(userId) {
  const r = await db.query(
    `SELECT organization_id FROM organization_memberships
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY id ASC LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.organization_id ?? null;
}

async function getMembershipRoleSlug(userId, organizationId) {
  const r = await db.query(
    `SELECT r.slug FROM organization_memberships om
     JOIN roles r ON r.id = om.role_id
     WHERE om.user_id = $1 AND om.organization_id = $2 AND om.deleted_at IS NULL`,
    [userId, organizationId]
  );
  return r.rows[0]?.slug ?? null;
}

async function getSystemRoleIdBySlug(slug) {
  const r = await db.query(
    `SELECT id FROM roles WHERE organization_id IS NULL AND slug = $1 LIMIT 1`,
    [slug]
  );
  return r.rows[0]?.id ?? null;
}

module.exports = {
  hasPermission,
  getEffectivePermissions,
  canAssignRole,
  roleRank,
  assertCanAssignRole,
  assertCanManageOverrides,
  assertCanSetOverride,
  appendAudit,
  seedPermissionsAndRoles,
  migrateUsersToOrganizations,
  ensureOwnerOrganization,
  getDefaultOrganizationIdForUser,
  getMembershipRoleSlug,
  getSystemRoleIdBySlug,
  getUserRow,
};
