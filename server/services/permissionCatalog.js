/**
 * Canonical permission keys (category.action) and system role definitions.
 * Dynamic: loaded from DB at runtime; this array seeds the catalog.
 */

const PERMISSIONS = [
  { category: 'user_management', key: 'user_management.invite_users', description: 'Invite team members' },
  { category: 'user_management', key: 'user_management.remove_users', description: 'Remove team members' },
  { category: 'user_management', key: 'user_management.edit_user_roles', description: 'Change roles and overrides' },
  { category: 'data_access', key: 'data_access.view_data', description: 'View IFTA data and reports' },
  { category: 'data_access', key: 'data_access.edit_data', description: 'Edit data' },
  { category: 'data_access', key: 'data_access.delete_data', description: 'Delete data' },
  { category: 'data_access', key: 'data_access.export_data', description: 'Export / download reports' },
  { category: 'system', key: 'system.manage_settings', description: 'Organization settings' },
  { category: 'system', key: 'system.manage_integrations', description: 'Integrations' },
  { category: 'system', key: 'system.api_access', description: 'API access' },
  { category: 'billing', key: 'billing.view_billing', description: 'View billing' },
  { category: 'billing', key: 'billing.manage_billing', description: 'Manage billing' },
  { category: 'feature_flags', key: 'feature_flags.use_ai_tools', description: 'AI tools' },
  { category: 'feature_flags', key: 'feature_flags.run_automations', description: 'Automations' },
];

/** Higher = more privilege. Used for delegation checks. */
const ROLE_RANK = {
  owner: 100,
  manager: 75,
  contributor: 50,
  viewer: 25,
};

/** Which permission keys each system role receives by default (before overrides). */
const ROLE_PERMISSION_KEYS = {
  owner: PERMISSIONS.map((p) => p.key),
  manager: [
    'user_management.invite_users',
    'user_management.remove_users',
    'user_management.edit_user_roles',
    'data_access.view_data',
    'data_access.edit_data',
    'data_access.delete_data',
    'data_access.export_data',
    'system.manage_settings',
    'system.manage_integrations',
    'billing.view_billing',
    'feature_flags.use_ai_tools',
    'feature_flags.run_automations',
  ],
  contributor: [
    'data_access.view_data',
    'data_access.edit_data',
    'data_access.export_data',
    'feature_flags.use_ai_tools',
  ],
  viewer: ['data_access.view_data', 'data_access.export_data'],
};

/**
 * Who may assign which role (creator role slug -> allowed target role slugs). Owner cannot create another owner via API.
 */
const ASSIGNABLE_ROLES = {
  owner: ['manager', 'contributor', 'viewer'],
  manager: ['contributor', 'viewer'],
  contributor: [],
  viewer: [],
};

module.exports = {
  PERMISSIONS,
  ROLE_RANK,
  ROLE_PERMISSION_KEYS,
  ASSIGNABLE_ROLES,
};
