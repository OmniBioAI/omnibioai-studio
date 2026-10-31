import React, { useCallback, useEffect, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { Payload, UtilityPanel } from "./UtilityRegistryRenderers";

function useJsonRequest() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return { error, setError, busy, setBusy };
}

export function ObjectRegistryExplorerReactRenderer() {
  const [filters, setFilters] = useState({ q: "", type: "all", status: "all", created_by: "all", sort: "newest", page: 1, page_size: 25 });
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const state = useJsonRequest();
  const load = useCallback(async () => {
    state.setBusy(true); state.setError("");
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== ""));
      setData(await nativePluginRequest(`/plugins/object_registry_explorer/api/objects/?${query}`));
    } catch (failure) { state.setError(failure.message || "Could not load registered objects."); }
    finally { state.setBusy(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  async function inspect(id) {
    state.setBusy(true); state.setError("");
    try { setSelected(await nativePluginRequest(`/plugins/object_registry_explorer/api/objects/${encodeURIComponent(id)}/`)); }
    catch (failure) { state.setError(failure.message || "Could not load object details."); }
    finally { state.setBusy(false); }
  }
  function change(key, value) { setFilters(current => ({ ...current, [key]: value, page: 1 })); }
  return <main className="utility-react" aria-label="Object Registry Explorer">
    <header className="utility-react__hero"><div><p>DATA GOVERNANCE · OBJECT LINEAGE</p><h1>Object Registry Explorer</h1><span>Search registered objects, inspect metadata, and follow parent/child lineage.</span></div><button type="button" onClick={load} disabled={state.busy}>Refresh objects</button></header>
    {state.error && <p role="alert" className="utility-react__error">{state.error}</p>}
    <UtilityPanel title={`Registry objects · ${data?.total ?? "…"}`}>
      <form className="utility-react__form" onSubmit={event => { event.preventDefault(); load(); }}>
        <label>Search<input value={filters.q} onChange={event => change("q", event.target.value)} placeholder="Object ID, path, metadata…" /></label>
        {[['type','Object type','types'],['status','Status','statuses'],['created_by','Created by','creators']].map(([key,label,source]) => <label key={key}>{label}<select value={filters[key]} onChange={event => change(key,event.target.value)}><option value="all">All</option>{(data?.[source] || []).map(v => <option key={v}>{v}</option>)}</select></label>)}
        <label>Sort<select value={filters.sort} onChange={event => change("sort",event.target.value)}>{[["newest","Newest"],["oldest","Oldest"],["type","Type"],["status","Status"],["size","Size"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <button type="submit" disabled={state.busy}>{state.busy ? "Loading…" : "Search"}</button>
      </form>
      <div className="utility-react__table-wrap"><table><thead><tr>{["Object","Type","Status","Created by","Size","Inputs"].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{(data?.objects || []).map(row=><tr key={row.object_id}><td><button type="button" onClick={()=>inspect(row.object_id)}>{row.short_id}</button></td><td>{row.object_type}</td><td>{row.status}</td><td>{row.created_by}</td><td>{row.size_h}</td><td>{row.inputs_count}</td></tr>)}</tbody></table></div>
      <div className="utility-react__tabs"><button type="button" disabled={filters.page<=1 || state.busy} onClick={()=>setFilters(v=>({...v,page:v.page-1}))}>Previous</button><span>Page {filters.page} · {data?.total ?? 0} objects</span><button type="button" disabled={filters.page*filters.page_size >= (data?.total || 0) || state.busy} onClick={()=>setFilters(v=>({...v,page:v.page+1}))}>Next</button></div>
    </UtilityPanel>
    {selected && <UtilityPanel title={`Object ${selected.object_id}`}><button type="button" onClick={()=>setSelected(null)}>Close detail</button><p>{selected.object_type} · {selected.status} · {selected.size_h}</p><h3>Parents</h3><Payload value={selected.parents}/><h3>Children</h3><Payload value={selected.children}/><h3>Lineage edges</h3><Payload value={selected.lineage_edges}/><h3>Metadata</h3><Payload value={selected.object}/></UtilityPanel>}
  </main>;
}

export function ReferenceRegistryReactRenderer() {
  const [filters, setFilters] = useState({ organism: "", type: "" });
  const [references, setReferences] = useState([]);
  const [form, setForm] = useState({ name: "", build: "", organism: "", type: "fasta", tags: "", is_default: false, file: null });
  const state = useJsonRequest();
  const load = useCallback(async () => {
    state.setBusy(true); state.setError("");
    try { const query = new URLSearchParams(Object.entries(filters).filter(([,v])=>v)); const result=await nativePluginRequest(`/plugins/reference_registry/api/references/?${query}`); setReferences(result.references || []); }
    catch (failure) { state.setError(failure.message || "Could not load references."); }
    finally { state.setBusy(false); }
  }, [filters]);
  useEffect(()=>{load();},[load]);
  function setField(key,value) { setForm(current=>({...current,[key]:value})); }
  async function upload(event) {
    event.preventDefault(); if (!form.file) return;
    state.setBusy(true); state.setError("");
    const body = new FormData(); Object.entries(form).forEach(([key,value])=>{if(value!==null) body.append(key,key==="is_default"?String(value):value);});
    try { await nativePluginRequest("/plugins/reference_registry/api/references/upload/",{method:"POST",body}); setForm(current=>({...current,name:"",build:"",tags:"",is_default:false,file:null})); event.currentTarget.reset(); await load(); }
    catch (failure) { state.setError(failure.message || "Reference upload failed."); }
    finally { state.setBusy(false); }
  }
  return <main className="utility-react" aria-label="Reference Registry">
    <header className="utility-react__hero"><div><p>REFERENCE DATA · REGISTRY</p><h1>Reference Registry</h1><span>Register validated reference files and choose the default reference for an organism and data type.</span></div><button type="button" onClick={load} disabled={state.busy}>Refresh references</button></header>
    {state.error && <p role="alert" className="utility-react__error">{state.error}</p>}
    <div className="utility-react__grid"><UtilityPanel title="Registered references"><div className="utility-react__form"><label>Organism filter<input value={filters.organism} onChange={event=>setFilters(v=>({...v,organism:event.target.value}))}/></label><label>Type filter<select value={filters.type} onChange={event=>setFilters(v=>({...v,type:event.target.value}))}><option value="">All types</option><option value="fasta">FASTA</option><option value="gtf">GTF</option><option value="index">Index</option></select></label></div><Payload value={references} empty={state.busy?"Loading references…":"No references match these filters."}/></UtilityPanel>
      <UtilityPanel title="Upload reference"><form className="utility-react__form" onSubmit={upload}><label>Reference file<input type="file" required onChange={event=>setField("file",event.target.files?.[0]||null)}/></label><label>Name<input required value={form.name} onChange={event=>setField("name",event.target.value)}/></label><label>Build<input required value={form.build} onChange={event=>setField("build",event.target.value)}/></label><label>Organism<input required value={form.organism} onChange={event=>setField("organism",event.target.value)} placeholder="e.g. human"/></label><label>Reference type<select value={form.type} onChange={event=>setField("type",event.target.value)}><option value="fasta">FASTA</option><option value="gtf">GTF</option><option value="index">Index bundle</option></select></label><label>Tags (comma separated)<input value={form.tags} onChange={event=>setField("tags",event.target.value)}/></label><label><input type="checkbox" checked={form.is_default} onChange={event=>setField("is_default",event.target.checked)}/> Set as default</label><button type="submit" disabled={state.busy||!form.file}>{state.busy?"Uploading…":"Validate and register"}</button></form></UtilityPanel></div>
  </main>;
}
