import React, { useEffect, useState } from "react";

export default function StaticPngResult({ renderEndpoint, render }) {
  const [state, setState] = useState({ status: "loading", url: "", error: "" });

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    if (!renderEndpoint || !render) {
      setState({ status: "empty", url: "", error: "" });
      return () => {};
    }

    setState({ status: "loading", url: "", error: "" });
    fetch(renderEndpoint, {
      credentials: "same-origin",
      headers: { Accept: "image/png" },
    })
      .then(response => {
        if (!response.ok) throw new Error("Unable to load the result image.");
        return response.blob();
      })
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: objectUrl, error: "" });
      })
      .catch(error => {
        if (!cancelled) setState({ status: "error", url: "", error: error.message || "Unable to load the result image." });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [renderEndpoint, render]);

  if (state.status === "loading") return <p role="status">Loading result image…</p>;
  if (state.status === "error") return <p role="alert" className="plugin-error">{state.error}</p>;
  if (state.status !== "ready") return null;

  return (
    <figure>
      <img src={state.url} alt={render.alt} />
      <figcaption>{render.caption || render.label}</figcaption>
    </figure>
  );
}
