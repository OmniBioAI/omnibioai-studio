import React, { useState, useRef, useEffect } from "react";
import { Panel, PanelHeader, PanelBody, Btn } from "../components/UI";

const SERVICES = [
  { key: "mysql",     label: "MySQL",     port: ":3306"  },
  { key: "workbench", label: "Workbench", port: ":8000"  },
  { key: "tes",       label: "TES",       port: ":8081"  },
  { key: "ollama",    label: "Ollama",    port: ":11434" },
];

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function HealthCard({ label, status, port }) {
  const colorMap = { up:"#00e5a0", warn:"#ffa502", down:"#ff4757", unknown:"#6b7280" };
  const labelMap = { up:"● UP", warn:"◐ INIT", down:"✕ DOWN", unknown:"— —" };
  const color = colorMap[status] || colorMap.unknown;
  return (
    <div style={{
      background:"var(--bg3)", border:"1px solid var(--border)",
      borderRadius:8, padding:"10px 12px", position:"relative", overflow:"hidden", minWidth:0,
    }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:color }} />
      <div style={{ fontSize:9, fontFamily:"var(--mono)", color:"var(--muted)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>
        {label}
      </div>
      <div style={{ fontSize:11, fontWeight:500, fontFamily:"var(--mono)", color }}>
        {labelMap[status] || "— —"}
      </div>
      <div style={{ fontSize:9, color:"var(--muted)", fontFamily:"var(--mono)", marginTop:2 }}>{port}</div>
    </div>
  );
}

export default function Launch({ config, onStatusChange }) {
  const [status, setStatus]  = useState("idle");
  const [health, setHealth]  = useState({
    mysql:"unknown", workbench:"unknown", tes:"unknown", ollama:"unknown", rag:"unknown",
  });
  const [logs, setLogs] = useState([
    { time:"—:—:—", type:"info", msg:"Studio initialized — waiting for boot" },
  ]);
  const logRef  = useRef(null);
  const pollRef = useRef(null);

  const addLog = (type, msg) =>
    setLogs((prev) => [...prev, { time: timestamp(), type, msg }]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Real Docker compose output via IPC
  useEffect(() => {
    if (!window.api?.onDockerLog) return;
    window.api.onDockerLog((line) => {
      setLogs((prev) => [...prev, { time: timestamp(), type: "info", msg: line }]);
    });
  }, []);

  // Live health polling every 5s
  useEffect(() => {
    const poll = async () => {
      try {
        if (window.api?.checkHealth) {
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
  }, []);

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
        // Dev fallback — no Electron API
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

  const typeColors = { info:"#0094ff", ok:"#00e5a0", err:"#ff4757", warn:"#ffa502" };
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
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>
            review configuration and boot the runtime stack
          </div>
        </div>
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
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"var(--mono)" }}>
              {[
                ["Mode",          config.mode || "local",                 "var(--accent)"],
                ["Ollama",        llm.enable_ollama  ? "Enabled":"Disabled", llm.enable_ollama  ? "var(--accent)":"var(--muted)"],
                ["Claude API",    llm.enable_claude  ? "Enabled":"Disabled", llm.enable_claude  ? "var(--accent)":"var(--muted)"],
                ["OpenAI",        llm.enable_openai  ? "Enabled":"Disabled", llm.enable_openai  ? "var(--accent)":"var(--muted)"],
                ["AWS Batch",     cloud.enable_aws_batch ? "Enabled":"Disabled", cloud.enable_aws_batch ? "var(--accent)":"var(--muted)"],
                ["HPC Scheduler", hpc.scheduler || "Not configured",       hpc.scheduler ? "var(--text)":"var(--muted)"],
              ].map(([label, val, color]) => (
                <tr key={label} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"7px 0", color:"var(--muted)" }}>{label}</td>
                  <td style={{ textAlign:"right", color }}>{val}</td>
                </tr>
              ))}
            </table>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="System Logs" icon iconColor="blue">
            <button onClick={() => setLogs([])} style={{
              fontSize:9, fontFamily:"var(--mono)", color:"var(--muted)",
              background:"transparent", border:"none", cursor:"pointer", letterSpacing:"0.06em",
            }}>CLEAR</button>
          </PanelHeader>
          <PanelBody style={{ padding:10 }}>
            <div ref={logRef} style={{
              background:"var(--bg2)", borderRadius:6, padding:10,
              height:200, overflowY:"auto", fontFamily:"var(--mono)",
              fontSize:10, scrollbarWidth:"thin",
            }}>
              {logs.map((l, i) => (
                <div key={i} style={{ display:"flex", gap:8, padding:"2px 0" }}>
                  <span style={{ color:"var(--muted)", flexShrink:0 }}>{l.time}</span>
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