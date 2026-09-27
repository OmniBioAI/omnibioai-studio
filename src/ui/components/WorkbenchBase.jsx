import React from "react";

/**
 * Shared layout boundary for native Workbench pages.  Studio owns branding,
 * authentication, navigation, and the application shell; this component only
 * supplies the full-width, responsive content region used by Workbench.
 */
export default function WorkbenchBase({ children, className = "" }) {
  return <main className={`workbench-base ${className}`.trim()}>{children}</main>;
}
