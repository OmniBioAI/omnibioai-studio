import React, { useState } from "react";

export default function Launch({ config }) {

  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);

  const addLog = (message) => {
    setLogs((prev) => [...prev, message]);
  };

  const start = async () => {

    try {

      setStatus("starting");

      addLog("Saving configuration...");
      await window.api.saveConfig(config);

      addLog("Validating Docker runtime...");
      await window.api.checkDocker();

      if (config.mode === "cloud") {
        addLog("Validating cloud configuration...");
        await window.api.validateCloud();
      }

      if (config.mode === "hpc") {
        addLog("Validating HPC connectivity...");
        await window.api.validateHPC();
      }

      addLog("Starting OmniBioAI services...");
      await window.api.startDocker();

      addLog("Waiting for services to become healthy...");
      await window.api.waitForServices();

      addLog("Opening OmniBioAI Studio...");
      await window.api.openWorkbench();

      setStatus("running");

      addLog("OmniBioAI Studio started successfully.");

    } catch (err) {

      console.error(err);

      setStatus("error");

      addLog(`ERROR: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: "20px" }}>

      <h2>Launch OmniBioAI Studio</h2>

      <p>
        Review your runtime configuration before
        starting the platform.
      </p>

      <hr />

      {/* ───────────────────────────── */}
      {/* SUMMARY */}
      {/* ───────────────────────────── */}

      <h3>Runtime Summary</h3>

      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          marginBottom: "30px"
        }}
      >
        <tbody>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              Runtime Mode
            </td>
            <td style={{ padding: "10px" }}>
              {config.mode}
            </td>
          </tr>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              Ollama
            </td>
            <td style={{ padding: "10px" }}>
              {config.llm.enable_ollama ? "Enabled" : "Disabled"}
            </td>
          </tr>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              Claude API
            </td>
            <td style={{ padding: "10px" }}>
              {config.llm.enable_claude ? "Enabled" : "Disabled"}
            </td>
          </tr>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              OpenAI
            </td>
            <td style={{ padding: "10px" }}>
              {config.llm.enable_openai ? "Enabled" : "Disabled"}
            </td>
          </tr>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              AWS Batch
            </td>
            <td style={{ padding: "10px" }}>
              {config.cloud.enable_aws_batch ? "Enabled" : "Disabled"}
            </td>
          </tr>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              Azure Batch
            </td>
            <td style={{ padding: "10px" }}>
              {config.cloud.enable_azure_batch ? "Enabled" : "Disabled"}
            </td>
          </tr>

          <tr>
            <td style={{ padding: "10px", fontWeight: "bold" }}>
              HPC Scheduler
            </td>
            <td style={{ padding: "10px" }}>
              {config.hpc.scheduler || "Not configured"}
            </td>
          </tr>

        </tbody>
      </table>

      {/* ───────────────────────────── */}
      {/* START BUTTON */}
      {/* ───────────────────────────── */}

      <button
        onClick={start}
        disabled={status === "starting"}
        style={{
          padding: "14px 24px",
          borderRadius: "10px",
          border: "none",
          background: "#2563eb",
          color: "white",
          fontSize: "16px",
          cursor: "pointer"
        }}
      >
        {status === "starting"
          ? "Starting..."
          : "Start OmniBioAI"}
      </button>

      {/* ───────────────────────────── */}
      {/* STATUS */}
      {/* ───────────────────────────── */}

      <div style={{ marginTop: "30px" }}>

        <h3>Status</h3>

        <div
          style={{
            padding: "15px",
            borderRadius: "10px",
            background:
              status === "running"
                ? "#dcfce7"
                : status === "error"
                ? "#fee2e2"
                : "#f3f4f6"
          }}
        >
          {status}
        </div>

      </div>

      {/* ───────────────────────────── */}
      {/* LOG OUTPUT */}
      {/* ───────────────────────────── */}

      <div style={{ marginTop: "30px" }}>

        <h3>Startup Logs</h3>

        <div
          style={{
            background: "#111827",
            color: "#f9fafb",
            padding: "15px",
            borderRadius: "10px",
            height: "300px",
            overflowY: "auto",
            fontFamily: "monospace"
          }}
        >
          {logs.length === 0 && (
            <div>No logs yet.</div>
          )}

          {logs.map((log, idx) => (
            <div key={idx}>
              {log}
            </div>
          ))}
        </div>

      </div>

    </div>
  );
}