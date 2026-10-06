const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { projectConfig } = require("./providerConfig");

/**
 * Get safe user config directory (macOS / Windows / Linux)
 */
function getConfigPath() {
  const userDataDir = app.getPath("userData");

  return path.join(userDataDir, "omnibioai.config.json");
}

/**
 * Write config safely
 */
function writeConfig(config) {
  try {
    const configPath = getConfigPath();

    fs.writeFileSync(
      configPath,
      JSON.stringify(projectConfig(config), null, 2),
      { encoding: "utf-8", mode: 0o600 }
    );

    fs.chmodSync(configPath, 0o600);
    return {
      success: true,
      path: configPath
    };

  } catch (err) {
    console.error("Failed to write configuration");

    return {
      success: false,
      error: "Unable to save configuration"
    };
  }
}

/**
 * Read config safely
 */
function readConfig() {
  try {
    const configPath = getConfigPath();

    if (!fs.existsSync(configPath)) {
      return null;
    }

    const safe = projectConfig(JSON.parse(fs.readFileSync(configPath, "utf-8")));
    // Retire legacy fields before returning anything to the renderer.
    const result = writeConfig(safe);
    if (!result.success) safe.provider_credential_retirement_pending = true;
    return safe;

  } catch (err) {
    console.error("Failed to read configuration");
    return null;
  }
}

/**
 * Reset config
 */
function resetConfig() {
  const configPath = getConfigPath();

  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

module.exports = {
  writeConfig,
  readConfig,
  resetConfig,
  getConfigPath
};