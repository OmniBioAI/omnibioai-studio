import React from "react";

export default function LogViewer({ lines = [] }) {
  if (!lines.length) return null;
  return <pre className="plugin-log">{lines.join("\n")}</pre>;
}
