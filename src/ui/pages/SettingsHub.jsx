import React, { useState } from "react";
import Mode from "./Mode";
import LLM from "./LLM";
import Cloud from "./Cloud";
import HPC from "./HPC";
import Settings from "./Settings";
import "./NavigationRedesign.css";

const TABS = ["General", "Mode", "LLM", "Cloud", "HPC"];

export default function SettingsHub({ config, setConfig, currentUser, initialTab = "General" }) {
  const [tab, setTab] = useState(TABS.includes(initialTab) ? initialTab : "General");
  const content = {
    General: <Settings config={config} setConfig={setConfig} currentUser={currentUser} />,
    Mode: <Mode config={config} setConfig={setConfig} currentUser={currentUser} />,
    LLM: <LLM config={config} setConfig={setConfig} currentUser={currentUser} />,
    Cloud: <Cloud config={config} setConfig={setConfig} currentUser={currentUser} />,
    HPC: <HPC config={config} setConfig={setConfig} currentUser={currentUser} />,
  };
  return <section className="settings-hub"><h1>Settings</h1><div role="tablist" aria-label="Settings sections">
    {TABS.map(value => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value}</button>)}
  </div><div role="tabpanel" aria-label={`${tab} settings`}>{content[tab]}</div></section>;
}
