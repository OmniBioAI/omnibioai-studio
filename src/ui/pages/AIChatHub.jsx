import React, { useEffect, useState } from "react";
import ServiceViewer from "./ServiceViewer";
import PluginPage from "./PluginPage";
import { isElectron } from "../lib/session";
import "./AIChatHub.css";

const CHAT_DESTINATIONS = {
  ask: {
    label: "Ask OmniBioAI",
    url: "/_svc/devhub?view=chat",
    description: "Evidence-grounded answers from published OmniBioAI documentation, with citations. Ask and Agent keep separate conversations.",
  },
  agent: {
    label: "OmniBioAI Agent",
    description: "Analyze data, run bioinformatics tools, search literature, and plan workflows. Ask history is not shared; Agent model and data policies apply.",
  },
};

function resolveEmbeddedServiceUrl(url) {
  if (!url.startsWith("/_svc/") || !isElectron()) return url;
  const host = import.meta.env.DEV ? "http://localhost:5174" : "http://localhost";
  return `${host}${url}`;
}

export default function AIChatHub({ initialMode = "ask", onBack }) {
  const [activeMode, setActiveMode] = useState(initialMode === "agent" ? "agent" : "ask");
  const [agentVisited, setAgentVisited] = useState(initialMode === "agent");

  useEffect(() => {
    if (initialMode === "agent") setAgentVisited(true);
  }, [initialMode]);

  function selectMode(mode) {
    setActiveMode(mode);
    if (mode === "agent") setAgentVisited(true);
  }

  return <section className="ai-chat-hub" aria-label="OmniBioAI chat workspace">
    <header className="ai-chat-hub__header">
      <button type="button" className="ai-chat-hub__back" onClick={onBack}>← Back to Studio</button>
      <div className="ai-chat-hub__heading">
        <span className="ai-chat-hub__eyebrow">OMNIBIOAI · CONVERSATIONAL WORKSPACE</span>
        <h1>Ask OmniBioAI</h1>
      </div>
      <nav className="ai-chat-hub__tabs" role="tablist" aria-label="Choose an AI experience">
        {Object.entries(CHAT_DESTINATIONS).map(([mode, destination]) => <button
          key={mode}
          id={`ai-chat-tab-${mode}`}
          type="button"
          role="tab"
          aria-selected={activeMode === mode}
          aria-controls={`ai-chat-panel-${mode}`}
          className={activeMode === mode ? "is-active" : ""}
          onClick={() => selectMode(mode)}
        >{mode === "ask" ? "Ask · Documentation" : "Agent · Tools & workflows"}</button>)}
      </nav>
      <p className="ai-chat-hub__description">{CHAT_DESTINATIONS[activeMode].description}</p>
    </header>
    <div className="ai-chat-hub__panels">
      <div id="ai-chat-panel-ask" role="tabpanel" aria-labelledby="ai-chat-tab-ask" hidden={activeMode !== "ask"}>
        <ServiceViewer url={resolveEmbeddedServiceUrl(CHAT_DESTINATIONS.ask.url)} label={CHAT_DESTINATIONS.ask.label} onBack={onBack} hideHeader />
      </div>
      {agentVisited && <div id="ai-chat-panel-agent" className="ai-chat-hub__agent" role="tabpanel" aria-labelledby="ai-chat-tab-agent" hidden={activeMode !== "agent"}>
        <PluginPage slug="bio_agent" label={CHAT_DESTINATIONS.agent.label} backLabel="Back to Ask OmniBioAI" onBack={() => selectMode("ask")} />
      </div>}
    </div>
  </section>;
}
