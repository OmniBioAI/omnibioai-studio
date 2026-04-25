import React, { useState, useRef, useEffect } from "react";
import { Panel, PanelHeader, PanelBody, HealthCard, Btn } from "../components/UI";

const HEALTH = [
  { label: "MySQL",    status: "up",   port: ":3306"  },
  { label: "Workbench",status: "up",   port: ":8000"  },
  { label: "TES",      status: "up",   port: ":8081"  },
  { label: "Ollama",   status: "warn", port: ":11434" },
  { label: "RAG",      status: "down", port: ":8500"  },
];

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

export default function Launch({ config, onStatusChange }) {
  const [status, setStatus] = useState("idle"); // idle | starting | running | error
  const [logs, setLogs] = useState([
    { time: "08:14:01", type: "info", msg: "Studio initialized" },
    { time: "08:14:02", type: "ok",   msg: "MySQL connected on :3306" },
    { time: "08:14:02", type: "ok",   msg: "Redis connected on :6379" },
    { time: "08:14:03", type: "warn", msg: "Ollama initializing..." },
    { time: "08:14:04", type: "err",  msg: "RAG service unavailable" },
  ]);
  const logRef = useRef(null);

  const addLog = (type, msg) => {
    setLogs((prev) => [...prev, { time: timestamp(), type, msg }]);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const startSystem = async () => {
    if (status === "starting" || status === "running") return;
    setStatus("starting");
    onStatusChange?.("starting");

    const seq = [
      [200,  "info", "Saving configuration to disk..."],
      [600,  "ok",   "Configuration persisted"],
      [1000, "info", "Checking Docker daemon..."],
      [1500, "ok",   "Docker healthy"],
      [1900, "info", `Starting ${(config.mode || "local").toUpperCase()} stack...`],
      [2400, "ok",   "MySQL container started"],
      [2700, "ok",   "Redis container started"],
      [3000, "ok",   "TES service online :8081"],
      [3300, "warn", "Ollama pulling model deepseek-coder..."],
      [4000, "ok",   "All critical services healthy"],
      [4200, "info", "Opening workbench at :8000"],
    ];

    for (const [delay, type, msg] of seq) {
      await new Promise((r) => setTimeout(r, delay));
      addLog(type, msg);
    }

    setStatus("running");
    onStatusChange?.("running");

    // In real app: await window.api.saveConfig(config); await window.api.startDocker();
  };

  const stopSystem = async () => {
    addLog("warn", "Stopping all containers...");
    setTimeout(() => {
      addLog("ok", "Stack stopped cleanly");
      setStatus("idle");
      onStatusChange?.("idle");
    }, 800);
    // In real app: await window.api.stopDocker();
  };

  const typeColors = {
    info: "#0094ff",
    ok:   "#00e5a0",
    err:  "#ff4757",
    warn: "#ffa502",
  };

  const typeLabels = {
    info: "INFO",
    ok:   "OK  ",
    err:  "ERR ",
    warn: "WARN",
  };

  const llm   = config.llm   || {};
  const cloud = config.cloud || {};
  const hpc   = config.hpc   || {};

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
            Execution Console
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>
            review configuration and boot the runtime stack
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={stopSystem}>Stop Stack</Btn>
          <Btn
            variant="primary"
            onClick={startSystem}
            disabled={status === "starting"}
            style={
              status === "running"
                ? {
                    background: "rgba(0,229,160,0.15)",
                    color: "var(--accent)",
                    border: "1px solid rgba(0,229,160,0.3)",
                  }
                : {}
            }
          >
            {status === "starting" ? "Booting..." : status === "running" ? "Running" : "Boot System"}
          </Btn>
        </div>
      </div>

      {/* Health Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5,1fr)",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {HEALTH.map((h) => (
          <HealthCard key={h.label} {...h} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Runtime Summary */}
        <Panel>
          <PanelHeader title="Runtime Summary" icon iconColor="teal" />
          <PanelBody style={{ padding: "10px 16px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "var(--mono)" }}>
              {[
                ["Mode",         config.mode || "local",                     "var(--accent)"],
                ["Ollama",       llm.enable_ollama ? "Enabled" : "Disabled", llm.enable_ollama ? "var(--accent)" : "var(--muted)"],
                ["Claude API",   llm.enable_claude ? "Enabled" : "Disabled", llm.enable_claude ? "var(--accent)" : "var(--muted)"],
                ["OpenAI",       llm.enable_openai ? "Enabled" : "Disabled", llm.enable_openai ? "var(--accent)" : "var(--muted)"],
                ["AWS Batch",    cloud.enable_aws_batch ? "Enabled" : "Disabled", cloud.enable_aws_batch ? "var(--accent)" : "var(--muted)"],
                ["HPC Scheduler",hpc.scheduler || "Not configured",          hpc.scheduler ? "var(--text)" : "var(--muted)"],
              ].map(([label, val, color]) => (
                <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 0", color: "var(--muted)" }}>{label}</td>
                  <td style={{ textAlign: "right", color }}>{val}</td>
                </tr>
              ))}
            </table>
          </PanelBody>
        </Panel>

        {/* Logs */}
        <Panel>
          <PanelHeader title="System Logs" icon iconColor="blue" />
          <PanelBody style={{ padding: 10 }}>
            <div
              ref={logRef}
              style={{
                background: "var(--bg2)",
                borderRadius: 6,
                padding: 10,
                height: 180,
                overflowY: "auto",
                fontFamily: "var(--mono)",
                fontSize: 10,
                scrollbarWidth: "thin",
              }}
            >
              {logs.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "1px 0" }}>
                  <span style={{ color: "var(--muted)", flexShrink: 0 }}>{l.time}</span>
                  <span style={{ color: typeColors[l.type], flexShrink: 0 }}>{typeLabels[l.type]}</span>
                  <span style={{ color: "var(--text)" }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}