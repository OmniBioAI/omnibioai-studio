import React, { useState, useEffect, useRef } from "react";
import { Panel, PanelHeader, PanelBody } from "../components/UI";

const SOURCES = ["all", "mysql", "redis", "workbench", "tes", "toolserver", "ollama", "rag", "opa"];
const LEVEL_COLOR = { INFO:"#0094ff", OK:"#00e5a0", WARN:"#ffa502", ERR:"#ff4757", DEBUG:"#6b7280" };

const DEMO_LOGS = [
  { time:"08:14:01", source:"workbench",  level:"INFO", msg:"Starting OmniBioAI Workbench v0.1.0" },
  { time:"08:14:02", source:"mysql",      level:"OK",   msg:"MySQL ready on port 3306" },
  { time:"08:14:02", source:"redis",      level:"OK",   msg:"Redis connected, memory: 2.1MB" },
  { time:"08:14:03", source:"tes",        level:"INFO", msg:"TES initializing task scheduler" },
  { time:"08:14:04", source:"ollama",     level:"WARN", msg:"Model deepseek-coder:latest not found, pulling..." },
  { time:"08:14:05", source:"toolserver", level:"OK",   msg:"ToolServer ready, 48 tools registered" },
  { time:"08:14:07", source:"workbench",  level:"OK",   msg:"All dependencies resolved, workbench live" },
];

export default function Logs() {
  const [logs,    setLogs]    = useState(DEMO_LOGS);
  const [filter,  setFilter]  = useState("all");
  const [search,  setSearch]  = useState("");
  const [paused,  setPaused]  = useState(false);
  const [streaming, setStreaming] = useState(false);
  const logRef   = useRef(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    if (!paused && logRef.current)
      logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, paused]);

  useEffect(() => {
    if (window.api?.streamLogs) {
      setStreaming(true);
      window.api.streamLogs((line) => {
        if (pausedRef.current) return;
        setLogs(prev => [...prev.slice(-500), {
          time: new Date().toTimeString().slice(0,8),
          source:"docker", level:"INFO", msg: line
        }]);
      });
    }
  }, []);

  // Dev mode simulation
  useEffect(() => {
    if (window.api?.streamLogs) return;
    const msgs = [
      { source:"workbench",  level:"INFO", msg:"Processing workflow request WF-1042" },
      { source:"tes",        level:"INFO", msg:"Task submitted: bwa-mem2 alignment job" },
      { source:"ollama",     level:"WARN", msg:"Model load time: 4.2s (cold start)" },
      { source:"toolserver", level:"OK",   msg:"Tool execution completed in 1.8s" },
      { source:"mysql",      level:"INFO", msg:"Query optimized: 12ms avg" },
      { source:"tes",        level:"OK",   msg:"Task WF-1042 completed successfully" },
    ];
    let i = 0;
    const id = setInterval(() => {
      if (pausedRef.current) return;
      setLogs(prev => [...prev.slice(-500), {
        ...msgs[i % msgs.length],
        time: new Date().toTimeString().slice(0,8)
      }]);
      i++;
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const filtered = logs.filter(l => {
    const matchSource = filter === "all" || l.source === filter;
    const matchSearch = !search || l.msg.toLowerCase().includes(search.toLowerCase());
    return matchSource && matchSearch;
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Live Logs
          </div>
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>
            real-time docker service log stream
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {streaming && (
            <span style={{ fontSize:10, fontFamily:"var(--mono)", color:"var(--accent)", display:"flex", alignItems:"center", gap:5 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--accent)", display:"inline-block", animation:"pulse 2s infinite" }} />
              LIVE
            </span>
          )}
          <button onClick={() => setPaused(p => !p)} style={{
            padding:"5px 12px", borderRadius:5, fontSize:10, fontFamily:"var(--mono)",
            background: paused ? "rgba(255,165,2,0.12)" : "var(--bg3)",
            border: paused ? "1px solid rgba(255,165,2,0.25)" : "1px solid var(--border2)",
            color: paused ? "var(--warn)" : "var(--muted)", cursor:"pointer",
          }}>{paused ? "▶ Resume" : "⏸ Pause"}</button>
          <button onClick={() => setLogs([])} style={{
            padding:"5px 12px", borderRadius:5, fontSize:10, fontFamily:"var(--mono)",
            background:"var(--bg3)", border:"1px solid var(--border2)", color:"var(--muted)", cursor:"pointer",
          }}>Clear</button>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        {SOURCES.map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding:"4px 10px", borderRadius:5, fontSize:10, fontFamily:"var(--mono)",
            background: filter === s ? "rgba(0,229,160,0.1)" : "var(--bg3)",
            border: filter === s ? "1px solid rgba(0,229,160,0.25)" : "1px solid var(--border)",
            color: filter === s ? "var(--accent)" : "var(--muted)", cursor:"pointer",
          }}>{s}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search logs..."
          style={{
            marginLeft:"auto", padding:"5px 10px", borderRadius:5,
            fontSize:11, fontFamily:"var(--mono)", background:"var(--bg3)",
            border:"1px solid var(--border2)", color:"var(--text)", outline:"none", width:180,
          }}
          onFocus={e => e.target.style.borderColor="rgba(0,229,160,0.4)"}
          onBlur={e  => e.target.style.borderColor="var(--border2)"}
        />
      </div>

      <Panel>
        <PanelHeader title={`Log Stream — ${filtered.length} entries`} icon iconColor="blue">
          <span style={{ fontSize:9, fontFamily:"var(--mono)", color:"var(--muted)" }}>
            {paused ? "⏸ PAUSED" : "● STREAMING"}
          </span>
        </PanelHeader>
        <PanelBody style={{ padding:0 }}>
          <div ref={logRef} style={{
            height:440, overflowY:"auto", fontFamily:"var(--mono)",
            fontSize:11, background:"var(--bg2)", scrollbarWidth:"thin",
          }}>
            {filtered.length === 0 && (
              <div style={{ padding:20, color:"var(--muted)", textAlign:"center" }}>
                No log entries match current filter.
              </div>
            )}
            {filtered.map((l, i) => (
              <div key={i} style={{
                display:"grid", gridTemplateColumns:"60px 80px 80px 1fr",
                gap:8, padding:"4px 14px", borderBottom:"1px solid rgba(255,255,255,0.03)",
                alignItems:"center",
              }}
                onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.02)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
              >
                <span style={{ color:"var(--muted)", fontSize:10 }}>{l.time}</span>
                <span style={{
                  fontSize:9, padding:"2px 6px", borderRadius:3, textAlign:"center",
                  background:`${LEVEL_COLOR[l.level]||"#6b7280"}18`,
                  color: LEVEL_COLOR[l.level]||"#6b7280",
                  border:`1px solid ${LEVEL_COLOR[l.level]||"#6b7280"}30`,
                }}>{l.level}</span>
                <span style={{
                  fontSize:9, color:"var(--muted)", padding:"2px 5px",
                  background:"rgba(255,255,255,0.04)", borderRadius:3, textAlign:"center",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                }}>{l.source}</span>
                <span style={{ color:"var(--text)", fontSize:11 }}>{l.msg}</span>
              </div>
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
