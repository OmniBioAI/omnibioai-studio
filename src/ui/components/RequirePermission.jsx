import React from "react";
import { Card, Badge } from "@omnibioai/ui";
import Login from "./Login";
import { isElectron } from "../lib/session";

// Same gate pattern as RoleManagement.jsx's own manage_roles check, generalized
// so LLM/Cloud/HPC config pages (all gated by manage_config) don't each repeat
// it. Kept separate from RoleManagement's own (working, already-shipped) inline
// version rather than refactoring that one too.
//
// Electron bypasses this entirely, same as App.jsx's own showLogin check
// (`!isElectron() && !currentUser`) -- there's no JWT/RBAC session in the
// desktop build (LicenseGate is its only gate), so currentUser is always
// null there. These three pages are the Electron setup wizard's core steps;
// without this carve-out every desktop user would hit "Sign in required"
// trying to configure their own local machine.
export default function RequirePermission({ currentUser, permission, description, children }) {
  if (isElectron()) {
    return children;
  }
  if (!currentUser) {
    return (
      <Login
        title="Sign in required"
        description={description || "This page requires an authenticated OmniBioAI account."}
      />
    );
  }
  if (!currentUser.permissions?.includes(permission)) {
    return <AccessDenied email={currentUser.email} permission={permission} />;
  }
  return children;
}

function AccessDenied({ email, permission }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "60px 16px 0", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center", boxSizing: "border-box" }}>
        <Card elevated>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Access denied</div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 12 }}>
            {email} does not have permission to view or edit this configuration.
          </div>
          <Badge variant="warning">requires: {permission}</Badge>
        </Card>
      </div>
    </div>
  );
}
