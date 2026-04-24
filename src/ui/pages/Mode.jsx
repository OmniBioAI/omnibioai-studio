import React from "react";

export default function Mode({ config, setConfig }) {

  const selectMode = (mode) => {
    setConfig({
      ...config,
      mode
    });
  };

  const cardStyle = (active) => ({
    border: active
      ? "3px solid #2563eb"
      : "1px solid #d1d5db",

    borderRadius: "12px",
    padding: "20px",
    marginBottom: "20px",
    cursor: "pointer",
    background: active ? "#eff6ff" : "white"
  });

  return (
    <div style={{ padding: "20px" }}>

      <h2>Runtime Mode</h2>

      <p>
        Select how OmniBioAI Studio will execute
        workflows and AI workloads.
      </p>

      {/* ───────────────────────────── */}
      {/* LOCAL */}
      {/* ───────────────────────────── */}

      <div
        style={cardStyle(config.mode === "local")}
        onClick={() => selectMode("local")}
      >
        <h3>Local Mode</h3>

        <p>
          Execute workflows directly on this machine
          using Docker containers and local AI models.
        </p>

        <ul>
          <li>Offline-first</li>
          <li>Uses local CPU/GPU</li>
          <li>Ideal for development and small labs</li>
          <li>Supports Ollama local models</li>
        </ul>
      </div>

      {/* ───────────────────────────── */}
      {/* HPC */}
      {/* ───────────────────────────── */}

      <div
        style={cardStyle(config.mode === "hpc")}
        onClick={() => selectMode("hpc")}
      >
        <h3>HPC Mode</h3>

        <p>
          Submit workflows to institutional HPC clusters
          using Slurm, PBS, or LSF schedulers.
        </p>

        <ul>
          <li>Remote workflow execution</li>
          <li>Apptainer/Singularity support</li>
          <li>GPU cluster integration</li>
          <li>Large-scale genomics workflows</li>
        </ul>
      </div>

      {/* ───────────────────────────── */}
      {/* CLOUD */}
      {/* ───────────────────────────── */}

      <div
        style={cardStyle(config.mode === "cloud")}
        onClick={() => selectMode("cloud")}
      >
        <h3>Cloud Mode</h3>

        <p>
          Execute workflows on cloud infrastructure
          using your own AWS or Azure account.
        </p>

        <ul>
          <li>AWS Batch support</li>
          <li>Azure Batch integration</li>
          <li>Elastic compute scaling</li>
          <li>Cloud object storage support</li>
        </ul>
      </div>

      {/* ───────────────────────────── */}
      {/* HYBRID */}
      {/* ───────────────────────────── */}

      <div
        style={cardStyle(config.mode === "hybrid")}
        onClick={() => selectMode("hybrid")}
      >
        <h3>Hybrid Mode</h3>

        <p>
          Combine local, HPC, Kubernetes, and cloud
          execution into a single orchestration layer.
        </p>

        <ul>
          <li>Multi-backend execution</li>
          <li>Policy-driven scheduling</li>
          <li>Enterprise-scale orchestration</li>
          <li>Recommended for production deployments</li>
        </ul>
      </div>

      {/* ───────────────────────────── */}
      {/* CURRENT SELECTION */}
      {/* ───────────────────────────── */}

      <div
        style={{
          marginTop: "30px",
          padding: "15px",
          background: "#f3f4f6",
          borderRadius: "10px"
        }}
      >
        <strong>Selected Mode:</strong>{" "}
        {config.mode || "none"}
      </div>

    </div>
  );
}