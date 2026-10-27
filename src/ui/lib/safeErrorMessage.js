/** Return a user-safe message without exposing transport or server details. */
const SAFE_CODE_MESSAGES = Object.freeze({
  invalid_key: "Invalid license key",
});

export function safeErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (Object.hasOwn(SAFE_CODE_MESSAGES, error?.code)) return SAFE_CODE_MESSAGES[error.code];
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "The requested item could not be found.";
  if (status === 408 || status === 429) return "The service is busy. Please try again shortly.";
  if (status >= 500) return "The service is temporarily unavailable. Please try again later.";
  return fallback;
}
