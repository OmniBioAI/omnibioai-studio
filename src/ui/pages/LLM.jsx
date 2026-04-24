import React from "react";

export default function LLM({ config, setConfig }) {

  const updateLLM = (field, value) => {
    setConfig({
      ...config,
      llm: {
        ...config.llm,
        [field]: value
      }
    });
  };

  return (
    <div style={{ padding: "20px" }}>

      <h2>LLM Configuration</h2>

      <p>
        Configure local and cloud AI providers for
        OmniBioAI Studio.
      </p>

      <hr />

      {/* ───────────────────────────── */}
      {/* LOCAL MODELS */}
      {/* ───────────────────────────── */}

      <h3>Local Models</h3>

      <label>
        Enable Ollama
        <input
          type="checkbox"
          checked={config.llm.enable_ollama || false}
          onChange={(e) =>
            updateLLM("enable_ollama", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Ollama Host
        <br />
        <input
          type="text"
          placeholder="http://localhost:11434"
          value={config.llm.ollama_host || ""}
          onChange={(e) =>
            updateLLM("ollama_host", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        Default Local Model
        <br />
        <input
          type="text"
          placeholder="deepseek-coder:latest"
          value={config.llm.local_model || ""}
          onChange={(e) =>
            updateLLM("local_model", e.target.value)
          }
          style={{ width: "400px" }}
        />
      </label>

      <br /><br />

      <label>
        Embedding Model
        <br />
        <input
          type="text"
          placeholder="nomic-embed-text"
          value={config.llm.embedding_model || ""}
          onChange={(e) =>
            updateLLM("embedding_model", e.target.value)
          }
          style={{ width: "400px" }}
        />
      </label>

      <br /><br />

      <label>
        Enable GPU Acceleration
        <input
          type="checkbox"
          checked={config.llm.enable_gpu || false}
          onChange={(e) =>
            updateLLM("enable_gpu", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <hr />

      {/* ───────────────────────────── */}
      {/* CLAUDE */}
      {/* ───────────────────────────── */}

      <h3>Claude API</h3>

      <label>
        Enable Claude
        <input
          type="checkbox"
          checked={config.llm.enable_claude || false}
          onChange={(e) =>
            updateLLM("enable_claude", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Claude API Key
        <br />
        <input
          type="password"
          value={config.llm.claude_api_key || ""}
          onChange={(e) =>
            updateLLM("claude_api_key", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <label>
        Claude Model
        <br />
        <input
          type="text"
          placeholder="claude-sonnet-4"
          value={config.llm.claude_model || ""}
          onChange={(e) =>
            updateLLM("claude_model", e.target.value)
          }
          style={{ width: "400px" }}
        />
      </label>

      <br /><br />

      <hr />

      {/* ───────────────────────────── */}
      {/* OPENAI / CODEX */}
      {/* ───────────────────────────── */}

      <h3>OpenAI / Codex</h3>

      <label>
        Enable OpenAI
        <input
          type="checkbox"
          checked={config.llm.enable_openai || false}
          onChange={(e) =>
            updateLLM("enable_openai", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        OpenAI API Key
        <br />
        <input
          type="password"
          value={config.llm.openai_api_key || ""}
          onChange={(e) =>
            updateLLM("openai_api_key", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <label>
        OpenAI Model
        <br />
        <input
          type="text"
          placeholder="gpt-5"
          value={config.llm.openai_model || ""}
          onChange={(e) =>
            updateLLM("openai_model", e.target.value)
          }
          style={{ width: "400px" }}
        />
      </label>

      <br /><br />

      <hr />

      {/* ───────────────────────────── */}
      {/* AZURE OPENAI */}
      {/* ───────────────────────────── */}

      <h3>Azure OpenAI</h3>

      <label>
        Azure Endpoint
        <br />
        <input
          type="text"
          placeholder="https://my-resource.openai.azure.com"
          value={config.llm.azure_openai_endpoint || ""}
          onChange={(e) =>
            updateLLM("azure_openai_endpoint", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <label>
        Azure OpenAI Key
        <br />
        <input
          type="password"
          value={config.llm.azure_openai_key || ""}
          onChange={(e) =>
            updateLLM("azure_openai_key", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <hr />

      {/* ───────────────────────────── */}
      {/* RUNTIME */}
      {/* ───────────────────────────── */}

      <h3>Runtime Behavior</h3>

      <label>
        Offline-First Mode
        <input
          type="checkbox"
          checked={config.llm.offline_mode || false}
          onChange={(e) =>
            updateLLM("offline_mode", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Enable RAG Services
        <input
          type="checkbox"
          checked={config.llm.enable_rag || false}
          onChange={(e) =>
            updateLLM("enable_rag", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Default Orchestrator Model
        <br />
        <input
          type="text"
          placeholder="claude-sonnet-4"
          value={config.llm.default_model || ""}
          onChange={(e) =>
            updateLLM("default_model", e.target.value)
          }
          style={{ width: "400px" }}
        />
      </label>

    </div>
  );
}