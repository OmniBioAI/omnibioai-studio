import React, { useState, useEffect } from "react";
import { Panel, PanelHeader, PanelBody, FormRow, Input, Select, ToggleRow, Btn } from "../components/UI";

export default function Settings({ config, setConfig }) {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    host_ip:         "localhost",
    update_channel:  "stable",
    log_level:       "info",
    log_retention:   "7",
    workbench_port:  "8000",
    tes_port:        "8081",
    toolserver_port: "9090",
    compose_file:    "docker/docker-compose.yml",
    data_dir:        "",   // PubMed FAISS indexes, abstracts
    work_dir:        "",   // workflow results, runs, outputs
    auto_update:     true,
    telemetry:       false,
    dev_mode:        false,
  });

  // Load saved config on mount
  useEffect(() => {
    const load = async () => {
      if (window.api?.loadConfig) {
        const saved = await window.api.loadConfig();
        if (saved?.settings) {
          setSettings(prev => ({ ...prev, ...saved.settings }));
        }
      }
    };
    load();
  }, []);

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }));

  const saveSettings = async () => {
    const fullConfig = { ...config, settings };
    if (window.api?.saveConfig) await window.api.saveConfig(fullConfig);
    if (setConfig) setConfig(fullConfig);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetAll = async () => {
    if (window.api?.resetConfig) await window.api.resetConfig();
    window.location.reload();
  };

  const isFirstRun = !settings.data_dir || !settings.work_dir;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Settings
          </div>
          <div style={{ fontSize:'var(--font-size-sm)', color:"var(--color-text-muted)", fontFamily:"var(--mono)" }}>
            application preferences and system configuration
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="danger" onClick={resetAll}>Reset All</Btn>
          <Btn variant="primary" onClick={saveSettings}
            style={saved ? {
              background:"rgba(0,229,160,0.15)",
              color:"var(--accent)",
              border:"1px solid rgba(0,229,160,0.3)"
            } : {}}>
            {saved ? "✓ Saved" : "Save Settings"}
          </Btn>
        </div>
      </div>

      {/* First run banner */}
      {isFirstRun && (
        <div style={{
          padding:"14px 16px", borderRadius:'var(--radius)',
          background:"rgba(0,229,160,0.06)",
          border:"1px solid rgba(0,229,160,0.2)",
          fontSize:'var(--font-size-sm)', fontFamily:"var(--mono)",
          color:"var(--accent)", lineHeight:1.7,
        }}>
          👋 <strong>First time setup</strong> — configure your Data and Work directories below,
          then go to <strong>Launch</strong> to boot the system.
          <br />
          These paths are mounted into Docker containers so all services can access your data.
        </div>
      )}

      {/* ── Critical paths ── */}
      <Panel>
        <PanelHeader title="Data Directories" icon iconColor="teal" />
        <PanelBody>
          <div style={{
            padding:"10px 12px", borderRadius:'var(--radius-sm)', marginBottom:14,
            background:"rgba(0,148,255,0.06)",
            border:"1px solid rgba(0,148,255,0.15)",
            fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
            color:"var(--accent2)", lineHeight:1.7,
          }}>
            ℹ These paths are mounted into all Docker containers at startup.
            Set them to your local OmniBioAI data directories.
          </div>

          <FormRow label="Data Directory — PubMed abstracts, FAISS indexes, RAG data">
            <Input
              value={settings.data_dir}
              onChange={e => set("data_dir", e.target.value)}
              placeholder="/home/username/omnibioai/data"
            />
          </FormRow>

          <div style={{
            fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
            marginTop:-8, marginBottom:14, paddingLeft:2,
          }}>
            Expected layout: data/PubMed/Index/&lt;study&gt;/pubmed_index.faiss
          </div>

          <FormRow label="Work Directory — workflow results, runs, outputs">
            <Input
              value={settings.work_dir}
              onChange={e => set("work_dir", e.target.value)}
              placeholder="/home/username/omnibioai/work"
            />
          </FormRow>

          <div style={{
            fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
            marginTop:-8, marginBottom:4, paddingLeft:2,
          }}>
            Expected layout: work/workflow_runner_runs/, work/uploads/, work/objects/
          </div>

          {/* Quick fill for current user */}
          <div style={{ display:"flex", gap:8, marginTop:12 }}>
            <button
              onClick={() => {
                set("data_dir", `${navigator.platform.includes("Win") ? "C:\\Users" : "/home"}/omnibioai/data`);
                set("work_dir", `${navigator.platform.includes("Win") ? "C:\\Users" : "/home"}/omnibioai/work`);
              }}
              style={{
                padding:"5px 12px", borderRadius:5, fontSize:'var(--font-size-xs)',
                fontFamily:"var(--mono)", background:"var(--bg2)",
                border:"1px solid var(--border2)", color:"var(--color-text-muted)",
                cursor:"pointer",
              }}
            >Use defaults</button>

            <button
              onClick={() => {
                // Pre-fill with known omnibioai paths
                set("data_dir", "/home/manish/Desktop/machine/omnibioai/data");
                set("work_dir", "/home/manish/Desktop/machine/omnibioai/work");
              }}
              style={{
                padding:"5px 12px", borderRadius:5, fontSize:'var(--font-size-xs)',
                fontFamily:"var(--mono)", background:"var(--bg2)",
                border:"1px solid var(--border2)", color:"var(--color-text-muted)",
                cursor:"pointer",
              }}
            >Use OmniBioAI defaults</button>
          </div>
        </PanelBody>
      </Panel>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>

        {/* General */}
        <Panel>
          <PanelHeader title="General" icon iconColor="teal" />
          <PanelBody>
            <FormRow label="Update Channel">
              <Select value={settings.update_channel}
                onChange={e => set("update_channel", e.target.value)}
                options={[
                  { value:"stable",  label:"Stable"  },
                  { value:"beta",    label:"Beta"    },
                  { value:"nightly", label:"Nightly" },
                ]}
              />
            </FormRow>
            <FormRow label="Log Level">
              <Select value={settings.log_level}
                onChange={e => set("log_level", e.target.value)}
                options={["debug","info","warn","error"]}
              />
            </FormRow>
            <FormRow label="Log Retention (days)">
              <Input placeholder="7" value={settings.log_retention}
                onChange={e => set("log_retention", e.target.value)} />
            </FormRow>
            <ToggleRow label="Auto Update" sub="check for updates on launch"
              value={settings.auto_update} onChange={v => set("auto_update", v)} />
            <ToggleRow label="Telemetry" sub="anonymous usage analytics"
              value={settings.telemetry} onChange={v => set("telemetry", v)} />
            <ToggleRow label="Developer Mode" sub="verbose output + devtools"
              value={settings.dev_mode} onChange={v => set("dev_mode", v)} />
          </PanelBody>
        </Panel>

        {/* Service Ports */}
        <Panel>
          <PanelHeader title="Service Ports" icon iconColor="blue" />
          <PanelBody>
            <FormRow label="Server IP or Hostname">
              <Input value={settings.host_ip}
                onChange={e => set("host_ip", e.target.value)}
                placeholder="192.168.86.234 or localhost" />
            </FormRow>
            <div style={{
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)", color:"var(--color-text-muted)",
              marginTop:-8, marginBottom:14, paddingLeft:2,
            }}>
              IP of the machine running Docker. Use localhost for this machine,
              or an IP like 192.168.86.234 for a remote server.
            </div>
            <FormRow label="Workbench Port">
              <Input value={settings.workbench_port}
                onChange={e => set("workbench_port", e.target.value)}
                placeholder="8000" />
            </FormRow>
            <FormRow label="TES Port">
              <Input value={settings.tes_port}
                onChange={e => set("tes_port", e.target.value)}
                placeholder="8081" />
            </FormRow>
            <FormRow label="ToolServer Port">
              <Input value={settings.toolserver_port}
                onChange={e => set("toolserver_port", e.target.value)}
                placeholder="9090" />
            </FormRow>
            <div style={{
              marginTop:12, padding:"10px 12px", borderRadius:'var(--radius-sm)',
              background:"rgba(255,165,2,0.06)",
              border:"1px solid rgba(255,165,2,0.15)",
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
              color:"var(--warn)", lineHeight:1.6,
            }}>
              ⚠ Changing ports requires a full stack restart.
            </div>
          </PanelBody>
        </Panel>

        {/* Docker Compose */}
        <Panel>
          <PanelHeader title="Docker" icon iconColor="orange" />
          <PanelBody>
            <FormRow label="Docker Compose File">
              <Input value={settings.compose_file}
                onChange={e => set("compose_file", e.target.value)}
                placeholder="docker/docker-compose.yml" />
            </FormRow>
            <div style={{
              marginTop:8, padding:"10px 12px", borderRadius:'var(--radius-sm)',
              background:"rgba(255,255,255,0.03)",
              border:"1px solid var(--border)",
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
              color:"var(--color-text-muted)", lineHeight:1.7,
            }}>
              Data Dir → mounted at <span style={{color:"var(--accent)"}}>
                /data</span> in all containers<br/>
              Work Dir → mounted at <span style={{color:"var(--accent)"}}>
                /workspace/work</span> in all containers
            </div>
          </PanelBody>
        </Panel>

        {/* About */}
        <Panel>
          <PanelHeader title="About" icon iconColor="teal" />
          <PanelBody>
            <table style={{
              width:"100%", borderCollapse:"collapse",
              fontSize:'var(--font-size-xs)', fontFamily:"var(--mono)",
            }}>
              {[
                ["Studio Version", "v0.1.0-beta.2"],
                ["Electron",       typeof process !== "undefined" ? process.versions?.electron || "28.x" : "web"],
                ["Node.js",        typeof process !== "undefined" ? process.versions?.node     || "18.x" : "web"],
                ["Platform",       navigator.platform],
                ["Status",         "Beta"],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"7px 0", color:"var(--color-text-muted)" }}>{k}</td>
                  <td style={{ textAlign:"right", color:"var(--text)" }}>{v}</td>
                </tr>
              ))}
            </table>
            <div style={{ marginTop:14, display:"flex", gap:8 }}>
              <button style={{
                flex:1, padding:"7px", borderRadius:5, fontSize:'var(--font-size-xs)',
                fontFamily:"var(--mono)", background:"var(--bg2)",
                border:"1px solid var(--border2)", color:"var(--color-text-muted)",
                cursor:"pointer",
              }}>Docs ↗</button>
              <button style={{
                flex:1, padding:"7px", borderRadius:5, fontSize:'var(--font-size-xs)',
                fontFamily:"var(--mono)", background:"var(--bg2)",
                border:"1px solid var(--border2)", color:"var(--color-text-muted)",
                cursor:"pointer",
              }}>GitHub ↗</button>
            </div>
          </PanelBody>
        </Panel>

      </div>
    </div>
  );
}
