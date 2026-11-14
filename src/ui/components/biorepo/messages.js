// User-facing text for BioRepository API error codes. The server message is
// shown only for validation codes, where it says what to fix.
const TEXT = {
  unauthorized: "Sign in again to use the repository.",
  forbidden: "You don’t have permission for this. Ask an organization admin for BioRepository access.",
  FORBIDDEN: "You don’t have permission for this. Ask an organization admin for BioRepository access.",
  ORGANIZATION_REQUIRED: "Choose an active organization first.",
  ORIGIN_NOT_ALLOWED: "Repository changes can only be made from Studio.",
  DATASET_NOT_FOUND: "This dataset doesn’t exist or isn’t shared with you.",
  VERSION_NOT_FOUND: "This version doesn’t exist.",
  not_found: "Not found.",
  STORAGE_QUOTA_EXCEEDED: "This upload would exceed your storage allowance.",
  REPOSITORY_CAPACITY_HARD_STOP: "The repository volume is nearly full; new uploads are paused. Reads still work.",
  VERSION_IN_PROGRESS: "This dataset already has a version being prepared. Seal or delete it first.",
  UPLOAD_IN_PROGRESS: "Finish or cancel the open uploads first.",
  PATH_NOT_ALLOWED: "You can only register data inside your own tenant or organization folders.",
  PATH_NOT_FOUND: "Nothing found at that path.",
  unavailable: "The repository is unavailable right now. Please retry.",
  stale: "Your session changed. Reload to continue.",
};
const SHOW_SERVER_MESSAGE = new Set(["INVALID_FIELD", "UNKNOWN_FIELD", "UNKNOWN_TYPE", "FILE_EXISTS", "PATH_EMPTY",
  "TOO_MANY_FILES", "VERSION_EMPTY", "INVALID_QUERY", "VERSION_SEALED", "INVALID_PATH"]);

export function errorText(error) {
  const code = error?.code || "unavailable";
  if (SHOW_SERVER_MESSAGE.has(code) && error?.message && error.message !== code) return error.message;
  return TEXT[code] || TEXT.unavailable;
}

export function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = n;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return unit === 0 ? `${n} B` : `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}
