const path = require("node:path");

function environmentPath({ packaged, appPath, userDataPath }) {
  const base = packaged ? userDataPath : appPath;
  if (typeof base !== "string" || !path.isAbsolute(base)) {
    throw new Error("Studio environment path is invalid");
  }
  return path.join(base, ".env");
}

module.exports = { environmentPath };
