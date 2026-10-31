import React, { useCallback, useEffect, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import "./UtilityRegistryRenderers.css";

const CATALOG_TABS = [
  ["plugins", "Plugins", "/plugins/catalog/api/plugins/"],
  ["servers", "Servers", "/plugins/catalog/api/servers/"],
  ["tools", "Tools", "/plugins/catalog/api/tools/"],
  ["workflows", "Workflows", "/plugins/catalog/api/workflows/"],
];

export function UtilityPanel({ title, children, className = "" }) {
  return <section className={`utility-react__panel ${className}`}><header><h2>{title}</h2></header><div>{children}</div></section>;
}

export function Payload({ value, empty = "No records returned." }) {
  if (value == null) return <p className="utility-react__empty">{empty}</p>;
  const arrays = Array.isArray(value) ? [value] : Object.values(value).filter(Array.isArray);
  const collection = arrays.length === 1 && (Array.isArray(value) || Object.keys(value).length === 1) ? arrays[0] : null;
  if (!collection) return <pre className="utility-react__json">{JSON.stringify(value, null, 2)}</pre>;
  if (!collection.length) return <p className="utility-react__empty">{empty}</p>;
  const columns = [...new Set(collection.flatMap(row => row && typeof row === "object" ? Object.keys(row) : ["value"]))].slice(0, 8);
  return <div className="utility-react__table-wrap"><table><thead><tr>{columns.map(key => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead>
    <tbody>{collection.map((row, index) => <tr key={row?.id ?? row?.slug ?? row?.name ?? index}>{columns.map(key => <td key={key}>{typeof row === "object" && row !== null ? String(row[key] ?? "—") : String(row)}</td>)}</tr>)}</tbody></table></div>;
}

export function CatalogReactRenderer() {
  const [tab, setTab] = useState("plugins");
  const [payload, setPayload] = useState(null);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (selected = tab) => {
    const route = CATALOG_TABS.find(([key]) => key === selected)?.[2];
    if (!route) return;
    setBusy(true); setError("");
    try {
      const [data, totals] = await Promise.all([
        nativePluginRequest(route),
        nativePluginRequest("/plugins/catalog/api/summary/"),
      ]);
      setPayload(data); setSummary(totals);
    } catch (failure) { setError(failure.message || "Could not load catalog data."); }
    finally { setBusy(false); }
  }, [tab]);
  useEffect(() => { load(tab); }, [load, tab]);
  async function refreshCatalog() {
    setBusy(true); setError("");
    try { await nativePluginRequest("/plugins/catalog/api/refresh/", { method: "POST", body: {} }); await load(tab); }
    catch (failure) { setError(failure.message || "Could not refresh catalog."); }
    finally { setBusy(false); }
  }
  return <main className="utility-react" aria-label="Workbench Catalog">
    <header className="utility-react__hero"><div><p>DISCOVERY · REGISTRY</p><h1>Workbench Catalog</h1><span>Browse plugins, tool servers, tools, and workflows from the live Workbench registry.</span></div>
      <button type="button" onClick={refreshCatalog} disabled={busy}>{busy ? "Refreshing…" : "Refresh capabilities"}</button></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    {summary && <div className="utility-react__metrics">{Object.entries(summary).filter(([, value]) => ["string", "number"].includes(typeof value)).slice(0, 6).map(([key, value]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{value}</strong></div>)}</div>}
    <UtilityPanel title="Catalog inventory">
      <nav className="utility-react__tabs" aria-label="Catalog type">{CATALOG_TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <Payload value={payload} empty={busy ? "Loading catalog…" : `No ${tab} are registered.`}/>
    </UtilityPanel>
  </main>;
}

export function SchemaRegistryReactRenderer() {
  const [schemas, setSchemas] = useState(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [json, setJson] = useState("{}\n");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try { setSchemas(await nativePluginRequest("/plugins/schema_registry/api/schemas/")); }
    catch (failure) { setError(failure.message || "Could not load registered schemas."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  async function validate(event) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const data = JSON.parse(json);
        setResult(await nativePluginRequest("/plugins/schema_registry/api/validate/", { method: "POST", body: { schema_id: name, version: version || undefined, data } }));
    } catch (failure) { setError(failure instanceof SyntaxError ? `Input data is not valid JSON: ${failure.message}` : failure.message || "Schema validation failed."); }
    finally { setBusy(false); }
  }
  return <main className="utility-react" aria-label="Schema Registry">
    <header className="utility-react__hero"><div><p>DATA CONTRACTS · VALIDATION</p><h1>Schema Registry</h1><span>Browse registered schemas and validate a payload against a selected schema version.</span></div>
      <button type="button" onClick={refresh} disabled={busy}>{busy ? "Loading…" : "Refresh schemas"}</button></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    <div className="utility-react__grid">
      <UtilityPanel title="Registered schemas"><Payload value={schemas} empty={busy ? "Loading schemas…" : "No schemas are registered."}/></UtilityPanel>
      <UtilityPanel title="Validate data"><form className="utility-react__form" onSubmit={validate}>
        <label>Schema ID<input value={name} onChange={event => setName(event.target.value)} required /></label>
        <label>Version<input value={version} onChange={event => setVersion(event.target.value)} placeholder="Latest" /></label>
        <label>JSON payload<textarea value={json} onChange={event => setJson(event.target.value)} rows={9} spellCheck={false} required /></label>
        <button type="submit" disabled={busy || !name}>{busy ? "Validating…" : "Validate"}</button>
      </form>{result && <div className="utility-react__result" role="status"><h3>Validation result</h3><Payload value={result}/></div>}</UtilityPanel>
    </div>
  </main>;
}

export function FormatConverterReactRenderer() {
  const [formats, setFormats] = useState([]);
  const [input, setInput] = useState("");
  const [sourceFormat, setSourceFormat] = useState("");
  const [destinationFormat, setDestinationFormat] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    nativePluginRequest("/plugins/format_converter/api/formats/").then(data => {
      if (active) setFormats(data.formats || data.items || []);
    }).catch(failure => { if (active) setError(failure.message || "Could not load supported formats."); });
    return () => { active = false; };
  }, []);
  async function act(action) {
    setBusy(action); setError(""); setResult(null);
    const paths = { detect: "detect-format", plan: "validate-conversion", convert: "convert" };
    const body = { input, source_format: sourceFormat || undefined, destination_format: destinationFormat || undefined, output: outputPath || undefined };
    try { setResult(await nativePluginRequest(`/plugins/format_converter/api/${paths[action]}/`, { method: "POST", body })); }
    catch (failure) { setError(failure.message || "Conversion request failed."); }
    finally { setBusy(""); }
  }
  return <main className="utility-react" aria-label="Format Converter">
    <header className="utility-react__hero"><div><p>DATA INTEROPERABILITY · CONVERSION</p><h1>Format Converter</h1><span>Inspect supported conversions, validate a conversion plan, and run a conversion on a registered source.</span></div>
      <span>{formats.length} supported formats</span></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    <div className="utility-react__grid"><UtilityPanel title="Conversion request"><form className="utility-react__form" onSubmit={event => { event.preventDefault(); act("plan"); }}>
      <label>Input path or registered object<input value={input} onChange={event => setInput(event.target.value)} required /></label>
      <label>Source format<input value={sourceFormat} onChange={event => setSourceFormat(event.target.value)} placeholder="Auto-detect" /></label>
      <label>Destination format<select value={destinationFormat} onChange={event => setDestinationFormat(event.target.value)} required><option value="">Choose format…</option>{formats.map(item => {
        const format = typeof item === "string" ? item : item.id || item.name || item.format;
        return format ? <option key={format} value={format}>{format}</option> : null;
      })}</select></label>
      <label>Output path (optional)<input value={outputPath} onChange={event => setOutputPath(event.target.value)} /></label>
      <div className="utility-react__tabs"><button type="button" onClick={() => act("detect")} disabled={!input || Boolean(busy)}>{busy === "detect" ? "Detecting…" : "Detect format"}</button>
        <button type="submit" disabled={!input || !destinationFormat || Boolean(busy)}>{busy === "plan" ? "Validating…" : "Validate plan"}</button>
        <button type="button" onClick={() => act("convert")} disabled={!input || !destinationFormat || Boolean(busy)}>{busy === "convert" ? "Converting…" : "Convert"}</button></div>
    </form>{result && <div className="utility-react__result"><h3>Conversion result</h3><Payload value={result}/></div>}</UtilityPanel>
      <UtilityPanel title="Supported formats"><Payload value={formats} empty="The server did not report any available formats."/></UtilityPanel></div>
  </main>;
}

export function EnvironmentManagerReactRenderer() {
  const [environments, setEnvironments] = useState([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setBusy("load"); setError("");
    try {
      const data = await nativePluginRequest("/plugins/environment_manager/api/environments/");
      const rows = data.environments || data.items || [];
      setEnvironments(rows);
      setEnvironmentId(current => current || rows[0]?.environment_id || rows[0]?.id || "");
    } catch (failure) { setError(failure.message || "Could not load environments."); }
    finally { setBusy(""); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  async function inspect(action) {
    if (!environmentId) return;
    const routes = { validate: "validate/", conflicts: "conflicts/", drift: "drift/", manifest: "manifest/" };
    setBusy(action); setError(""); setResult(null);
    try { setResult(await nativePluginRequest(`/plugins/environment_manager/api/${routes[action]}`, { method: "POST", body: { environment_id: environmentId } })); }
    catch (failure) { setError(failure.message || "Environment check failed."); }
    finally { setBusy(""); }
  }
  return <main className="utility-react" aria-label="Environment Manager">
    <header className="utility-react__hero"><div><p>RUNTIME INVENTORY · REPRODUCIBILITY</p><h1>Environment Manager</h1><span>Review software environments and run read-only readiness, conflict, drift, and manifest checks.</span></div>
      <button type="button" onClick={refresh} disabled={Boolean(busy)}>{busy === "load" ? "Loading…" : "Refresh inventory"}</button></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    <div className="utility-react__grid"><UtilityPanel title="Environment inventory"><Payload value={environments} empty={busy === "load" ? "Loading environments…" : "No environments are registered."}/></UtilityPanel>
      <UtilityPanel title="Readiness checks"><div className="utility-react__form"><label>Environment<select value={environmentId} onChange={event => setEnvironmentId(event.target.value)}><option value="">Choose environment…</option>{environments.map(env => {
        const id = env.environment_id || env.id;
        return id ? <option key={id} value={id}>{env.name || env.label || id}</option> : null;
      })}</select></label>
        <div className="utility-react__tabs">{[["validate", "Validate"], ["conflicts", "Detect conflicts"], ["drift", "Check drift"], ["manifest", "Build manifest"]].map(([key, label]) => <button type="button" key={key} onClick={() => inspect(key)} disabled={!environmentId || Boolean(busy)}>{busy === key ? "Checking…" : label}</button>)}</div>
      </div>{result && <div className="utility-react__result"><h3>Check result</h3><Payload value={result}/></div>}</UtilityPanel></div>
  </main>;
}

export function DataLineageTrackerReactRenderer() {
  const [query, setQuery] = useState("");
  const [objectId, setObjectId] = useState("");
  const [rows, setRows] = useState(null);
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function search(event) {
    event?.preventDefault(); setBusy(true); setError(""); setImpact(null);
    try { setRows(await nativePluginRequest(`/plugins/data_lineage_tracker/api/lineage/search/?q=${encodeURIComponent(query)}&page_size=50`)); }
    catch (failure) { setError(failure.message || "Lineage search failed."); }
    finally { setBusy(false); }
  }
  async function analyzeImpact(event) {
    event.preventDefault(); setBusy(true); setError(""); setImpact(null);
    try { setImpact(await nativePluginRequest("/plugins/data_lineage_tracker/api/lineage/impact-analysis/", { method: "POST", body: { object_id: objectId, scenario: "invalidated" } })); }
    catch (failure) { setError(failure.message || "Impact analysis failed."); }
    finally { setBusy(false); }
  }
  return <main className="utility-react" aria-label="Data Lineage Tracker">
    <header className="utility-react__hero"><div><p>REPRODUCIBILITY · IMPACT ANALYSIS</p><h1>Data Lineage Tracker</h1><span>Find lineage records, inspect returned relationships, and estimate the impact of invalidating an object.</span></div>
      <button type="button" onClick={() => search()} disabled={busy}>{busy ? "Searching…" : "Refresh search"}</button></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    <div className="utility-react__grid"><UtilityPanel title="Search lineage"><form className="utility-react__form" onSubmit={search}><label>Search records<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Object, run, tool, workflow…" /></label><button type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button></form>
      <div className="utility-react__result"><Payload value={rows} empty={busy ? "Searching lineage…" : "Enter a query to find lineage records."}/></div></UtilityPanel>
      <UtilityPanel title="Impact analysis"><form className="utility-react__form" onSubmit={analyzeImpact}><label>Object or lineage ID<input value={objectId} onChange={event => setObjectId(event.target.value)} required /></label><button type="submit" disabled={busy || !objectId}>{busy ? "Analyzing…" : "Analyze impact"}</button></form>{impact && <div className="utility-react__result"><Payload value={impact}/></div>}</UtilityPanel></div>
  </main>;
}
