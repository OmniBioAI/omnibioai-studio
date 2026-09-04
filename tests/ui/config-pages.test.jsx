import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Cloud from "../../src/ui/pages/Cloud";
import LLM from "../../src/ui/pages/LLM";
import HPC from "../../src/ui/pages/HPC";

// Electron bypasses RequirePermission's login/RBAC gate entirely (see its own
// comment), which is the path these config pages are actually used through.
beforeEach(() => { window.api = {}; });
afterEach(() => cleanup());

// Fires a change/click on every interactive control in the rendered form so
// each field's onChange callback body (not just its declaration) executes,
// and does it twice so both the `value || fallback` and populated-value
// branches run.
function exerciseAllControls(container) {
  container.querySelectorAll('input[type="text"], input:not([type])').forEach((el) => {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: `${el.value || "x"}1` } });
    fireEvent.blur(el);
  });
  container.querySelectorAll('input[type="password"]').forEach((el) => {
    fireEvent.change(el, { target: { value: "secret" } });
  });
  container.querySelectorAll("textarea").forEach((el) => {
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value: '{"k":"v"}' } });
    fireEvent.blur(el);
  });
  container.querySelectorAll("select").forEach((el) => {
    const opts = Array.from(el.options).map((o) => o.value);
    fireEvent.change(el, { target: { value: opts[opts.length - 1] } });
  });
  container.querySelectorAll("button.toggle").forEach((el) => {
    fireEvent.click(el);
  });
}

describe("Cloud configuration page", () => {
  it("renders every provider panel and exercises every field with an empty config", () => {
    const setConfig = vi.fn();
    const { container } = render(<Cloud config={{}} setConfig={setConfig} currentUser={null} />);
    expect(screen.getByText("Cloud Configuration")).toBeInTheDocument();
    exerciseAllControls(container);
    expect(setConfig).toHaveBeenCalled();
    // exercise the setConfig updater functions themselves
    setConfig.mock.calls.forEach(([fn]) => fn({ cloud: {} }));
  });

  it("renders with every field pre-populated, taking the populated-value branches", () => {
    const cloud = {
      enable_aws: true, aws_access_key: "AKIA", aws_secret_key: "s3cr3t", aws_region: "us-west-2", enable_aws_batch: true,
      enable_azure: true, azure_subscription_id: "sub", azure_tenant_id: "tenant", azure_batch_url: "https://x", enable_azure_batch: true,
      enable_gcp: true, gcp_project_id: "proj", gcp_region: "us-east1", gcp_service_account_key: "{}", gcp_bucket: "gs://b", enable_gcp_batch: true,
      enable_kubernetes: true, k8s_kubeconfig_path: "/k", k8s_context: "ctx", k8s_namespace: "ns", k8s_job_name_prefix: "p-",
      k8s_service_account: "sa", k8s_sif_base_url: "s3://", k8s_results_uri_template: "s3://r", k8s_image_pull_policy: "Always",
      k8s_aws_secret_name: "secretname", enable_k8s_jobs: true,
    };
    render(<Cloud config={{ cloud }} setConfig={vi.fn()} currentUser={null} />);
    expect(screen.getByDisplayValue("AKIA")).toBeInTheDocument();
    expect(screen.getByText("Future Providers")).toBeInTheDocument();
    expect(screen.getByText("Databricks Workflows")).toBeInTheDocument();
  });
});

describe("LLM configuration page", () => {
  it("renders every provider panel and exercises every field with an empty config", () => {
    const setConfig = vi.fn();
    const { container } = render(<LLM config={{}} setConfig={setConfig} currentUser={null} />);
    expect(screen.getByText("LLM Configuration")).toBeInTheDocument();
    exerciseAllControls(container);
    expect(setConfig).toHaveBeenCalled();
    setConfig.mock.calls.forEach(([fn]) => fn({ llm: {} }));
  });

  it("renders with every field pre-populated", () => {
    const llm = {
      enable_ollama: true, ollama_host: "http://x", local_model: "m", embedding_model: "e", enable_gpu: true,
      enable_claude: true, claude_api_key: "sk-ant", claude_model: "claude", claude_max_tokens: "1000", enable_rag: true,
      enable_openai: true, openai_api_key: "sk", openai_model: "gpt", offline_mode: true, default_model: "gpt-4o",
    };
    render(<LLM config={{ llm }} setConfig={vi.fn()} currentUser={null} />);
    expect(screen.getByDisplayValue("http://x")).toBeInTheDocument();
  });
});

describe("HPC configuration page", () => {
  it("renders every panel and exercises every field with an empty config", () => {
    const setConfig = vi.fn();
    const { container } = render(<HPC config={{}} setConfig={setConfig} currentUser={null} />);
    expect(screen.getByText("HPC Configuration")).toBeInTheDocument();
    exerciseAllControls(container);
    expect(setConfig).toHaveBeenCalled();
    setConfig.mock.calls.forEach(([fn]) => fn({ hpc: {} }));
  });

  it("renders with every field pre-populated", () => {
    const hpc = {
      enabled: true, scheduler: "pbs", enable_gpu: true, remote_execution: true,
      hostname: "hpc.edu", port: "22", username: "u", private_key: "~/.ssh/id_rsa",
      shared_mount: "/shared", apptainer_path: "/usr/bin/apptainer", partition: "gpu",
    };
    render(<HPC config={{ hpc }} setConfig={vi.fn()} currentUser={null} />);
    expect(screen.getByDisplayValue("hpc.edu")).toBeInTheDocument();
  });
});
