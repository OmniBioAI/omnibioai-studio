import React from "react";

export default function Cloud({ config, setConfig }) {

  const updateCloud = (field, value) => {
    setConfig({
      ...config,
      cloud: {
        ...config.cloud,
        [field]: value
      }
    });
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Cloud Configuration</h2>

      <h3>AWS</h3>

      <label>
        AWS Access Key
        <br />
        <input
          type="text"
          value={config.cloud.aws_access_key || ""}
          onChange={(e) =>
            updateCloud("aws_access_key", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        AWS Secret Key
        <br />
        <input
          type="password"
          value={config.cloud.aws_secret_key || ""}
          onChange={(e) =>
            updateCloud("aws_secret_key", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        AWS Region
        <br />
        <input
          type="text"
          placeholder="us-east-1"
          value={config.cloud.aws_region || ""}
          onChange={(e) =>
            updateCloud("aws_region", e.target.value)
          }
          style={{ width: "300px" }}
        />
      </label>

      <br /><br />

      <hr />

      <h3>Azure</h3>

      <label>
        Azure Subscription ID
        <br />
        <input
          type="text"
          value={config.cloud.azure_subscription_id || ""}
          onChange={(e) =>
            updateCloud("azure_subscription_id", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        Azure Tenant ID
        <br />
        <input
          type="text"
          value={config.cloud.azure_tenant_id || ""}
          onChange={(e) =>
            updateCloud("azure_tenant_id", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        Azure Client ID
        <br />
        <input
          type="text"
          value={config.cloud.azure_client_id || ""}
          onChange={(e) =>
            updateCloud("azure_client_id", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        Azure Client Secret
        <br />
        <input
          type="password"
          value={config.cloud.azure_client_secret || ""}
          onChange={(e) =>
            updateCloud("azure_client_secret", e.target.value)
          }
          style={{ width: "500px" }}
        />
      </label>

      <br /><br />

      <label>
        Azure Batch Account URL
        <br />
        <input
          type="text"
          placeholder="https://<account>.<region>.batch.azure.com"
          value={config.cloud.azure_batch_url || ""}
          onChange={(e) =>
            updateCloud("azure_batch_url", e.target.value)
          }
          style={{ width: "700px" }}
        />
      </label>

      <br /><br />

      <label>
        Enable AWS Batch
        <input
          type="checkbox"
          checked={config.cloud.enable_aws_batch || false}
          onChange={(e) =>
            updateCloud("enable_aws_batch", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>

      <br /><br />

      <label>
        Enable Azure Batch
        <input
          type="checkbox"
          checked={config.cloud.enable_azure_batch || false}
          onChange={(e) =>
            updateCloud("enable_azure_batch", e.target.checked)
          }
          style={{ marginLeft: "10px" }}
        />
      </label>
    </div>
  );
}