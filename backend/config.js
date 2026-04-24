const fs = require("fs");
const path = require("path");
const { app } = require("electron");

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
      JSON.stringify(config, null, 2),
      "utf-8"
    );

    return {
      success: true,
      path: configPath
    };

  } catch (err) {
    console.error("Failed to write config:", err);

    return {
      success: false,
      error: err.message
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

    return JSON.parse(
      fs.readFileSync(configPath, "utf-8")
    );

  } catch (err) {
    console.error("Failed to read config:", err);
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