import React, { useCallback, useEffect, useRef, useState } from "react";
import { isElectron } from "../../lib/session";
import "./GenomeViewerRenderer.css";

const API = "/_svc/workbench/plugins/genome_viewer/api";
const IGV_SCRIPT = "/static/vendor/igv.min.js";
const TRACK_TYPES = ["bed", "vcf", "bam", "cram", "bigwig", "gff", "gtf"];

function serviceUrl(path) {
  const origin = isElectron() ? (import.meta.env.DEV ? "http://localhost:5174" : "http://localhost") : "";
  return `${origin}${path}`;
}

async function readJson(response) {
  let data = {};
  try { data = await response.json(); } catch { /* handled as an HTTP/API error below */ }
  if (!response.ok) throw new Error(data.error || `Workbench request failed (${response.status}).`);
  return data;
}

function loadIgv() {
  if (globalThis.igv) return Promise.resolve(globalThis.igv);
  if (globalThis.__omniIgvLoading) return globalThis.__omniIgvLoading;
  globalThis.__omniIgvLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = serviceUrl(IGV_SCRIPT);
    script.async = true;
    script.onload = () => globalThis.igv ? resolve(globalThis.igv) : reject(new Error("IGV loaded without its browser API."));
    script.onerror = () => reject(new Error("Could not load IGV.js from Workbench."));
    document.head.appendChild(script);
  });
  return globalThis.__omniIgvLoading;
}

export default function GenomeViewerRenderer() {
  const viewerRef = useRef(null);
  const browserRef = useRef(null);
  const browserGenomeRef = useRef("");
  const [references, setReferences] = useState([]);
  const [organism, setOrganism] = useState("");
  const [version, setVersion] = useState("");
  const [locus, setLocus] = useState("chr1:3000000-3200000");
  const [fileType, setFileType] = useState("bed");
  const [mode, setMode] = useState("link");
  const [trackUrl, setTrackUrl] = useState("https://s3.amazonaws.com/igv.org.genomes/locations/geneLocations_hg38.bed.gz");
  const [upload, setUpload] = useState(null);
  const [pasteText, setPasteText] = useState("");
  const [objects, setObjects] = useState([]);
  const [objectId, setObjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(serviceUrl(`${API}/reference/`), { credentials: "same-origin", signal: controller.signal })
      .then(readJson)
      .then(data => {
        const items = Array.isArray(data.organisms) ? data.organisms : [];
        setReferences(items);
        setOrganism(current => current || items[0]?.name || "");
        setVersion(current => current || items[0]?.versions?.[0] || "");
      })
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!organism) { setVersion(""); return; }
    const available = references.find(item => item.name === organism)?.versions || [];
    setVersion(current => available.includes(current) ? current : (available[0] || ""));
  }, [organism, references]);

  useEffect(() => {
    if (mode !== "omniobject") return undefined;
    const controller = new AbortController();
    setObjects([]); setObjectId("");
    fetch(serviceUrl(`${API}/omniobjects/`), { credentials: "same-origin", signal: controller.signal })
      .then(readJson)
      .then(data => setObjects(Array.isArray(data.objects) ? data.objects : []))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, [mode]);

  useEffect(() => () => {
    try { browserRef.current?.dispose?.(); } catch { /* IGV teardown is best effort */ }
    browserRef.current = null;
    browserGenomeRef.current = "";
  }, []);

  const visualize = useCallback(async event => {
    event.preventDefault();
    setBusy(true); setError(""); setStatus("Preparing track…");
    try {
      if (!version) throw new Error("Select a reference genome before visualizing.");
      let response;
      if (mode === "upload") {
        if (!upload) throw new Error("Choose a track file to upload.");
        const form = new FormData();
        form.append("file", upload); form.append("organism", organism); form.append("version", version);
        form.append("file_type", fileType); form.append("locus", locus);
        response = await fetch(serviceUrl(`${API}/tracks/`), { method: "POST", credentials: "same-origin", body: form });
      } else {
        const payload = { organism, version, locus, file_type: fileType, input_mode: mode };
        if (mode === "link") payload.url = trackUrl.trim();
        if (mode === "omniobject") payload.object_id = objectId;
        if (mode === "paste") payload.paste_text = pasteText;
        if (mode === "link" && !payload.url) throw new Error("Provide a track URL.");
        if (mode === "omniobject" && !objectId) throw new Error("Select an OmniObject.");
        if (mode === "paste" && !pasteText.trim()) throw new Error("Paste BED or VCF content first.");
        response = await fetch(serviceUrl(`${API}/tracks/`), {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const data = await readJson(response);
      const igv = await loadIgv();
      if (!viewerRef.current) throw new Error("The genome viewer is not ready yet.");
      if (browserRef.current && browserGenomeRef.current !== version) {
        await browserRef.current.dispose?.();
        browserRef.current = null;
      }
      if (!browserRef.current) {
        browserRef.current = await igv.createBrowser(viewerRef.current, {
          genome: version,
          locus: data.locus || locus || "chr1:3000000-3200000",
          tracks: data.tracks || [],
        });
        browserGenomeRef.current = version;
      } else {
        for (const track of data.tracks || []) await browserRef.current.loadTrack(track);
        const target = data.locus || locus;
        if (target) await browserRef.current.search(target);
      }
      setStatus("Track loaded");
    } catch (e) {
      setError(e.message || "Unable to load this track."); setStatus("Needs attention");
    } finally { setBusy(false); }
  }, [fileType, locus, mode, objectId, organism, pasteText, trackUrl, upload, version]);

  const versions = references.find(item => item.name === organism)?.versions || [];
  return (
    <section className="genome-viewer" aria-label="Genome Viewer">
      <div className="genome-viewer__heading">
        <div><span className="genome-viewer__eyebrow">GENOMICS · IGV.JS</span><h2>Explore genomic tracks</h2>
          <p>Load a track from a link, upload, OmniObject, or pasted text, then inspect it interactively.</p></div>
        <span className="genome-viewer__ready"><i />{status}</span>
      </div>
      {error && <div className="genome-viewer__error" role="alert">{error}</div>}
      <div className="genome-viewer__grid">
        <form className="genome-viewer__panel genome-viewer__controls" onSubmit={visualize}>
          <header><div><h3>Inputs</h3><p>Configure track and locus</p></div><span>01</span></header>
          <div className="genome-viewer__fields">
            <label>Organism<select value={organism} onChange={e => setOrganism(e.target.value)}><option value="">Select organism</option>{references.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label>
            <label>Reference version<select value={version} onChange={e => setVersion(e.target.value)} disabled={!versions.length}><option value="">{versions.length ? "Select version" : "No references found"}</option>{versions.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Locus <span>(optional)</span><input value={locus} onChange={e => setLocus(e.target.value)} placeholder="chr1:3000000-3200000" /></label>
            <label>Track type<select value={fileType} onChange={e => setFileType(e.target.value)}>{TRACK_TYPES.map(type => <option key={type} value={type}>{type.toUpperCase()}</option>)}</select></label>
            <fieldset className="genome-viewer__source"><legend>Input source</legend><div>{[["link", "Link"], ["upload", "Upload"], ["omniobject", "OmniObject"], ["paste", "Paste"]].map(([value, label]) => <label key={value}><input type="radio" name="genome-input-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setError(""); }} />{label}</label>)}</div></fieldset>
            {mode === "link" && <label className="genome-viewer__full">Track URL<input type="url" value={trackUrl} onChange={e => setTrackUrl(e.target.value)} placeholder="https://…/track.bed.gz" /><small>Public BED, VCF, BAM, or BigWig links work well.</small></label>}
            {mode === "upload" && <label className="genome-viewer__full">Upload file<input type="file" onChange={e => setUpload(e.target.files?.[0] || null)} /><small>Small BED/VCF files are best for quick rendering.</small></label>}
            {mode === "omniobject" && <label className="genome-viewer__full">Select OmniObject<select value={objectId} onChange={e => setObjectId(e.target.value)}><option value="">{objects.length ? "Select object" : "No objects found"}</option>{objects.map(item => <option key={item.object_id} value={item.object_id}>{item.name || item.object_id} ({item.object_id})</option>)}</select><small>Objects are loaded from the Workbench registry.</small></label>}
            {mode === "paste" && <label className="genome-viewer__full">Paste BED / VCF<textarea rows="6" value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder={'BED example:\nchr1 3000000 3001000 feature1'} /><small>Keep pasted content small for quick rendering.</small></label>}
            <button className="genome-viewer__submit" type="submit" disabled={busy}>{busy ? "Loading track…" : "Visualize track"}<span aria-hidden="true">→</span></button>
          </div>
        </form>
        <section className="genome-viewer__panel genome-viewer__canvas" aria-label="Genome track viewer">
          <header><div><h3>Viewer</h3><p>Interactive genome browser</p></div><span>IGV</span></header>
          <div className="genome-viewer__viewport"><div ref={viewerRef} /></div>
        </section>
      </div>
    </section>
  );
}
