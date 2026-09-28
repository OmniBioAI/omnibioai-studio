import React from "react";

export default function RunStatus({ status }) {
  const state = status?.state || "";
  return (
    <p role="status">
      {state || "Queued"}{status?.detail ? `: ${status.detail}` : ""}
    </p>
  );
}
