// Only known, noncredential provider settings may cross the disk boundary.
// Excluded values are never inspected, logged, backed up, or migrated to Auth.
const fs = require("fs");
const FIELDS = {"llm": ["claude_max_tokens", "claude_model", "default_model", "embedding_model", "enable_claude", "enable_gpu", "enable_ollama", "enable_openai", "enable_rag", "local_model", "offline_mode", "ollama_host", "openai_model"], "cloud": ["aws_region", "azure_batch_url", "azure_subscription_id", "azure_tenant_id", "enable_aws", "enable_aws_batch", "enable_azure", "enable_azure_batch", "enable_gcp", "enable_gcp_batch", "enable_k8s_jobs", "enable_kubernetes", "gcp_bucket", "gcp_project_id", "gcp_region", "k8s_aws_secret_name", "k8s_context", "k8s_image_pull_policy", "k8s_job_name_prefix", "k8s_kubeconfig_path", "k8s_namespace", "k8s_results_uri_template", "k8s_service_account", "k8s_sif_base_url"]};
function projectConfig(config) {
  const safe = { ...config };
  let retired = false;
  for (const [section, fields] of Object.entries(FIELDS)) {
    const source = config?.[section] || {};
    safe[section] = {};
    for (const field of Object.keys(source)) {
      if (!fields.includes(field)) { retired = true; continue; }
      const value = source[field];
      if (["string", "boolean", "number"].includes(typeof value)) safe[section][field] = value;
    }
  }
  if (retired) safe.provider_credentials_retired = true;
  return safe;
}

function retireLegacyProviderEnvironment(envPath) {
  if (!fs.existsSync(envPath)) return false;
  const raw = fs.readFileSync(envPath, "utf8");
  // Operates on variable names, never reports their values. Only Studio's
  // own generated environment file is passed here, never operator files.
  const pattern = /^\s*(?:export\s+)?(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|GCP_SERVICE_ACCOUNT_KEY)\s*=/;
  const lines = raw.split("\n");
  const kept = lines.filter(line => !pattern.test(line));
  if (kept.length === lines.length) return false;
  fs.writeFileSync(envPath, kept.join("\n"), { encoding: "utf8", mode: 0o600 });
  fs.chmodSync(envPath, 0o600);
  return true;
}
module.exports = { projectConfig, retireLegacyProviderEnvironment };
