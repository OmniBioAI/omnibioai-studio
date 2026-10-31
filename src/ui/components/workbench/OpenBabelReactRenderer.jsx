import { useEffect, useMemo, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import "./OpenBabelReactRenderer.css";

const FORMATS = ["smiles", "canonical_smiles", "inchi", "inchikey", "sdf", "mol", "mol2", "pdb", "xyz", "cml", "fasta"];
const MODES = [
  ["convert_structure", "Convert", "⇄", "Translate between molecular formats."],
  ["validate_structure", "Validate", "✓", "Check whether a structure can be parsed."],
  ["normalize_structure", "Normalize", "✳", "Canonicalize or prepare a molecular representation."],
  ["calculate_descriptors", "Descriptors", "▦", "Calculate molecular properties."],
  ["generate_fingerprint", "Fingerprint", "▥", "Create a structure fingerprint."],
  ["generate_3d", "3D structure", "◇", "Generate computational 3D coordinates."],
  ["batch_convert", "Batch", "☷", "Convert a list of structures in one request."],
];
const API = "/plugins/openbabel/api";

function resultText(result) {
  if (typeof result.output === "string") return result.output;
  if (typeof result.normalized === "string") return result.normalized;
  if (result.descriptors) return JSON.stringify(result.descriptors, null, 2);
  if (result.results) return result.results.map(item => `${item.index + 1}. ${item.success ? item.output : (item.errors || []).join(", ")}`).join("\n");
  return JSON.stringify(result, null, 2);
}

export default function OpenBabelReactRenderer() {
  const [mode, setMode] = useState("convert_structure");
  const [structure, setStructure] = useState("CCO");
  const [inputFormat, setInputFormat] = useState("smiles");
  const [outputFormat, setOutputFormat] = useState("sdf");
  const [fingerprint, setFingerprint] = useState("FP2");
  const [operations, setOperations] = useState(["canonicalize"]);
  const [optimize, setOptimize] = useState(false);
  const [forcefield, setForcefield] = useState("mmff94");
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const selectedMode = useMemo(() => MODES.find(item => item[0] === mode), [mode]);

  useEffect(() => {
    let active = true;
    nativePluginRequest(`${API}/health/`).then(data => { if (active) setHealth(data); }).catch(() => { if (active) setHealth({ available: false }); });
    return () => { active = false; };
  }, []);

  async function runAction(event) {
    event.preventDefault();
    setBusy(true); setError(""); setResult(null);
    try {
      let data;
      if (mode === "file") {
        if (!file) throw new Error("Choose a structure file to convert.");
        const body = new FormData(); body.append("file", file); body.append("input_format", inputFormat); body.append("output_format", outputFormat);
        data = await nativePluginRequest(`${API}/convert-file/`, { method: "POST", body });
      } else {
        const payload = { structure, input_format: inputFormat };
        if (mode === "convert_structure") Object.assign(payload, { output_format: outputFormat });
        if (mode === "normalize_structure") Object.assign(payload, { output_format: outputFormat, operations });
        if (mode === "generate_fingerprint") payload.fingerprint_type = fingerprint;
        if (mode === "generate_3d") Object.assign(payload, { output_format: outputFormat, optimize, forcefield });
        if (mode === "batch_convert") Object.assign(payload, { structures: structure.split(/\r?\n/).map(value => value.trim()).filter(Boolean), output_format: outputFormat });
        const action = mode === "file" ? "convert_structure" : mode;
        data = await nativePluginRequest(`${API}/actions/${action}/`, { method: "POST", body: payload });
      }
      setResult(data);
    } catch (requestError) { setError(requestError.message || "Open Babel request failed."); }
    finally { setBusy(false); }
  }

  function toggleOperation(operation) {
    setOperations(current => current.includes(operation) ? current.filter(value => value !== operation) : [...current, operation]);
  }

  return <main className="openbabel" aria-label="Open Babel chemistry workbench">
    <header className="openbabel__hero">
      <div className="openbabel__brand"><span className="openbabel__mark" aria-hidden="true">⚗</span><div><p>CHEMISTRY WORKBENCH</p><h1>Open Babel</h1><span>Structure conversion, validation, and molecular analysis</span></div></div>
      <div className={`openbabel__health ${health?.available ? "is-ready" : health ? "is-down" : "is-checking"}`} role="status"><i />{health ? (health.available ? `Engine ready${health.version ? ` · ${health.version}` : ""}` : "Engine unavailable") : "Checking engine"}</div>
    </header>

    <nav className="openbabel__modes" aria-label="Chemistry operations">{MODES.map(([key, label, icon]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setResult(null); setError(""); }}><span aria-hidden="true">{icon}</span>{label}</button>)}<button type="button" aria-pressed={mode === "file"} onClick={() => { setMode("file"); setResult(null); setError(""); }}><span aria-hidden="true">⇧</span>File conversion</button></nav>

    <div className="openbabel__layout">
      <section className="openbabel__card openbabel__editor-card">
        <div className="openbabel__card-heading"><div><p className="openbabel__eyebrow">{mode === "file" ? "UPLOAD AND CONVERT" : "INPUT STRUCTURE"}</p><h2>{mode === "file" ? "Convert a structure file" : selectedMode?.[1]}</h2><span>{mode === "file" ? "File content is read as UTF-8; format is selected explicitly." : selectedMode?.[3]}</span></div><span className="openbabel__step">01 <i>/</i> 02</span></div>
        <form onSubmit={runAction} className="openbabel__form">
          {mode === "file" ? <label className="openbabel__upload"><input aria-label="Structure file" type="file" accept=".smi,.smiles,.sdf,.mol,.mol2,.pdb,.xyz,.inchi,.cml,.fa,.fasta,text/plain" onChange={event => setFile(event.target.files?.[0] || null)} /><span className="openbabel__upload-icon">↑</span><strong>{file?.name || "Choose a structure file"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB · format chosen below` : "SMILES, SDF, MOL, MOL2, PDB, XYZ, InChI, CML, FASTA"}</small></label> : <label className="openbabel__structure-label">{mode === "batch_convert" ? "Structures · one per line" : "Molecular structure"}<textarea aria-label={mode === "batch_convert" ? "Structures" : "Molecular structure"} value={structure} onChange={event => setStructure(event.target.value)} rows={mode === "batch_convert" ? 9 : 8} placeholder="Paste a SMILES, InChI, or structure text…" required /></label>}
          <div className="openbabel__format-row"><label>Input format<select value={inputFormat} onChange={event => setInputFormat(event.target.value)}>{FORMATS.filter(value => value !== "inchikey").map(value => <option key={value}>{value}</option>)}</select></label>{["convert_structure", "normalize_structure", "generate_3d", "batch_convert", "file"].includes(mode) && <label>Output format<select value={outputFormat} onChange={event => setOutputFormat(event.target.value)}>{FORMATS.map(value => <option key={value}>{value}</option>)}</select></label>}</div>
          {mode === "normalize_structure" && <fieldset className="openbabel__options"><legend>Preparation operations</legend>{[["canonicalize", "Canonicalize"], ["add_hydrogens", "Add hydrogens"], ["remove_hydrogens", "Remove hydrogens"], ["gen2d", "Generate 2D coordinates"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={operations.includes(value)} onChange={() => toggleOperation(value)} />{label}</label>)}</fieldset>}
          {mode === "generate_fingerprint" && <label className="openbabel__select-label">Fingerprint type<select value={fingerprint} onChange={event => setFingerprint(event.target.value)}>{["FP2", "FP3", "FP4", "MACCS"].map(value => <option key={value}>{value}</option>)}</select></label>}
          {mode === "generate_3d" && <div className="openbabel__3d-options"><label className="openbabel__check"><input type="checkbox" checked={optimize} onChange={event => setOptimize(event.target.checked)} />Optimize geometry</label>{optimize && <label>Force field<select value={forcefield} onChange={event => setForcefield(event.target.value)}>{["mmff94", "uff", "gaff", "ghemical"].map(value => <option key={value}>{value}</option>)}</select></label>}<p>Generated coordinates are computational—not experimentally validated.</p></div>}
          {error && <p role="alert" className="openbabel__error">{error}</p>}
          <div className="openbabel__actions"><span>Requests run through the authenticated Workbench API.</span><button type="submit" disabled={busy || (mode === "file" ? !file : !structure.trim())}>{busy ? <><i className="openbabel__spinner" /> Processing…</> : <>Run {mode === "file" ? "conversion" : selectedMode?.[1]} <span aria-hidden="true">→</span></>}</button></div>
        </form>
      </section>

      <section className="openbabel__card openbabel__result-card" aria-live="polite">
        <div className="openbabel__card-heading"><div><p className="openbabel__eyebrow">RESULTS</p><h2>{result ? "Operation complete" : "Your result will appear here"}</h2><span>{result ? `Processed by ${result.engine || "Open Babel"}` : "Run an operation to see its output and validation details."}</span></div><span className="openbabel__step">02 <i>/</i> 02</span></div>
        {!result ? <div className="openbabel__empty"><span aria-hidden="true">⌘</span><p>Ready for a molecule</p><small>Try the example <button type="button" onClick={() => { setMode("convert_structure"); setStructure("CCO"); setInputFormat("smiles"); setOutputFormat("sdf"); }}>ethanol · SMILES</button></small></div> : <div className="openbabel__result-content">
          {result.valid !== undefined && <div className={`openbabel__validation ${result.valid ? "valid" : "invalid"}`}><span>{result.valid ? "✓" : "!"}</span><div><strong>{result.valid ? "Valid structure" : "Structure could not be validated"}</strong><small>{result.format} · Open Babel parser</small></div></div>}
          {result.descriptors && <div className="openbabel__descriptor-grid">{Object.entries(result.descriptors).map(([key, value]) => <div key={key}><small>{key.replaceAll("_", " ")}</small><strong>{String(value)}</strong></div>)}</div>}
          <div className="openbabel__output-heading"><strong>{result.normalized ? "Normalized structure" : result.output ? "Converted structure" : result.descriptors ? "Descriptor data" : "Operation output"}</strong><button type="button" onClick={() => navigator.clipboard?.writeText(resultText(result))}>Copy output</button></div>
          <pre className="openbabel__output">{resultText(result)}</pre>
          {result.warnings?.length > 0 && <div className="openbabel__warnings"><strong>Warnings</strong><ul>{result.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></div>}
          {result.scientific_notice && <p className="openbabel__notice">{result.scientific_notice}</p>}
          {result.coordinate_source && <p className="openbabel__notice">Coordinates: computationally generated; experimental validation: no.</p>}
        </div>}
      </section>
    </div>
    <footer className="openbabel__footer"><span><strong>Open Babel</strong> · Chemistry interoperability</span><span>{health?.supported_formats?.length ? `${health.supported_formats.length} supported format aliases` : "Explicit format selection · bounded API"}</span></footer>
  </main>;
}
