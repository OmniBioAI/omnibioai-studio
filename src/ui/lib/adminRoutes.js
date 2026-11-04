export const ADMIN_ROUTE_DEFINITIONS = Object.freeze([
  { group: "Runtime", name: "Launch", path: "/studio/admin/runtime/launch", idx: 4, permissions: ["manage_config"], boundary: "frontend" },
  { group: "Runtime", name: "Services", path: "/studio/admin/runtime/services", idx: 5, permissions: ["manage_config"], boundary: "frontend" },
  { group: "Runtime", name: "Logs", path: "/studio/admin/runtime/logs", idx: 6, permissions: ["manage_config"], boundary: "frontend" },
  { group: "Runtime", name: "Admin console", path: "/studio/admin/runtime/admin-console", idx: -10, permissions: ["platform.manage_infra"], oldUrl: "https://admin.omnibioai.org/", boundary: "standalone-admin" },
  { group: "Runtime", name: "Control center", path: "/studio/admin/runtime/control-center", idx: -11, permissions: ["platform.manage_infra"], oldUrl: "/_svc/control/", boundary: "control-center" },
  { group: "Runtime", name: "Platform health", path: "/studio/admin/runtime/platform-health", idx: -12, permissions: ["platform.manage_infra"], oldUrl: "https://control.omnibioai.org", boundary: "p1" },
  { group: "Runtime", name: "LLM runtime", path: "/studio/admin/runtime/llm", idx: 1, permissions: ["manage_config"], boundary: "frontend" },
  { group: "Runtime", name: "Metrics", path: "/studio/admin/runtime/metrics", idx: -13, permissions: ["platform.manage_infra"], oldUrl: "/_svc/monitor", boundary: "p1" },
  { group: "Runtime", name: "Tool images", path: "/studio/admin/runtime/tool-images", idx: -14, permissions: ["manage_config"], oldUrl: "/_svc/toolimages", boundary: "p0" },
  { group: "Runtime", name: "Neo4j browser", path: "/studio/admin/runtime/neo4j", idx: -15, permissions: ["platform.manage_infra"], oldUrl: "/neo4j/browser/", boundary: "p0" },
  { group: "Security", name: "Roles", path: "/studio/admin/security/roles", idx: 11, permissions: ["manage_roles"], boundary: "backend" },
  { group: "Security", name: "API gateway", path: "/studio/admin/security/api-gateway", idx: -30, permissions: ["platform.manage_infra"], oldUrl: "/_svc/gateway/docs", boundary: "p1" },
  { group: "Security", name: "Auth service", path: "/studio/admin/security/auth-service", idx: -31, permissions: ["platform.manage_infra"], oldUrl: "/_svc/auth/health", boundary: "frontend" },
  { group: "Security", name: "Policy engine", path: "/studio/admin/security/policy-engine", idx: -32, permissions: ["platform.manage_infra"], oldUrl: "/_svc/policy/docs", boundary: "p1" },
  { group: "Security", name: "HPC policy", path: "/studio/admin/security/hpc-policy", idx: -33, permissions: ["manage_config"], oldUrl: "/_svc/hpc/", boundary: "p1" },
  { group: "Security", name: "Security audit", path: "/studio/admin/security/security-audit", idx: -34, permissions: ["manage_all_orgs"], oldUrl: "/_svc/audit/docs", boundary: "p1" },
  { group: "Security", name: "API keys and service accounts", path: "/studio/admin/security/service-accounts", idx: -35, permissions: ["manage_api_keys", "manage_oauth_clients", "manage_all_orgs"], oldUrl: "https://admin.omnibioai.org/iam/service-accounts", boundary: "standalone-admin" },
  { group: "Security", name: "Compliance center", path: "/studio/admin/security/compliance", idx: -36, permissions: ["manage_all_orgs"], oldUrl: "https://admin.omnibioai.org/hipaa-compliance", boundary: "standalone-admin" },
  { group: "Security", name: "Security posture", path: "/studio/admin/security/posture", idx: -37, permissions: ["manage_all_orgs"], oldUrl: "https://admin.omnibioai.org/security-posture", boundary: "standalone-admin" },
  { group: "Security", name: "Tool executor", path: "/studio/admin/security/tool-executor", idx: -38, permissions: ["manage_config"], oldUrl: "/_svc/toolserver/docs", boundary: "p1" },
  { group: "Security", name: "Audit explorer", path: "/studio/admin/security/audit-explorer", idx: -39, permissions: ["manage_all_orgs"], oldUrl: "https://admin.omnibioai.org/audit-explorer", boundary: "standalone-admin" },
  { group: "Security", name: "Audit logs", path: "/studio/admin/security/audit-logs", idx: -40, permissions: ["manage_all_orgs"], oldUrl: "https://admin.omnibioai.org/audit-logs", boundary: "standalone-admin" },
  { group: "Organization", name: "Connections", path: "/studio/admin/organization/connections", idx: 26, permissions: ["manage_org", "manage_all_orgs"], boundary: "backend" },
  { group: "Organization", name: "Organization settings", path: "/studio/admin/organization/settings", idx: -50, permissions: ["manage_org", "manage_all_orgs"], oldUrl: "https://admin.omnibioai.org/organizations", boundary: "standalone-admin" },
]);

const BY_PATH = new Map(ADMIN_ROUTE_DEFINITIONS.map(route => [route.path, route]));
const BY_INDEX = new Map(ADMIN_ROUTE_DEFINITIONS.map(route => [route.idx, route]));

export function adminRouteForPath(path) { return BY_PATH.get(path) || null; }
export function adminRouteForIndex(index) { return BY_INDEX.get(index) || null; }
export function canAccessAdminRoute(user, route) {
  const granted = new Set(user?.permissions || []);
  return !!route && route.permissions.some(permission => granted.has(permission));
}
