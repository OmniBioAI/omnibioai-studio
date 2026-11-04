export const ADMIN_CAPABILITIES = Object.freeze([
  "manage_config", "manage_roles", "manage_org", "manage_all_orgs",
  "manage_api_keys", "manage_oauth_clients", "manage_licenses", "platform.manage_infra",
]);

export function hasAnyPermission(user, permissions) {
  const granted = new Set(user?.permissions || []);
  return permissions.some(permission => granted.has(permission));
}

export function canShowAdmin(user) {
  return hasAnyPermission(user, ADMIN_CAPABILITIES);
}

export function filterAdminItems(items, user) {
  return items.filter(item => !item.permissions || hasAnyPermission(user, item.permissions));
}
