import React from "react";
import {
  Panel, PanelHeader, PanelBody,
  FormRow, Input, Select, Textarea, ToggleRow,
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
        <div style={{ fontSize: 'var(--font-size-sm)', color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
          connect to AWS, Azure, GCP, or Kubernetes compute backends
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

        {/* GCP */}
        <Panel>
          <PanelHeader title="Google Cloud Platform" icon iconColor="teal">
            <button
              className={`toggle ${cloud.enable_gcp ? "on" : "off"}`}
              onClick={() => set("enable_gcp", !cloud.enable_gcp)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="Project ID">
              <Input
                placeholder="my-gcp-project-id"
                value={cloud.gcp_project_id || ""}
                onChange={(e) => set("gcp_project_id", e.target.value)}
              />
            </FormRow>
            <FormRow label="Region">
              <Select
                value={cloud.gcp_region || "us-central1"}
                onChange={(e) => set("gcp_region", e.target.value)}
                options={["us-central1", "us-east1", "us-west1", "europe-west1", "asia-east1"]}
              />
            </FormRow>
            <FormRow label="Service Account Key JSON">
              <Textarea
                placeholder={'{\n  "type": "service_account",\n  ...\n}'}
                value={cloud.gcp_service_account_key || ""}
                onChange={(e) => set("gcp_service_account_key", e.target.value)}
                rows={4}
              />
            </FormRow>
            <FormRow label="Cloud Storage Bucket">
              <Input
                placeholder="gs://my-bucket/results"
                value={cloud.gcp_bucket || ""}
                onChange={(e) => set("gcp_bucket", e.target.value)}
              />
            </FormRow>
            <ToggleRow
              label="Google Cloud Batch"
              sub="managed compute environment"
              value={cloud.enable_gcp_batch || false}
              onChange={(v) => set("enable_gcp_batch", v)}
            />
          </PanelBody>
        </Panel>

        {/* Kubernetes */}
        <Panel>
          <PanelHeader title="Kubernetes" icon iconColor="#326CE5">
            <button
              className={`toggle ${cloud.enable_kubernetes ? "on" : "off"}`}
              onClick={() => set("enable_kubernetes", !cloud.enable_kubernetes)}
            />
          </PanelHeader>
          <PanelBody>
            <FormRow label="Kubeconfig Path">
              <Input
                placeholder="/home/$USER/.kube/config"
                value={cloud.k8s_kubeconfig_path || ""}
                onChange={(e) => set("k8s_kubeconfig_path", e.target.value)}
              />
            </FormRow>
            <FormRow label="Context">
              <Input
                placeholder="minikube"
                value={cloud.k8s_context || ""}
                onChange={(e) => set("k8s_context", e.target.value)}
              />
            </FormRow>
            <FormRow label="Namespace">
              <Input
                placeholder="tes"
                value={cloud.k8s_namespace || ""}
                onChange={(e) => set("k8s_namespace", e.target.value)}
              />
            </FormRow>
            <FormRow label="Job Name Prefix">
              <Input
                placeholder="tes-"
                value={cloud.k8s_job_name_prefix || ""}
                onChange={(e) => set("k8s_job_name_prefix", e.target.value)}
              />
            </FormRow>
            <FormRow label="Service Account">
              <Input
                placeholder="tes-runner"
                value={cloud.k8s_service_account || ""}
                onChange={(e) => set("k8s_service_account", e.target.value)}
              />
            </FormRow>
            <FormRow label="SIF Base URL">
              <Input
                placeholder="s3://omnibioai-sif-..."
                value={cloud.k8s_sif_base_url || ""}
                onChange={(e) => set("k8s_sif_base_url", e.target.value)}
              />
            </FormRow>
            <FormRow label="Results URI Template">
              <Input
                placeholder="s3://omnibioai-results-.../tes-runs/{run_id}/results.json"
                value={cloud.k8s_results_uri_template || ""}
                onChange={(e) => set("k8s_results_uri_template", e.target.value)}
              />
            </FormRow>
            <FormRow label="Image Pull Policy">
              <Select
                value={cloud.k8s_image_pull_policy || "IfNotPresent"}
                onChange={(e) => set("k8s_image_pull_policy", e.target.value)}
                options={["IfNotPresent", "Always", "Never"]}
              />
            </FormRow>
            <FormRow label="AWS Secret Name">
              <Input
                placeholder="aws-credentials"
                value={cloud.k8s_aws_secret_name || ""}
                onChange={(e) => set("k8s_aws_secret_name", e.target.value)}
              />
            </FormRow>
            <ToggleRow
              label="Kubernetes Jobs"
              sub="submit jobs via Kubernetes API"
              value={cloud.enable_k8s_jobs || false}
              onChange={(v) => set("enable_k8s_jobs", v)}
            />
          </PanelBody>
        </Panel>
      </div>

      {/* Future Providers */}
      <Panel>
        <PanelHeader title="Future Providers" icon iconColor="teal" />
        <PanelBody style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Databricks Workflows", "Slurm Cloud Bridge"].map((p) => (
            <span
              key={p}
              style={{
                padding: "5px 12px",
                borderRadius: 5,
                border: "1px solid var(--border)",
                fontSize: 'var(--font-size-xs)',
                fontFamily: "var(--mono)",
                color: "var(--color-text-muted)",
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
