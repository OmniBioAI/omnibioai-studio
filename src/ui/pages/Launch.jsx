import React, { useState, useRef, useEffect } from "react";
import { Panel, PanelHeader, PanelBody, Btn } from "../components/UI";

const SERVICES = [
  { key: "mysql",     label: "MySQL",     port: ":3306"  },
  { key: "workbench", label: "Workbench", port: ":8000"  },
  { key: "tes",       label: "TES",       port: ":8081"  },
  { key: "ollama",    label: "Ollama",    port: ":11434" },
];

const BETA_HEALTH_URLS = {
  workbench: "/_svc/workbench/",
  tes:       "/_svc/tes/",
  ollama:    "/_svc/ollama/",
  mysql:     "/_svc/lims/",
};

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function HealthCard({ label, status, port }) {
  const colorMap = {
    up:      "var(--accent)",
    warn:    "var(--color-warning)",
    down:    "var(--color-danger)",
    unknown: "var(--color-text-muted)",
  };
  const labelMap = { up:"● UP", warn:"◐ INIT", down:"✕ DOWN", unknown:"— —" };
  const color = colorMap[status] || colorMap.unknown;
  return (
    <div style={{
      background:"var(--bg3)", border:"1px solid var(--border)",
      borderRadius:'var(--radius)', padding:"10px 12px", position:"relative", overflow:"hidden", minWidth:0,
    }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:color }} />
      <div style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>
        {label}
      </div>
      <div style={{ fontSize:'var(--font-size-xs)', fontWeight:500, fontFamily:"var(--mono)", color }}>
        {labelMap[status] || "— —"}
      </div>
      <div style={{ fontSize:'var(--font-size-xs)', color:"var(--color-text-muted)", fontFamily:"var(--mono)", marginTop:2 }}>{port}</div>
    </div>
  );
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch (_) {
    return false;
  }
}

export default function Launch({ config, onStatusChange }) {
  const isBeta = config?.mode === "beta";

  const [status, setStatus]  = useState(isBeta ? "running" : "idle");
  const [health, setHealth]  = useState({
    mysql:"unknown", workbench:"unknown", tes:"unknown", ollama:"unknown", rag:"unknown",
  });
  const [logs, setLogs] = useState(
    isBeta
      ? [{ time: timestamp(), type:"ok",  msg:"Beta mode — connected to app.omnibioai.org" }]
      : [{ time:"—:—:—",     type:"info", msg:"Studio initialized — waiting for boot" }]
  );
  const logRef  = useRef(null);
  const pollRef = useRef(null);

  const addLog = (type, msg) =>
    setLogs((prev) => [...prev, { time: timestamp(), type, msg }]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Docker compose output via IPC (local mode only)
  useEffect(() => {
    if (isBeta || !window.api?.onDockerLog) return;
    window.api.onDockerLog((line) => {
      setLogs((prev) => [...prev, { time: timestamp(), type: "info", msg: line }]);
    });
  }, [isBeta]);

  // Health polling — beta uses tunnel URLs, local uses docker IPC
  useEffect(() => {
    const poll = async () => {
      try {
        if (isBeta) {
          const results = await Promise.all(
            SERVICES.map(async (s) => {
              const url = BETA_HEALTH_URLS[s.key];
              const up = url ? await checkUrl(url) : false;
              return [s.key, up ? "up" : "down"];
            })
          );
          const next = Object.fromEntries(results);
          setHealth(prev => ({ ...prev, ...next }));
        } else if (window.api?.checkHealth) {
          const r = await window.api.checkHealth();
          setHealth({
            mysql:     r.mysql     ? "up" : "down",
            workbench: r.workbench ? "up" : "down",
            tes:       r.tes       ? "up" : "down",
            ollama:    r.ollama    ? "up" : "warn",
            rag:       r.rag       ? "up" : "down",
          });
        }
      } catch (_) {}
    };
    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => clearInterval(pollRef.current);
  }, [isBeta]);

  // Beta: log connection events when health changes
  const prevHealthRef = useRef({});
  useEffect(() => {
    if (!isBeta) return;
    const prev = prevHealthRef.current;
    Object.entries(health).forEach(([key, st]) => {
      if (prev[key] !== undefined && prev[key] !== st) {
        const label = SERVICES.find(s => s.key === key)?.label || key;
        if (st === "up")   addLog("ok",   `${label} tunnel — reachable`);
        if (st === "down") addLog("warn", `${label} tunnel — unreachable`);
      }
    });
    prevHealthRef.current = { ...health };
  }, [health, isBeta]);

  const startSystem = async () => {
    if (status === "starting" || status === "running") return;
    setStatus("starting");
    onStatusChange?.("starting");
    try {
      addLog("info", "Saving configuration...");
      if (window.api?.saveConfig) await window.api.saveConfig(config);
      addLog("ok", "Configuration persisted");

      addLog("info", `Starting ${(config.mode || "local").toUpperCase()} stack...`);
      if (window.api?.startDocker) {
        await window.api.startDocker();
      } else {
        await new Promise(r => setTimeout(r, 1200));
        addLog("warn", "Electron API not available — run via: npm run dev");
      }

      if (window.api?.openWorkbench) await window.api.openWorkbench();
      addLog("info", "Workbench available at :8000");

      setStatus("running");
      onStatusChange?.("running");
      addLog("ok", "OmniBioAI Studio is running");
    } catch (err) {
      setStatus("error");
      onStatusChange?.("error");
      addLog("err", `Boot failed: ${err?.message || String(err)}`);
    }
  };

  const stopSystem = async () => {
    addLog("warn", "Stopping all containers...");
    try {
      if (window.api?.stopDocker) await window.api.stopDocker();
      else await new Promise(r => setTimeout(r, 600));
      addLog("ok", "Stack stopped cleanly");
      setStatus("idle");
      onStatusChange?.("idle");
      setHealth({ mysql:"unknown", workbench:"unknown", tes:"unknown", ollama:"unknown", rag:"unknown" });
    } catch (err) {
      addLog("err", `Stop failed: ${err?.message || String(err)}`);
    }
  };

  const typeColors = {
    info: "#0094ff",
    ok:   "var(--accent)",
    err:  "var(--color-danger)",
    warn: "var(--color-warning)",
  };
  const typeLabels = { info:"INFO", ok:"OK  ", err:"ERR ", warn:"WARN" };
  const llm   = config.llm   || {};
  const cloud = config.cloud || {};
  const hpc   = config.hpc   || {};

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Execution Console
          </div>
          <div style={{ fontSize:'var(--font-size-sm)', color:"var(--color-text-muted)", fontFamily:"var(--mono)" }}>
            {isBeta ? "connected to cloud — monitoring tunnel services" : "review configuration and boot the runtime stack"}
          </div>
        </div>

        {isBeta ? (
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"8px 16px", borderRadius:'var(--radius)',
            background:"rgba(0,229,160,0.08)", border:"1px solid rgba(0,229,160,0.25)",
          }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:"var(--accent)", animation:"pulse 2s infinite" }} />
            <span style={{ fontSize:'var(--font-size-sm)', fontFamily:"var(--mono)", fontWeight:500, color:"var(--accent)" }}>
              Connected to Cloud
            </span>
            <span style={{ fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
              app.omnibioai.org
            </span>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <Btn variant="ghost" onClick={stopSystem}>Stop Stack</Btn>
            <Btn variant="primary" onClick={startSystem} disabled={status === "starting"}
              style={status === "running" ? {
                background:"rgba(0,229,160,0.12)", color:"var(--accent)",
                border:"1px solid rgba(0,229,160,0.25)",
              } : {}}>
              {status === "starting" ? "Booting..." : status === "running" ? "● Running" : "Boot System"}
            </Btn>
          </div>
        )}
      </div>

      {/* Health Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8 }}>
        {SERVICES.map(s => <HealthCard key={s.key} label={s.label} status={health[s.key]} port={s.port} />)}
      </div>

      {/* Summary + Logs */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Panel>
          <PanelHeader title="Runtime Summary" icon iconColor="teal" />
          <PanelBody style={{ padding:"10px 16px" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)" }}>
              {[
                ["Mode",          config.mode || "beta",                 "var(--accent)"],
                ["Ollama",        llm.enable_ollama  ? "Enabled":"Disabled", llm.enable_ollama  ? "var(--accent)":"var(--color-text-muted)"],
                ["Claude API",    llm.enable_claude  ? "Enabled":"Disabled", llm.enable_claude  ? "var(--accent)":"var(--color-text-muted)"],
                ["OpenAI",        llm.enable_openai  ? "Enabled":"Disabled", llm.enable_openai  ? "var(--accent)":"var(--color-text-muted)"],
                ["AWS Batch",     cloud.enable_aws_batch ? "Enabled":"Disabled", cloud.enable_aws_batch ? "var(--accent)":"var(--color-text-muted)"],
                ["HPC Scheduler", hpc.scheduler || "Not configured",       hpc.scheduler ? "var(--text)":"var(--color-text-muted)"],
              ].map(([label, val, color]) => (
                <tr key={label} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"7px 0", color:"var(--color-text-muted)" }}>{label}</td>
                  <td style={{ textAlign:"right", color }}>{val}</td>
                </tr>
              ))}
            </table>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title={isBeta ? "Connection Events" : "System Logs"} icon iconColor="blue">
            <button onClick={() => setLogs([])} style={{
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
              background:"transparent", border:"none", cursor:"pointer", letterSpacing:"0.06em",
            }}>CLEAR</button>
          </PanelHeader>
          <PanelBody style={{ padding:10 }}>
            <div ref={logRef} style={{
              background:"var(--bg2)", borderRadius:'var(--radius-sm)', padding:10,
              height:200, overflowY:"auto", fontFamily:"var(--mono)",
              fontSize:'var(--font-size-xs)', scrollbarWidth:"thin",
            }}>
              {logs.map((l, i) => (
                <div key={i} style={{ display:"flex", gap:8, padding:"2px 0" }}>
                  <span style={{ color:"var(--color-text-muted)", flexShrink:0 }}>{l.time}</span>
                  <span style={{ color:typeColors[l.type], flexShrink:0, minWidth:32 }}>{typeLabels[l.type]}</span>
                  <span style={{ color:"var(--text)" }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
