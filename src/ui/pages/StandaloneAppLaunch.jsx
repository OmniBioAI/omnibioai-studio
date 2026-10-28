import React from "react";
import { useAppearance } from "../components/AppearanceProvider";
import { getStandaloneOnlyApp, standaloneAppUrl } from "../lib/standaloneApps";

export default function StandaloneAppLaunch({ url = "https://admin.omnibioai.org/" }) {
  const appearance = useAppearance();
  const app = getStandaloneOnlyApp(url);
  const label = app?.label || "Application";
  const href = standaloneAppUrl(url, appearance.resolvedTheme);

  return (
    <section aria-labelledby="standalone-app-heading" style={{ maxWidth: 720, margin: "48px auto", padding: 24 }}>
      <h1 id="standalone-app-heading">{label}</h1>
      <p>{label} runs as a standalone app and cannot be displayed inside Studio.</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${label} in a new tab`}
        style={{
          display: "inline-flex", alignItems: "center", minHeight: 44, padding: "8px 14px",
          borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "var(--bg)",
          fontWeight: 600, textDecoration: "none",
        }}
      >
        Open {label} in a new tab
      </a>
    </section>
  );
}
