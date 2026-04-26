import React, { useState, useEffect } from "react";
import { Panel, PanelHeader, PanelBody } from "../components/UI";

const SERVICES = [
  { key:"mysql",        label:"MySQL",         port:3306,  image:"mysql:8.0",                          group:"Data Layer"    },
  { key:"redis",        label:"Redis",         port:6379,  image:"redis:7-alpine",                     group:"Data Layer"    },
  { key:"workbench",    label:"Workbench",     port:8000,  image:"omnibioai/omnibioai-workbench:beta",  group:"Control Plane" },
  { key:"tes",          label:"TES",           port:8081,  image:"omnibioai/omnibioai-tes:beta",        group:"Control Plane" },
  { key:"toolserver",   label:"ToolServer",    port:9090,  image:"omnibioai/omnibioai-toolserver:beta", group:"Control Plane" },
  { key:"model-registry",label:"Model Registry",port:8095,image:"omnibioai/omnibioai-model-registry:beta",group:"Control Plane"},
  { key:"lims",         label:"LIMS",          port:7000,  image:"omnibioai/omnibioai-lims:beta",       group:"Control Plane" },
  { key:"ollama",       label:"Ollama",        port:11434, image:"ollama/ollama",                      group:"AI Layer"      },
  { key:"opa",          label:"OPA",           port:8181,  image:"openpolicyagent/opa:latest",          group:"Policy Engine" },
];

const GROUPS = ["Data Layer", "Control Plane", "AI Layer", "Policy Engine"];

const statusColor = { up:"#00e5a0", warn:"#ffa502", down:"#ff4757", unknown:"#6b7280", restarting:"#0094ff" };
const statusLabel = { up:"● Running", warn:"◐ Starting", down:"✕ Stopped", unknown:"— Unknown", restarting:"↻ Restarting" };

function StatusDot({ status }) {
  return (
    <span style={{
      display:"inline-block", width:6, height:6, borderRadius:"50%",
      background: statusColor[status] || statusColor.unknown,
      marginRight:6, flexShrink:0,
      animation: status === "restarting" ? "pulse 1s infinite" : "none",
    }} />
  );
}

export default function Services() {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(SERVICES.map(s => [s.key, "unknown"]))
  );
  const [restarting, setRestarting] = useState({});
  const [lastCheck, setLastCheck] = useState("never");

  const poll = async () => {
    try {
      if (window.api?.checkHealth) {
        const r = await window.api.checkHealth();
        setStatuses(prev => ({
          ...prev,
          mysql:          r.mysql         ? "up" : "down",
          workbench:      r.workbench     ? "up" : "down",
          tes:            r.tes           ? "up" : "down",
          toolserver:     r.toolserver    ? "up" : "down",
          redis:          r.redis         ? "up" : "down",
          ollama:         r.ollama        ? "up" : "warn",
          rag:            r.rag           ? "up" : "down",
        }));
        setLastCheck(new Date().toTimeString().slice(0, 8));
      }
    } catch (_) {}
  };

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const restartService = async (key) => {
    setRestarting(r => ({ ...r, [key]: true }));
    setStatuses(s => ({ ...s, [key]: "restarting" }));
    try {
      if (window.api?.restartService) {
        await window.api.restartService(key);
      } else {
        await new Promise(r => setTimeout(r, 2000));
      }
      setStatuses(s => ({ ...s, [key]: "up" }));
    } catch (_) {
      setStatuses(s => ({ ...s, [key]: "down" }));
    } finally {
      setRestarting(r => ({ ...r, [key]: false }));
    }
  };

  const grouped = GROUPS.map(g => ({
    group: g,
    services: SERVICES.filter(s => s.group === g),
  }));

  const totalUp   = SERVICES.filter(s => statuses[s.key] === "up").length;
  const totalDown = SERVICES.filter(s => statuses[s.key] === "down").length;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Services
          </div>
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>
            monitor and control individual docker services
          </div>
        </div>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <span style={{ fontSize:10, fontFamily:"var(--mono)", color:"var(--muted)" }}>
            last check: {lastCheck}
          </span>
          <div style={{ display:"flex", gap:8 }}>
            <span style={{ fontSize:11, fontFamily:"var(--mono)", color:"#00e5a0" }}>
              ● {totalUp} up
            </span>
            <span style={{ fontSize:11, fontFamily:"var(--mono)", color:"#ff4757" }}>
              ✕ {totalDown} down
            </span>
          </div>
          <button onClick={poll} style={{
            padding:"5px 12px", borderRadius:5, fontSize:10,
            fontFamily:"var(--mono)", background:"var(--bg3)",
            border:"1px solid var(--border2)", color:"var(--muted)", cursor:"pointer",
          }}>↻ Refresh</button>
        </div>
      </div>

      {/* Service Groups */}
      {grouped.map(({ group, services }) => (
        <Panel key={group}>
          <PanelHeader
            title={group}
            icon
            iconColor={
              group === "Data Layer"    ? "teal"   :
              group === "Control Plane" ? "blue"   :
              group === "AI Layer"      ? "orange" : "teal"
            }
          />
          <PanelBody style={{ padding:0 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"1px solid var(--border)" }}>
                  {["Service","Status","Port","Image",""].map(h => (
                    <th key={h} style={{
                      padding:"7px 14px", textAlign: h === "" ? "right" : "left",
                      fontSize:9, fontFamily:"var(--mono)", color:"var(--muted)",
                      letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:500,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => {
                  const st = statuses[s.key] || "unknown";
                  const isRestarting = restarting[s.key];
                  return (
                    <tr key={s.key} style={{
                      borderBottom: i < services.length - 1 ? "1px solid var(--border)" : "none",
                      transition:"background 0.15s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding:"10px 14px", fontSize:12, color:"var(--text)", fontWeight:500 }}>
                        {s.label}
                      </td>
                      <td style={{ padding:"10px 14px" }}>
                        <span style={{
                          display:"inline-flex", alignItems:"center",
                          fontSize:11, fontFamily:"var(--mono)",
                          color: statusColor[st],
                        }}>
                          <StatusDot status={st} />
                          {statusLabel[st]}
                        </span>
                      </td>
                      <td style={{ padding:"10px 14px", fontSize:11, fontFamily:"var(--mono)", color:"var(--muted)" }}>
                        :{s.port}
                      </td>
                      <td style={{ padding:"10px 14px", fontSize:10, fontFamily:"var(--mono)", color:"var(--muted)" }}>
                        {s.image}
                      </td>
                      <td style={{ padding:"10px 14px", textAlign:"right" }}>
                        <button
                          onClick={() => restartService(s.key)}
                          disabled={isRestarting}
                          style={{
                            padding:"4px 10px", borderRadius:4, fontSize:10,
                            fontFamily:"var(--mono)", cursor: isRestarting ? "not-allowed" : "pointer",
                            background: isRestarting ? "rgba(0,148,255,0.08)" : "rgba(255,255,255,0.04)",
                            border: isRestarting ? "1px solid rgba(0,148,255,0.2)" : "1px solid var(--border2)",
                            color: isRestarting ? "var(--accent2)" : "var(--muted)",
                            transition:"all 0.15s",
                            opacity: isRestarting ? 0.7 : 1,
                          }}
                        >
                          {isRestarting ? "↻ Restarting..." : "↻ Restart"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}