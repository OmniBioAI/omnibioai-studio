import React, { useState, useEffect, useCallback, useRef } from "react";

function getHost() {
  return (
    window.__OMNIBIOAI_SERVER__ ||
    import.meta.env.VITE_HOST ||
    "192.168.86.234"
  );
}

// In dev mode use Vite proxy (/_tes) to avoid CORS; in prod call TES directly.
function tesUrl(path) {
  if (import.meta.env.DEV) return `/_tes${path}`;
  return `http://${getHost()}:8081${path}`;
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(tesUrl(path), {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    signal: opts.signal || AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

const STATE_COLOR = {
  COMPLETED:  "#00e5a0",
  RUNNING:    "#0094ff",
  QUEUED:     "#ffa502",
  CREATED:    "#a78bfa",
  VALIDATED:  "#a78bfa",
  FAILED:     "#ff4757",
  CANCELLED:  "#6b7280",
};

function Badge({ state }) {
  return (
    <span style={{
      fontSize: 9, fontFamily: "var(--mono)", padding: "2px 7px",
      borderRadius: 3, letterSpacing: "0.06em",
      background: `${STATE_COLOR[state] || "#6b7280"}22`,
      color: STATE_COLOR[state] || "#6b7280",
      border: `1px solid ${STATE_COLOR[state] || "#6b7280"}44`,
    }}>
      {state}
    </span>
  );
}

function ts(epoch) {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleTimeString();
}

export default function Jobs() {
  const [runs,     setRuns]     = useState([]);
  const [tools,    setTools]    = useState([]);
  const [servers,  setServers]  = useState([]);
  const [selected, setSelected] = useState(null); // run_id for detail panel
  const [logs,     setLogs]     = useState("");
  const [detail,   setDetail]   = useState(null);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(true);

  // Submit form state
  const [showSubmit,  setShowSubmit]  = useState(false);
  const [toolId,      setToolId]      = useState("");
  const [inputsJson,  setInputsJson]  = useState("{}");
  const [resourcesJson, setResourcesJson] = useState("{}");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitErr,   setSubmitErr]   = useState("");

  const pollRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [r, t, s] = await Promise.all([
        apiFetch("/api/runs"),
        apiFetch("/api/tools"),
        apiFetch("/api/servers"),
      ]);
      setRuns(r);
      setTools(t);
      setServers(s);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 5000);
    return () => clearInterval(pollRef.current);
  }, [loadData]);

  const openDetail = async (run_id) => {
    setSelected(run_id);
    setLogs("");
    setDetail(null);
    try {
      const [d, l] = await Promise.all([
        apiFetch(`/api/runs/${run_id}`),
        apiFetch(`/api/runs/${run_id}/logs`),
      ]);
      setDetail(d);
      setLogs(typeof l === "string" ? l : JSON.stringify(l, null, 2));
    } catch (e) {
      setLogs(`Error loading logs: ${e.message}`);
    }
  };

  const submitRun = async () => {
    setSubmitErr("");
    let inputs, resources;
    try {
      inputs    = JSON.parse(inputsJson);
      resources = JSON.parse(resourcesJson);
    } catch (e) {
      setSubmitErr(`JSON parse error: ${e.message}`);
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/runs/submit", {
        method: "POST",
        body: JSON.stringify({ tool_id: toolId, inputs, resources }),
      });
      setShowSubmit(false);
      setToolId("");
      setInputsJson("{}");
      setResourcesJson("{}");
      loadData();
    } catch (e) {
      setSubmitErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const mono = { fontFamily: "var(--mono)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
            Jobs
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", ...mono }}>
            TES execution engine — port 8081
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadData} style={{
            padding: "6px 12px", borderRadius: 5, fontSize: 11, ...mono,
            background: "var(--bg3)", border: "1px solid var(--border2)",
            color: "var(--muted)", cursor: "pointer",
          }}>↻ Refresh</button>
          <button onClick={() => setShowSubmit(s => !s)} style={{
            padding: "6px 16px", borderRadius: 5, fontSize: 11,
            fontFamily: "var(--font)", fontWeight: 600,
            background: "var(--accent)", border: "none", color: "#000", cursor: "pointer",
          }}>+ Submit Run</button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(255,71,87,0.06)", border: "1px solid rgba(255,71,87,0.2)",
          fontSize: 12, color: "var(--danger)", ...mono,
        }}>
          {error}
        </div>
      )}

      {/* Submit form */}
      {showSubmit && (
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Submit New Run
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                Tool ID
              </label>
              <select
                value={toolId}
                onChange={e => setToolId(e.target.value)}
                style={{
                  width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)",
                  borderRadius: 6, padding: "7px 10px", fontSize: 12, ...mono,
                  color: "var(--text)", outline: "none",
                }}
              >
                <option value="">— select tool —</option>
                {tools.map(t => (
                  <option key={t.tool_id} value={t.tool_id} style={{ background: "var(--bg2)" }}>
                    {t.tool_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                Inputs (JSON)
              </label>
              <textarea
                value={inputsJson}
                onChange={e => setInputsJson(e.target.value)}
                rows={4}
                style={{
                  width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)",
                  borderRadius: 6, padding: "7px 10px", fontSize: 11, ...mono,
                  color: "var(--text)", outline: "none", resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                Resources (JSON)
              </label>
              <textarea
                value={resourcesJson}
                onChange={e => setResourcesJson(e.target.value)}
                rows={4}
                style={{
                  width: "100%", background: "var(--bg2)", border: "1px solid var(--border2)",
                  borderRadius: 6, padding: "7px 10px", fontSize: 11, ...mono,
                  color: "var(--text)", outline: "none", resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {submitErr && (
            <div style={{ fontSize: 11, color: "var(--danger)", ...mono }}>{submitErr}</div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={submitRun}
              disabled={!toolId || submitting}
              style={{
                padding: "7px 20px", borderRadius: 6, fontSize: 12,
                fontFamily: "var(--font)", fontWeight: 600,
                background: (!toolId || submitting) ? "var(--bg2)" : "var(--accent)",
                border: "none", color: (!toolId || submitting) ? "var(--muted)" : "#000",
                cursor: (!toolId || submitting) ? "not-allowed" : "pointer",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
            <button onClick={() => setShowSubmit(false)} style={{
              padding: "7px 14px", borderRadius: 6, fontSize: 11,
              fontFamily: "var(--font)", background: "transparent",
              border: "1px solid var(--border2)", color: "var(--muted)", cursor: "pointer",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Total Runs",   value: runs.length,                                         color: "var(--text)"    },
          { label: "Running",      value: runs.filter(r => r.state === "RUNNING").length,       color: "#0094ff"        },
          { label: "Completed",    value: runs.filter(r => r.state === "COMPLETED").length,     color: "#00e5a0"        },
          { label: "Failed",       value: runs.filter(r => r.state === "FAILED").length,        color: "#ff4757"        },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "var(--bg3)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 14px",
          }}>
            <div style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color, ...mono }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Main content: runs table + detail panel */}
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 12 }}>

        {/* Runs table */}
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text)" }}>
              Run History
            </span>
            <span style={{ fontSize: 9, ...mono, color: "var(--muted)" }}>
              {runs.length} runs
            </span>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--muted)", ...mono }}>
              Loading...
            </div>
          ) : runs.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: "var(--muted)", ...mono }}>
              No runs yet — submit one above
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Run ID", "Tool", "State", "Server", "Created", ""].map(h => (
                    <th key={h} style={{
                      padding: "7px 14px", textAlign: h === "" ? "right" : "left",
                      fontSize: 9, ...mono, color: "var(--muted)",
                      letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...runs].reverse().map((run, i) => (
                  <tr key={run.run_id}
                    onClick={() => openDetail(run.run_id)}
                    style={{
                      borderBottom: i < runs.length - 1 ? "1px solid var(--border)" : "none",
                      background: selected === run.run_id ? "rgba(0,229,160,0.04)" : "transparent",
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (selected !== run.run_id) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                    onMouseLeave={e => { if (selected !== run.run_id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "9px 14px", fontSize: 10, ...mono, color: "var(--muted)" }}>
                      {run.run_id.slice(0, 14)}…
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 11, color: "var(--text)", fontWeight: 500 }}>
                      {run.tool_id}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <Badge state={run.state} />
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 10, ...mono, color: "var(--muted)" }}>
                      {run.server_id || "—"}
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 10, ...mono, color: "var(--muted)" }}>
                      {ts(run.created_epoch)}
                    </td>
                    <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 10, ...mono, color: "var(--accent2)" }}>
                      →
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{
            background: "var(--bg3)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column",
          }}>
            <div style={{
              padding: "10px 16px", borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text)" }}>
                Run Detail
              </span>
              <button onClick={() => setSelected(null)} style={{
                background: "transparent", border: "none", color: "var(--muted)",
                cursor: "pointer", fontSize: 14, padding: 0,
              }}>✕</button>
            </div>

            <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
              {detail && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                  {[
                    ["Run ID",    detail.run_id],
                    ["Tool",      detail.tool_id],
                    ["State",     <Badge state={detail.state} />],
                    ["Server",    detail.server_id || "—"],
                    ["Created",   ts(detail.created_epoch)],
                    ["Updated",   ts(detail.updated_epoch)],
                    ["Exit Code", detail.exit_code ?? "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0, width: 70, paddingTop: 1 }}>
                        {k}
                      </span>
                      <span style={{ fontSize: 11, ...mono, color: "var(--text)" }}>{v}</span>
                    </div>
                  ))}
                  {detail.inputs && Object.keys(detail.inputs).length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                        Inputs
                      </div>
                      <pre style={{
                        fontSize: 10, ...mono, color: "var(--text)",
                        background: "var(--bg2)", padding: "8px 10px", borderRadius: 6,
                        margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                      }}>
                        {JSON.stringify(detail.inputs, null, 2)}
                      </pre>
                    </div>
                  )}
                  {detail.error && (
                    <div>
                      <div style={{ fontSize: 9, ...mono, color: "var(--danger)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                        Error
                      </div>
                      <pre style={{
                        fontSize: 10, ...mono, color: "var(--danger)",
                        background: "rgba(255,71,87,0.06)", padding: "8px 10px", borderRadius: 6,
                        margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                      }}>
                        {JSON.stringify(detail.error, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                Logs
              </div>
              <pre style={{
                fontSize: 10, ...mono, color: "var(--text)",
                background: "var(--bg2)", padding: "10px 12px", borderRadius: 6,
                margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
                maxHeight: 320, overflowY: "auto",
              }}>
                {logs || "No logs yet"}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Servers & Tools info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

        {/* Servers */}
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text)" }}>
              Execution Servers
            </span>
            <span style={{ fontSize: 9, ...mono, color: "var(--muted)" }}>{servers.length}</span>
          </div>
          {servers.length === 0 ? (
            <div style={{ padding: 14, fontSize: 11, color: "var(--muted)", ...mono }}>No servers configured</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Server ID", "Adapter", "Status"].map(h => (
                    <th key={h} style={{ padding: "6px 14px", textAlign: "left", fontSize: 9, ...mono, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {servers.map((s, i) => (
                  <tr key={s.server_id} style={{ borderBottom: i < servers.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: "var(--text)", fontWeight: 500 }}>{s.server_id}</td>
                    <td style={{ padding: "8px 14px", fontSize: 10, ...mono, color: "var(--muted)" }}>{s.adapter_type}</td>
                    <td style={{ padding: "8px 14px" }}>
                      <span style={{ fontSize: 9, ...mono, color: s.capabilities ? "#00e5a0" : "#ffa502" }}>
                        {s.capabilities ? "● ready" : "◐ pending"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Tools */}
        <div style={{
          background: "var(--bg3)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text)" }}>
              Registered Tools
            </span>
            <span style={{ fontSize: 9, ...mono, color: "var(--muted)" }}>{tools.length}</span>
          </div>
          {tools.length === 0 ? (
            <div style={{ padding: 14, fontSize: 11, color: "var(--muted)", ...mono }}>No tools registered</div>
          ) : (
            <div style={{ padding: "4px 0", maxHeight: 220, overflowY: "auto" }}>
              {tools.map(t => (
                <div key={t.tool_id} style={{
                  padding: "7px 14px", borderBottom: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 11, color: "var(--text)", fontWeight: 500 }}>{t.tool_id}</span>
                  <span style={{ fontSize: 9, ...mono, color: "var(--muted)" }}>
                    {[t.http && "http", t.slurm && "slurm"].filter(Boolean).join(" · ") || "local"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
