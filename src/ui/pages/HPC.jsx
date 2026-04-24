import React from "react";

export default function HPC({ config, setConfig }) {

  const updateHPC = (field, value) => {
    setConfig({
      ...config,
      hpc: {
        ...config.hpc,
        [field]: value
      }
    });
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>HPC Configuration</h2>

      <label>
        Enable HPC Integration
        <input
          type="checkbox"
          checked={config.hpc.enabled || false}
          onChange={(e) =>
            updateHPC("enabled", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Scheduler Type
        <br />
        <select
          value={config.hpc.scheduler || "slurm"}
          onChange={(e) =>
            updateHPC("scheduler", e.target.value)
          }
        >
          <option value="slurm">Slurm</option>
          <option value="pbs">PBS</option>
          <option value="lsf">LSF</option>
        </select>
      </label>

      <br /><br />

      <label>
        HPC Hostname
        <br />
        <input
          type="text"
          placeholder="hpc.example.edu"
          value={config.hpc.hostname || ""}
          onChange={(e) =>
            updateHPC("hostname", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        SSH Port
        <br />
        <input
          type="number"
          value={config.hpc.port || 22}
          onChange={(e) =>
            updateHPC("port", e.target.value)
          }
          style={{ width: "150px" }}
        />
      </label>

      <br /><br />

      <label>
        SSH Username
        <br />
        <input
          type="text"
          value={config.hpc.username || ""}
          onChange={(e) =>
            updateHPC("username", e.target.value)
          }
          style={{ width: "300px" }}
        />
      </label>

      <br /><br />

      <label>
        SSH Private Key Path
        <br />
        <input
          type="text"
          placeholder="~/.ssh/id_rsa"
          value={config.hpc.private_key || ""}
          onChange={(e) =>
            updateHPC("private_key", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <label>
        Shared Filesystem Mount
        <br />
        <input
          type="text"
          placeholder="/shared/projects"
          value={config.hpc.shared_mount || ""}
          onChange={(e) =>
            updateHPC("shared_mount", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <label>
        Apptainer/Singularity Path
        <br />
        <input
          type="text"
          placeholder="/usr/bin/apptainer"
          value={config.hpc.apptainer_path || ""}
          onChange={(e) =>
            updateHPC("apptainer_path", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        Default Queue/Partition
        <br />
        <input
          type="text"
          placeholder="gpu"
          value={config.hpc.partition || ""}
          onChange={(e) =>
            updateHPC("partition", e.target.value)
          }
          style={{ width: "300px" }}
        />
      </label>

      <br /><br />

      <label>
        Enable GPU Jobs
        <input
          type="checkbox"
          checked={config.hpc.enable_gpu || false}
          onChange={(e) =>
            updateHPC("enable_gpu", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Enable Remote Workflow Execution
        <input
          type="checkbox"
          checked={config.hpc.remote_execution || false}
          onChange={(e) =>
            updateHPC("remote_execution", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>
    </div>
  );
}