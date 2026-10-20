import React, { useEffect, useState } from "react";
import { getStorageUsage } from "../lib/artifactsApi";
import { StorageUsage } from "./Artifacts";
import "./Artifacts.css";

export default function AccountStorage() {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    getStorageUsage({ signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ status: "success", data });
    }).catch(error => {
      if (!controller.signal.aborted && error?.name !== "AbortError") {
        setState({ status: "error", data: null });
      }
    });
    return () => controller.abort();
  }, [reload]);

  return <section aria-labelledby="account-storage-heading">
    <h2 id="account-storage-heading">Storage</h2>
    <p>Your personal managed storage allowance and current usage.</p>
    <StorageUsage state={state} />
    <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
      onClick={() => setReload(value => value + 1)}>Refresh usage</button>
  </section>;
}
