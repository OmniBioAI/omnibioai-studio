import React, { useState } from "react";
import { Panel, PanelHeader, PanelBody, FormRow, Input, Select, ToggleRow, Btn } from "../components/UI";

export default function Settings() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    update_channel: "stable",
    log_level:      "info",
    log_retention:  "7",
    workbench_port: "8000",
    tes_port:       "8081",
    toolserver_port:"9090",
    compose_file:   "docker/docker-compose.yml",
    data_dir:       "~/.omnibioai/data",
    auto_update:    true,
    telemetry:      false,
    dev_mode:       false,
  });

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }));

  const saveSettings = async () => {
    if (window.api?.saveConfig) await window.api.saveConfig({ settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const resetAll = async () => {
    if (window.api?.resetConfig) await window.api.resetConfig();
    window.location.reload();
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"-0.01em", marginBottom:3 }}>
            Settings
          </div>
          <div style={{ fontSize:12, color:"var(--muted)", fontFamily:"var(--mono)" }}>
            application preferences and system configuration
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn variant="danger" onClick={resetAll}>Reset All</Btn>
          <Btn variant="primary" onClick={saveSettings}
            style={saved ? { background:"rgba(0,229,160,0.15)", color:"var(--accent)", border:"1px solid rgba(0,229,160,0.3)" } : {}}>
            {saved ? "✓ Saved" : "Save Settings"}
          </Btn>
        </div>
      </div>

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
            <ToggleRow label="Developer Mode" sub="show debug tools and verbose output"
              value={settings.dev_mode} onChange={v => set("dev_mode", v)} />
          </PanelBody>
        </Panel>

        {/* Ports */}
        <Panel>
          <PanelHeader title="Service Ports" icon iconColor="blue" />
          <PanelBody>
            <FormRow label="Workbench Port">
              <Input value={settings.workbench_port}
                onChange={e => set("workbench_port", e.target.value)} placeholder="8000" />
            </FormRow>
            <FormRow label="TES Port">
              <Input value={settings.tes_port}
                onChange={e => set("tes_port", e.target.value)} placeholder="8081" />
            </FormRow>
            <FormRow label="ToolServer Port">
              <Input value={settings.toolserver_port}
                onChange={e => set("toolserver_port", e.target.value)} placeholder="9090" />
            </FormRow>
            <div style={{
              marginTop:12, padding:"10px 12px", borderRadius:6,
              background:"rgba(255,165,2,0.06)", border:"1px solid rgba(255,165,2,0.15)",
              fontSize:10, fontFamily:"var(--mono)", color:"var(--warn)", lineHeight:1.6,
            }}>
              ⚠ Changing ports requires a full stack restart.
            </div>
          </PanelBody>
        </Panel>

        {/* Paths */}
        <Panel>
          <PanelHeader title="Paths" icon iconColor="orange" />
          <PanelBody>
            <FormRow label="Docker Compose File">
              <Input value={settings.compose_file}
                onChange={e => set("compose_file", e.target.value)}
                placeholder="docker/docker-compose.yml" />
            </FormRow>
            <FormRow label="Data Directory">
              <Input value={settings.data_dir}
                onChange={e => set("data_dir", e.target.value)}
                placeholder="~/.omnibioai/data" />
            </FormRow>
          </PanelBody>
        </Panel>

        {/* About */}
        <Panel>
          <PanelHeader title="About" icon iconColor="teal" />
          <PanelBody>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, fontFamily:"var(--mono)" }}>
              {[
                ["Studio Version", "v0.1.0"],
                ["Electron",       typeof process !== "undefined" ? process.versions?.electron || "28.x" : "web"],
                ["Node.js",        typeof process !== "undefined" ? process.versions?.node     || "18.x" : "web"],
                ["Platform",       navigator.platform],
                ["Status",         "Beta"],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"7px 0", color:"var(--muted)" }}>{k}</td>
                  <td style={{ textAlign:"right", color:"var(--text)" }}>{v}</td>
                </tr>
              ))}
            </table>
            <div style={{ marginTop:14, display:"flex", gap:8 }}>
              <button style={{
                flex:1, padding:"7px", borderRadius:5, fontSize:10, fontFamily:"var(--mono)",
                background:"var(--bg2)", border:"1px solid var(--border2)",
                color:"var(--muted)", cursor:"pointer",
              }}>Docs ↗</button>
              <button style={{
                flex:1, padding:"7px", borderRadius:5, fontSize:10, fontFamily:"var(--mono)",
                background:"var(--bg2)", border:"1px solid var(--border2)",
                color:"var(--muted)", cursor:"pointer",
              }}>GitHub ↗</button>
            </div>
          </PanelBody>
        </Panel>

      </div>
    </div>
  );
}
