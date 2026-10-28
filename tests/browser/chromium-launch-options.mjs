export function chromiumLaunchOptions(options = {}) {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return executablePath ? { ...options, executablePath } : options;
}
