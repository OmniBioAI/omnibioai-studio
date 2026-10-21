import React, { useState } from "react";
import { useStorageUsage } from "../lib/useStorageUsage";
import { StorageUsage } from "./Artifacts";
import "./Artifacts.css";

export default function AccountStorage() {
  const [reload, setReload] = useState(0);
  const state = useStorageUsage(reload);

  return <section aria-labelledby="account-storage-heading">
    <h2 id="account-storage-heading">Storage</h2>
    <p>Your personal managed storage allowance and current usage.</p>
    <StorageUsage state={state} />
    <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm"
      disabled={state.status === "loading"}
      onClick={() => setReload(value => value + 1)}>Refresh usage</button>
  </section>;
}
