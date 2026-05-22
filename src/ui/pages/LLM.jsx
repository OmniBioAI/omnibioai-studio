import React from "react";
import {
  Panel, PanelHeader, PanelBody,
  FormRow, Input, Select, ToggleRow,
} from "../components/UI";

export default function LLM({ config, setConfig }) {
  const llm = config.llm || {};

  const set = (field, value) =>
    setConfig((p) => ({ ...p, llm: { ...p.llm, [field]: value } }));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
          LLM Configuration
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
          configure local, cloud, and enterprise AI providers
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* Ollama */}
        <Panel>
          <PanelHeader title="Local Models" icon iconColor="teal">
            <button
              className={`toggle ${llm.enable_ollama ? "on" : "off"}`}
              onClick={() => set("enable_ollama", !llm.enable_ollama)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="Ollama Host">
              <Input
                placeholder="http://localhost:11434"
                value={llm.ollama_host || ""}
                onChange={(e) => set("ollama_host", e.target.value)}
              />
            </FormRow>
            <FormRow label="Default Model">
              <Input
                placeholder="deepseek-coder:latest"
                value={llm.local_model || ""}
                onChange={(e) => set("local_model", e.target.value)}
              />
            </FormRow>
            <FormRow label="Embedding Model">
              <Input
                placeholder="nomic-embed-text"
                value={llm.embedding_model || ""}
                onChange={(e) => set("embedding_model", e.target.value)}
              />
            </FormRow>
            <ToggleRow
              label="GPU Acceleration"
              sub="CUDA / Metal"
              value={llm.enable_gpu || false}
              onChange={(v) => set("enable_gpu", v)}
            />
          </PanelBody>
        </Panel>

        {/* Claude */}
        <Panel>
          <PanelHeader title="Claude API" icon iconColor="blue">
            <button
              className={`toggle ${llm.enable_claude ? "on" : "off"}`}
              onClick={() => set("enable_claude", !llm.enable_claude)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="API Key">
              <Input
                type="password"
                placeholder="sk-ant-••••••••••••"
                value={llm.claude_api_key || ""}
                onChange={(e) => set("claude_api_key", e.target.value)}
              />
            </FormRow>
            <FormRow label="Model">
              <Input
                placeholder="claude-sonnet-4-20250514"
                value={llm.claude_model || ""}
                onChange={(e) => set("claude_model", e.target.value)}
              />
            </FormRow>
            <FormRow label="Max Tokens">
              <Input
                placeholder="8096"
                value={llm.claude_max_tokens || ""}
                onChange={(e) => set("claude_max_tokens", e.target.value)}
              />
            </FormRow>
            <ToggleRow
              label="RAG Integration"
              sub="Vector retrieval"
              value={llm.enable_rag || false}
              onChange={(v) => set("enable_rag", v)}
            />
          </PanelBody>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* OpenAI */}
        <Panel>
          <PanelHeader title="OpenAI / Codex" icon iconColor="orange">
            <button
              className={`toggle ${llm.enable_openai ? "on" : "off"}`}
              onClick={() => set("enable_openai", !llm.enable_openai)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="API Key">
              <Input
                type="password"
                placeholder="sk-••••••••••••"
                value={llm.openai_api_key || ""}
                onChange={(e) => set("openai_api_key", e.target.value)}
              />
            </FormRow>
            <FormRow label="Model">
              <Input
                placeholder="gpt-4o"
                value={llm.openai_model || ""}
                onChange={(e) => set("openai_model", e.target.value)}
              />
            </FormRow>
          </PanelBody>
        </Panel>

        {/* Runtime */}
        <Panel>
          <PanelHeader title="Runtime" icon iconColor="blue" />
          <PanelBody>
            <ToggleRow
              label="Offline-first mode"
              sub="prefer local models"
              value={llm.offline_mode || false}
              onChange={(v) => set("offline_mode", v)}
            />
            <ToggleRow
              label="Enable RAG"
              sub="retrieval-augmented generation"
              value={llm.enable_rag || false}
              onChange={(v) => set("enable_rag", v)}
            />
            <FormRow label="Default Orchestrator Model">
              <Select
                value={llm.default_model || "claude-sonnet-4-20250514"}
                onChange={(e) => set("default_model", e.target.value)}
                options={[
                  "claude-sonnet-4-20250514",
                  "gpt-4o",
                  "deepseek-coder:latest",
                ]}
              />
            </FormRow>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
