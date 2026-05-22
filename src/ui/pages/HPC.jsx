import React from "react";
import {
  Panel, PanelHeader, PanelBody,
  FormRow, Input, Select, ToggleRow,
} from "../components/UI";

export default function HPC({ config, setConfig }) {
  const hpc = config.hpc || {};

  const set = (field, value) =>
    setConfig((p) => ({ ...p, hpc: { ...p.hpc, [field]: value } }));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
          HPC Configuration
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
          connect to institutional clusters via SSH + TES
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* Core Settings */}
        <Panel>
          <PanelHeader title="Core Settings" icon iconColor="teal">
            <button
              className={`toggle ${hpc.enabled ? "on" : "off"}`}
              onClick={() => set("enabled", !hpc.enabled)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="Scheduler Type">
              <Select
                value={hpc.scheduler || "slurm"}
                onChange={(e) => set("scheduler", e.target.value)}
                options={[
                  { value: "slurm", label: "Slurm" },
                  { value: "pbs",   label: "PBS"   },
                  { value: "lsf",   label: "LSF"   },
                ]}
              />
            </FormRow>
            <ToggleRow
              label="GPU Jobs"
              sub="CUDA cluster support"
              value={hpc.enable_gpu || false}
              onChange={(v) => set("enable_gpu", v)}
            />
            <ToggleRow
              label="Remote Execution"
              sub="via TES protocol"
              value={hpc.remote_execution || false}
              onChange={(v) => set("remote_execution", v)}
            />
          </PanelBody>
        </Panel>

        {/* SSH Connection */}
        <Panel>
          <PanelHeader title="SSH Connection" icon iconColor="blue" />
          <PanelBody>
            <FormRow label="Hostname">
              <Input
                placeholder="hpc.university.edu"
                value={hpc.hostname || ""}
                onChange={(e) => set("hostname", e.target.value)}
              />
            </FormRow>
            <FormRow label="SSH Port">
              <Input
                placeholder="22"
                value={hpc.port || ""}
                onChange={(e) => set("port", e.target.value)}
              />
            </FormRow>
            <FormRow label="Username">
              <Input
                placeholder="username"
                value={hpc.username || ""}
                onChange={(e) => set("username", e.target.value)}
              />
            </FormRow>
            <FormRow label="Private Key Path">
              <Input
                placeholder="~/.ssh/id_rsa"
                value={hpc.private_key || ""}
                onChange={(e) => set("private_key", e.target.value)}
              />
            </FormRow>
          </PanelBody>
        </Panel>
      </div>

      {/* Filesystem & Runtime */}
      <Panel>
        <PanelHeader title="Filesystem & Runtime" icon iconColor="orange" />
        <PanelBody>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <FormRow label="Shared Mount">
              <Input
                placeholder="/shared/projects"
                value={hpc.shared_mount || ""}
                onChange={(e) => set("shared_mount", e.target.value)}
              />
            </FormRow>
            <FormRow label="Apptainer Path">
              <Input
                placeholder="/usr/bin/apptainer"
                value={hpc.apptainer_path || ""}
                onChange={(e) => set("apptainer_path", e.target.value)}
              />
            </FormRow>
            <FormRow label="Default Partition">
              <Input
                placeholder="gpu"
                value={hpc.partition || ""}
                onChange={(e) => set("partition", e.target.value)}
              />
            </FormRow>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
