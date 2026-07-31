import React from "react";
import * as Sentry from "@sentry/react";

// Without this, an uncaught render error anywhere in the tree (e.g. a
// component-library hook crash) unmounts the *entire* app with nothing
// left in #root -- a blank screen and no way to navigate away short of a
// full reload. This turns that into a visible, recoverable error instead.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          height: "100vh", gap: 12, background: "var(--bg)", color: "var(--text)",
          fontFamily: "var(--font)", padding: 20, textAlign: "center",
        }}>
          <div style={{ fontSize: 32 }}>⚠</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Something went wrong</div>
          <div style={{
            fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)",
            fontFamily: "var(--mono)", maxWidth: 560, wordBreak: "break-word",
          }}>
            {this.state.error?.message || String(this.state.error)}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: "8px 18px", borderRadius: "var(--radius-sm)",
              background: "var(--accent)", border: "none", color: "#000",
              fontFamily: "var(--font)", fontWeight: 600, cursor: "pointer",
            }}
          >Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
