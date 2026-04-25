import React from "react";
import {
  Panel, PanelHeader, PanelBody,
  FormRow, Input, Select, ToggleRow,
} from "../components/UI";

export default function Cloud({ config, setConfig }) {
  const cloud = config.cloud || {};

  const set = (field, value) =>
    setConfig((p) => ({ ...p, cloud: { ...p.cloud, [field]: value } }));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
          Cloud Configuration
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>
          connect to AWS, Azure, or GCP compute backends
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {/* AWS */}
        <Panel>
          <PanelHeader title="Amazon Web Services" icon iconColor="orange">
            <button
              className={`toggle ${cloud.enable_aws ? "on" : "off"}`}
              onClick={() => set("enable_aws", !cloud.enable_aws)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="Access Key ID">
              <Input
                placeholder="AKIA••••••••••••"
                value={cloud.aws_access_key || ""}
                onChange={(e) => set("aws_access_key", e.target.value)}
              />
            </FormRow>
            <FormRow label="Secret Access Key">
              <Input
                type="password"
                placeholder="••••••••••••••••"
                value={cloud.aws_secret_key || ""}
                onChange={(e) => set("aws_secret_key", e.target.value)}
              />
            </FormRow>
            <FormRow label="Region">
              <Select
                value={cloud.aws_region || "us-east-1"}
                onChange={(e) => set("aws_region", e.target.value)}
                options={["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]}
              />
            </FormRow>
            <ToggleRow
              label="AWS Batch"
              sub="managed compute environment"
              value={cloud.enable_aws_batch || false}
              onChange={(v) => set("enable_aws_batch", v)}
            />
          </PanelBody>
        </Panel>

        {/* Azure */}
        <Panel>
          <PanelHeader title="Microsoft Azure" icon iconColor="blue">
            <button
              className={`toggle ${cloud.enable_azure ? "on" : "off"}`}
              onClick={() => set("enable_azure", !cloud.enable_azure)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="Subscription ID">
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx"
                value={cloud.azure_subscription_id || ""}
                onChange={(e) => set("azure_subscription_id", e.target.value)}
              />
            </FormRow>
            <FormRow label="Tenant ID">
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx"
                value={cloud.azure_tenant_id || ""}
                onChange={(e) => set("azure_tenant_id", e.target.value)}
              />
            </FormRow>
            <FormRow label="Batch Account URL">
              <Input
                placeholder="https://account.region.batch.azure.com"
                value={cloud.azure_batch_url || ""}
                onChange={(e) => set("azure_batch_url", e.target.value)}
              />
            </FormRow>
            <ToggleRow
              label="Azure Batch"
              sub="managed batch service"
              value={cloud.enable_azure_batch || false}
              onChange={(v) => set("enable_azure_batch", v)}
            />
          </PanelBody>
        </Panel>
      </div>

      {/* Future Providers */}
      <Panel>
        <PanelHeader title="Future Providers" icon iconColor="teal" />
        <PanelBody style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Google Cloud Batch", "Kubernetes API", "Databricks Workflows", "Slurm Cloud Bridge"].map((p) => (
            <span
              key={p}
              style={{
                padding: "5px 12px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                fontSize: 10,
                fontFamily: "var(--mono)",
                color: "var(--muted)",
              }}
            >
              {p}
            </span>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}