import * as Sentry from "@sentry/react";
import { useState } from "react";

export default function BugReport() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", email: "", severity: "medium" });
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit() {
    console.log("Sending to Sentry DSN:", import.meta.env.VITE_SENTRY_DSN);
    console.log("Bug report data:", form);
    Sentry.captureMessage(`Bug Report: ${form.title}`, {
      level: form.severity,
      extra: {
        description: form.description,
        email: form.email,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
      tags: {
        type: "bug_report",
        source: "studio_ui",
      },
    });
    setSubmitted(true);
    setTimeout(() => {
      setOpen(false);
      setSubmitted(false);
      setForm({ title: "", description: "", email: "", severity: "medium" });
    }, 2000);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 bg-red-600 hover:bg-red-700
                   text-white text-xs px-3 py-2 rounded-full shadow-lg
                   flex items-center gap-1 z-50"
        style={{
          position: "fixed", bottom: 16, left: 16,
          background: "#dc2626", color: "#fff",
          border: "none", borderRadius: 9999,
          padding: "6px 12px", fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)", zIndex: 9999,
        }}
      >
        🐛 Report Bug
      </button>

      {open && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999,
        }}>
          <div style={{
            background: "#1f2937", borderRadius: 16,
            padding: 24, width: "100%", maxWidth: 440,
            boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ color: "#fff", fontWeight: 700, fontSize: 16, margin: 0 }}>🐛 Report a Bug</h2>
              <button onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>

            {submitted ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ color: "#fff", margin: 0 }}>Bug reported! Thank you.</p>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Bug title"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  style={inputStyle}
                />
                <textarea
                  placeholder="Describe what happened..."
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <input
                  type="email"
                  placeholder="Your email (optional)"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  style={inputStyle}
                />
                <select
                  value={form.severity}
                  onChange={e => setForm({ ...form, severity: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 16 }}
                >
                  <option value="low">🟢 Low - Minor issue</option>
                  <option value="medium">🟡 Medium - Affects workflow</option>
                  <option value="high">🔴 High - Blocking issue</option>
                  <option value="fatal">💀 Critical - App crashed</option>
                </select>
                <button
                  onClick={handleSubmit}
                  disabled={!form.title || !form.description}
                  style={{
                    width: "100%", background: "#dc2626", color: "#fff",
                    border: "none", borderRadius: 8, padding: "10px 0",
                    fontWeight: 600, fontSize: 14, cursor: "pointer",
                    opacity: (!form.title || !form.description) ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  Submit Bug Report
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle = {
  width: "100%", background: "#374151", color: "#fff",
  border: "1px solid #4b5563", borderRadius: 8,
  padding: "8px 12px", marginBottom: 12, fontSize: 13,
  boxSizing: "border-box", outline: "none",
  fontFamily: "inherit",
};
