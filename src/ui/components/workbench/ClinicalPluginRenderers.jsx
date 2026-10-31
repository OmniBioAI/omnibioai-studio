import React, { useEffect, useState } from "react";
import { FormRow, Input, Panel, PanelBody, PanelHeader, Select, Textarea } from "../UI";
import { csrfToken, pluginEndpoint } from "../../lib/pluginApi";
import AsyncAnalysisRenderer from "./AsyncAnalysisRenderer";

const fieldStyle = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" };
const primary = { border: 0, borderRadius: 8, padding: "11px 16px", background: "var(--accent)", color: "#06251c", fontWeight: 700, cursor: "pointer" };
const muted = { color: "var(--color-text-muted)", lineHeight: 1.55 };

function ClinicalShell({ icon = "⚕️", title, summary, children }) {
  return <div className="native-plugin-page" style={{ display: "grid", gap: 16 }}>
    <Panel><PanelBody style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span aria-hidden="true" style={{ fontSize: 28 }}>{icon}</span><div><h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{title}</h2><p style={{ margin: 0, ...muted }}>{summary}</p></div>
    </PanelBody></Panel>{children}
  </div>;
}

function useApi(slug) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [result, setResult] = useState(null);
  async function request(path, { method = "GET", body, form } = {}) {
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(pluginEndpoint(`/plugins/${slug}/${path}`), {
        method, credentials: "same-origin", body: form || (body ? JSON.stringify(body) : undefined),
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { "X-CSRFToken": csrfToken() } : {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.detail || `Workbench request failed (${response.status}).`);
      setResult(payload); return payload;
    } catch (e) { setError(e.message || "Request failed."); return null; }
    finally { setBusy(false); }
  }
  return { busy, error, result, request, setResult };
}

function Result({ data }) { return data ? <Panel><PanelHeader title="Response"/><PanelBody><pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 460, overflow: "auto", color: "var(--text)", fontSize: 12 }}>{JSON.stringify(data, null, 2)}</pre></PanelBody></Panel> : null; }
function Feedback({ busy, error }) { return <>{error && <p role="alert" className="plugin-error">{error}</p>}{busy && <p role="status" style={muted}>Working…</p>}</>; }

function RunProgress({ slug, runId, statusPath }) {
  const [status, setStatus] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false; let timer;
    const poll = async () => {
      try {
        const path = `/plugins/${slug}/${statusPath.replace("{run_id}", encodeURIComponent(runId))}`;
        const response = await fetch(pluginEndpoint(path), { credentials: "same-origin", headers: { Accept: "application/json" } });
        const next = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(next.error || `Status request failed (${response.status}).`);
        if (cancelled) return;
        setStatus(next);
        if (["COMPLETE", "COMPLETED", "FAILED", "ERROR", "CANCELED", "CANCELLED"].includes(String(next.state || "").toUpperCase())) window.clearInterval(timer);
      } catch (e) { if (!cancelled) { setError(e.message); window.clearInterval(timer); } }
    };
    poll(); timer = window.setInterval(poll, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [slug, runId, statusPath]);
  return runId ? <Panel><PanelHeader title="Run progress"/><PanelBody><p role="status">Run <code>{runId}</code> · {status?.state || "QUEUED"}</p>{status?.detail && <p style={muted}>{status.detail}</p>}{error && <p role="alert" className="plugin-error">{error}</p>}</PanelBody></Panel> : null;
}

function TrialMatching() {
  const api = useApi("clinical_trial_matching"); const [patient, setPatient] = useState('{\n  "conditions": [],\n  "age": null,\n  "sex": "unknown",\n  "genetic_markers": []\n}'); const [limit, setLimit] = useState("10");
  async function submit(e) { e.preventDefault(); try { const parsed = JSON.parse(patient); await api.request("api/run/", { method: "POST", body: { operation: "match_trials", patient: parsed, max_results: Number(limit) } }); } catch { api.setResult(null); }
  }
  return <ClinicalShell icon="🧑‍⚕️" title="Clinical Trial Matching" summary="Rank trial candidates from de-identified patient features. Patient data is sent to the configured Workbench service; avoid names, dates of birth, contact details, or direct identifiers.">
    <Panel><PanelHeader title="Patient features"/><PanelBody><form onSubmit={submit}><FormRow label="De-identified feature profile (JSON)"><Textarea value={patient} rows={9} onChange={e => setPatient(e.target.value)} required /></FormRow><FormRow label="Maximum matches"><Input type="number" min="1" max="100" value={limit} onChange={e => setLimit(e.target.value)} /></FormRow><button style={primary} disabled={api.busy}>Find matching trials</button></form></PanelBody></Panel><Feedback busy={api.busy} error={api.error}/><Result data={api.result}/>
  </ClinicalShell>;
}

function GdcExplorer() {
  const api = useApi("gdc"); const [tab, setTab] = useState("projects"); const [query, setQuery] = useState(""); const [project, setProject] = useState("TCGA-BRCA");
  async function search(e) { e.preventDefault(); const q = new URLSearchParams(); if (query.trim()) q.set(tab === "cases" ? "submitter_id" : tab === "files" ? "data_type" : "name", query.trim()); if (tab === "files") q.set("access", "open"); await api.request(`${tab}/search/?${q.toString()}`); }
  const safeCall = path => api.request(path);
  return <ClinicalShell icon="🧬" title="Genomic Data Commons" summary="Explore public NCI GDC/TCGA metadata. Only open-access files can be downloaded; controlled-access data is not available through this connector.">
    <Panel><PanelHeader title="GDC explorer"/><PanelBody><div style={fieldStyle}><FormRow label="Data view"><Select value={tab} onChange={e => setTab(e.target.value)} options={["projects","cases","files"]}/></FormRow><FormRow label="Search term"><Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Project, case barcode, or file name"/></FormRow></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button style={primary} onClick={search} disabled={api.busy}>Search {tab}</button><button style={primary} onClick={() => safeCall("projects/tcga/")} disabled={api.busy}>Browse TCGA projects</button><FormRow label="Project summary"><Input value={project} onChange={e => setProject(e.target.value)} /></FormRow><button style={primary} onClick={() => safeCall(`projects/${encodeURIComponent(project)}/summary/`)} disabled={api.busy}>View summary</button></div></PanelBody></Panel><Feedback busy={api.busy} error={api.error}/><Result data={api.result}/>
  </ClinicalShell>;
}

function FhirHl7() {
  const api = useApi("fhir_hl7"); const [action, setAction] = useState("search_patients"); const [family, setFamily] = useState(""); const [birthdate, setBirthdate] = useState(""); const [hl7, setHl7] = useState("");
  const local = action === "validate_hl7_v2" || action === "parse_hl7_v2";
  async function submit(e) { e.preventDefault(); const body = { action }; if (local) body.message = hl7; else { if (family) body.family = family; if (birthdate) body.birthdate = birthdate; } await api.request("query/", { method: "POST", body }); }
  return <ClinicalShell icon="🏥" title="FHIR / HL7 Interoperability" summary="Search the configured FHIR R4 endpoint or validate/parse an HL7 v2 message locally. Responses can contain protected health information; use only with appropriate authorization and safeguards.">
    <Panel><PanelHeader title="FHIR action"/><PanelBody><form onSubmit={submit}><FormRow label="Operation"><Select value={action} onChange={e => setAction(e.target.value)} options={["search_patients","validate_hl7_v2","parse_hl7_v2"]}/></FormRow>{local ? <FormRow label="HL7 v2 message"><Textarea rows={8} value={hl7} onChange={e => setHl7(e.target.value)} required /></FormRow> : <div style={fieldStyle}><FormRow label="Patient family name"><Input value={family} onChange={e => setFamily(e.target.value)} /></FormRow><FormRow label="Birth date"><Input type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} /></FormRow></div>}<button style={primary} disabled={api.busy}>Run operation</button></form></PanelBody></Panel><Feedback busy={api.busy} error={api.error}/><Result data={api.result}/>
  </ClinicalShell>;
}

function Redcap() {
  const api = useApi("redcap"); const [url, setUrl] = useState(""); const [token, setToken] = useState(""); const [action, setAction] = useState("import_records"); const [records, setRecords] = useState("{}");
  async function test(e) { e.preventDefault(); await api.request("api/test/", { method: "POST", body: { url, token } }); }
  async function run(e) { e.preventDefault(); let payload = {}; try { payload = JSON.parse(records); } catch { api.setResult(null); return; } await api.request("api/run/", { method: "POST", body: { action, url, token, ...payload } }); }
  return <ClinicalShell icon="🔐" title="REDCap Connector" summary="Connect to an authorized REDCap API. The API token is kept only in this page's memory and is never saved in browser storage; clear it when finished. Follow your institution's data handling policy.">
    <Panel><PanelHeader title="Connection"/><PanelBody><form onSubmit={test}><div style={fieldStyle}><FormRow label="REDCap API URL"><Input type="url" value={url} onChange={e => setUrl(e.target.value)} required placeholder="https://redcap.example.org/api/"/></FormRow><FormRow label="API token"><Input type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} required /></FormRow></div><button style={primary} disabled={api.busy}>Test connection</button></form></PanelBody></Panel>
    <Panel><PanelHeader title="Data operation"/><PanelBody><form onSubmit={run}><FormRow label="Action"><Select value={action} onChange={e => setAction(e.target.value)} options={["import_records","export_results"]}/></FormRow><FormRow label="Operation options (JSON)"><Textarea rows={5} value={records} onChange={e => setRecords(e.target.value)} /></FormRow><button style={primary} disabled={api.busy || !token}>Start operation</button></form><p style={muted}>Never paste participant identifiers into support requests or screenshots.</p></PanelBody></Panel><Feedback busy={api.busy} error={api.error}/><RunProgress slug="redcap" runId={api.result?.run_id} statusPath="api/status/{run_id}/"/><Result data={api.result}/>
  </ClinicalShell>;
}

function ClinicalDbMapping() {
  const api = useApi("clinical_db_mapping"); const [objectId, setObjectId] = useState(""); const [file, setFile] = useState(null);
  async function submit(e) { e.preventDefault(); const form = new FormData(); if (file) form.append("upload", file); else form.append("pathogenicity_object_id", objectId.trim()); await api.request("api/run/create/", { method: "POST", form }); }
  return <ClinicalShell icon="🗺️" title="Clinical Database Mapping" summary="Map pathogenicity/variant evidence against supported clinical databases and return a traceable mapping table. Provide an OmniObject ID or upload a supported input file.">
    <Panel><PanelHeader title="Mapping input"/><PanelBody><form onSubmit={submit}><FormRow label="Pathogenicity OmniObject ID"><Input value={objectId} onChange={e => { setObjectId(e.target.value); setFile(null); }} placeholder="Use an existing object ID" /></FormRow><p style={{ ...muted, textAlign: "center" }}>or upload an input</p><FormRow label="Variant/scoring file"><Input type="file" onChange={e => { setFile(e.target.files?.[0] || null); if (e.target.files?.length) setObjectId(""); }} accept=".vcf,.tsv,.csv,.json,.txt" /></FormRow><button style={primary} disabled={api.busy || (!file && !objectId.trim())}>Start mapping</button></form></PanelBody></Panel><Feedback busy={api.busy} error={api.error}/><RunProgress slug="clinical_db_mapping" runId={api.result?.run_id} statusPath="api/run/{run_id}/status/"/><Result data={api.result}/>
  </ClinicalShell>;
}

function ClinicalReportGenerator({ descriptor }) {
  return <ClinicalShell icon="📋" title="Clinical Report Generator" summary="Build a research-use-only variant evidence report from upstream analysis artifacts. This report is not a diagnosis or a substitute for clinician review.">
    <Panel><PanelHeader title="Report workspace"/><PanelBody><p style={muted}>Select required upstream OmniObject artifacts in your workflow: ranked variants, pathogenicity scores, and clinical database mappings. Optional phenotype, literature, QC, and annotation evidence can be added as workflow inputs.</p><p style={muted}>The legacy page exposed registry-backed artifact selectors, but the JSON API currently exposes run/status/artifact routes only. The React page therefore keeps the documented workflow path available without submitting incomplete or fabricated object references.</p><AsyncAnalysisRenderer descriptor={descriptor}/></PanelBody></Panel>
  </ClinicalShell>;
}

function ClinicalReport() { return <ClinicalShell icon="📄" title="Clinical Report" summary="A report viewing and documentation entry point for clinical variant evidence."><Panel><PanelHeader title="About this module"/><PanelBody><p style={muted}>The historical page is an informational scaffold and does not create reports or expose a run API. Use Clinical Report Generator to assemble an evidence report from completed analysis artifacts.</p></PanelBody></Panel></ClinicalShell>; }
function SwimmerPlot({ descriptor }) { return <ClinicalShell icon="📈" title="Swimmer Plot" summary="Visualize patient-level treatment timelines, responses, and outcomes from a tidy clinical timeline table."><Panel><PanelHeader title="Timeline data and plot options"/><PanelBody><p style={muted}>Use one row per patient with start/end or duration and response/status fields. The plot is generated by the Workbench analysis runner.</p><AsyncAnalysisRenderer descriptor={descriptor}/></PanelBody></Panel></ClinicalShell>; }
function Phenopacket({ descriptor }) { return <ClinicalShell icon="🧬" title="Phenopacket" summary="Work with interoperable GA4GH Phenopackets describing phenotypes, diseases, biosamples, and individual-level clinical metadata."><Panel><PanelHeader title="Phenopacket workspace"/><PanelBody><p style={muted}>Submit a Phenopacket JSON document to validate and normalize its structure. Check the plugin's input contract before including any identifiable patient data.</p><AsyncAnalysisRenderer descriptor={descriptor}/></PanelBody></Panel></ClinicalShell>; }

export const CLINICAL_PLUGIN_RENDERERS = Object.freeze({
  clinical_report_generator: ClinicalReportGenerator,
  clinical_report: ClinicalReport,
  swimmer_plot: SwimmerPlot,
  clinical_db_mapping: ClinicalDbMapping,
  clinical_trial_matching: TrialMatching,
  gdc: GdcExplorer,
  phenopacket: Phenopacket,
  redcap: Redcap,
  fhir_hl7: FhirHl7,
});
