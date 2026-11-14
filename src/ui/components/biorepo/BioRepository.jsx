import React, { useEffect, useState } from "react";
import { hasPermission } from "../../lib/session";
import { isDatasetId } from "../../lib/biorepoApi";
import RepositoryBrowse from "./RepositoryBrowse";
import DatasetDetail from "./DatasetDetail";
import IngestForm from "./IngestForm";
import AdminCapacity from "./AdminCapacity";
import "./BioRepository.css";

// ?dataset=ds_... deep-links a dataset (shareable, survives reload). The
// permission checks here only hide buttons; the API decides every action.
function datasetFromUrl() {
  const id = new URLSearchParams(window.location.search).get("dataset");
  return isDatasetId(id) ? id : null;
}

function writeDataset(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("dataset", id); else url.searchParams.delete("dataset");
  window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function BioRepository({ view = "browse" }) {
  const [datasetId, setDatasetId] = useState(datasetFromUrl);
  const [creating, setCreating] = useState(false);
  const canWrite = hasPermission("biorepo.write") || hasPermission("biorepo.admin");

  useEffect(() => {
    const onPop = () => { setDatasetId(datasetFromUrl()); setCreating(false); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const open = id => { setCreating(false); setDatasetId(id); writeDataset(id); };
  if (view === "capacity") return <AdminCapacity />;
  if (creating) return <section className="biorepo">
    <IngestForm onDone={id => open(id)} onCancel={() => setCreating(false)} /></section>;
  if (datasetId) return <DatasetDetail key={datasetId} datasetId={datasetId} canWrite={canWrite}
    onBack={() => open(null)} onOpenDataset={open} />;
  return <RepositoryBrowse onOpen={open} onNew={() => setCreating(true)} canWrite={canWrite} />;
}
