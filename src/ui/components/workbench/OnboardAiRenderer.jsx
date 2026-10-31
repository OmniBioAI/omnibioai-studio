import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { Panel, PanelBody, PanelHeader } from "../UI";
import "./OnboardAiRenderer.css";

const API = "/plugins/onboardai/api";

function messageFor(error, action) {
  if (error?.status === 403 && action === "rebuild the documentation index") return "Rebuilding the documentation index is restricted to staff accounts.";
  return error?.message || `Could not ${action}. Please try again.`;
}

function StudioDocLink({ item }) {
  if (item.group !== "plugins" || !item.slug || !/^[a-z0-9][a-z0-9_-]*$/.test(item.slug)) return null;
  return <a className="omni-btn omni-btn--primary omni-btn--sm" href={`/studio/plugins/${item.slug}`}>Open plugin</a>;
}

export default function OnboardAiRenderer() {
  const [items, setItems] = useState([]);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [indexError, setIndexError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [docError, setDocError] = useState("");
  const [question, setQuestion] = useState("");
  const [debug, setDebug] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [askError, setAskError] = useState("");
  const [asking, setAsking] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [notice, setNotice] = useState("");
  const documentRef = useRef(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(item => {
      if (group !== "all" && item.group !== group) return false;
      if (enabledOnly && item.group === "plugins" && item.enabled === false) return false;
      if (!needle) return true;
      return [item.title, item.slug, item.summary, item.relpath].some(value => String(value || "").toLowerCase().includes(needle));
    });
  }, [items, query, group, enabledOnly]);

  const loadIndex = useCallback(async () => {
    setLoadingIndex(true);
    setIndexError("");
    try {
      const result = await nativePluginRequest(`${API}/index/`);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      setIndexError(messageFor(error, "load the documentation catalog"));
    } finally {
      setLoadingIndex(false);
    }
  }, []);

  useEffect(() => { loadIndex(); }, [loadIndex]);

  useEffect(() => {
    if (!selected?.html || !documentRef.current) return;
    documentRef.current.querySelectorAll("a[href]").forEach(link => {
      if (/^https?:\/\//i.test(link.getAttribute("href") || "")) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    });
  }, [selected]);

  const openDocument = async item => {
    setSelected({ id: item.id, title: item.title, group: item.group, relpath: item.relpath, loading: true });
    setDocError("");
    try {
      const result = await nativePluginRequest(`${API}/doc/?id=${encodeURIComponent(item.id)}`);
      setSelected({ ...result, loading: false });
    } catch (error) {
      setSelected({ ...item, loading: false });
      setDocError(messageFor(error, "load this document"));
    }
  };

  const askDocs = async event => {
    event?.preventDefault();
    const prompt = question.trim();
    if (!prompt || asking) return;
    setAsking(true);
    setAskError("");
    setAnswer(null);
    try {
      const result = await nativePluginRequest(`${API}/ask/`, {
        method: "POST",
        body: { question: prompt, top_k: 8, debug },
      });
      setAnswer(result);
    } catch (error) {
      setAskError(messageFor(error, "search the documentation"));
    } finally {
      setAsking(false);
    }
  };

  const rebuildIndex = async () => {
    if (reindexing) return;
    setReindexing(true);
    setNotice("");
    setAskError("");
    try {
      const result = await nativePluginRequest(`${API}/reindex/`, { method: "POST", body: {} });
      setNotice(`Documentation index rebuilt${result.manifest?.count ? ` · ${result.manifest.count} chunks` : ""}.`);
    } catch (error) {
      setAskError(messageFor(error, "rebuild the documentation index"));
    } finally {
      setReindexing(false);
    }
  };

  const openSource = source => {
    const item = items.find(entry => entry.relpath === source.relpath);
    if (item) openDocument(item);
  };

  return <div className="onboardai-workspace">
    <header className="onboardai-hero">
      <div className="onboardai-brand"><span aria-hidden="true">📚</span><div>
        <p className="onboardai-kicker">OmniBioAI · knowledge navigator</p>
        <h1>OnboardAI</h1>
        <p>Browse Workbench plugin and project documentation, or ask a grounded question with source references.</p>
      </div></div>
      <div className="onboardai-hero-actions">
        <span className="onboardai-count">{loadingIndex ? "Loading catalog…" : `${items.length.toLocaleString()} documents`}</span>
        <button className="omni-btn omni-btn--secondary omni-btn--sm" type="button" onClick={rebuildIndex} disabled={reindexing}>
          {reindexing ? "Rebuilding…" : "Rebuild index"}
        </button>
        <a className="omni-btn omni-btn--secondary omni-btn--sm" href="/studio/plugins/catalog">Catalog</a>
        <a className="omni-btn omni-btn--secondary omni-btn--sm" href="/studio/plugins/plugin_manager">Plugin Manager</a>
      </div>
    </header>

    <Panel style={{ marginBottom: 16 }}>
      <PanelHeader title="Ask the documentation"><span className="onboardai-hint">Answers include source references</span></PanelHeader>
      <PanelBody>
        <form className="onboardai-ask-form" onSubmit={askDocs}>
          <textarea aria-label="Question for OnboardAI" value={question} onChange={event => setQuestion(event.target.value)}
            placeholder="Ask about a plugin, workflow, setup step, or project document…" rows={2} />
          <button className="omni-btn omni-btn--primary" type="submit" disabled={!question.trim() || asking}>{asking ? "Searching…" : "Ask OnboardAI"}</button>
        </form>
        <div className="onboardai-ask-options">
          <label><input type="checkbox" checked={debug} onChange={event => setDebug(event.target.checked)} /> Include retrieval diagnostics</label>
          <button className="onboardai-text-button" type="button" onClick={() => { setAnswer(null); setAskError(""); setNotice(""); }}>Clear answer</button>
        </div>
        {askError && <p className="onboardai-message onboardai-message--error" role="alert">{askError}</p>}
        {notice && <p className="onboardai-message" role="status">{notice}</p>}
        {answer && <section className="onboardai-answer" aria-label="OnboardAI answer">
          <div className="onboardai-answer-heading"><h2>Answer</h2><span>{answer.retrieval?.count ?? answer.sources?.length ?? 0} sources</span></div>
          <p className="onboardai-answer-text">{answer.answer}</p>
          {!!answer.sources?.length && <div className="onboardai-sources"><h3>Sources</h3><ol>{answer.sources.map((source, index) => <li key={`${source.sid || index}-${source.relpath}`}>
            <button type="button" onClick={() => openSource(source)}>{source.sid || `S${index + 1}`} · {source.title || source.relpath}</button>
            <span>{source.relpath}{source.heading ? ` · ${source.heading}` : ""}{Number.isFinite(source.score) ? ` · score ${source.score.toFixed(3)}` : ""}</span>
          </li>)}</ol></div>}
        </section>}
      </PanelBody>
    </Panel>

    <div className="onboardai-browser">
      <Panel>
        <PanelHeader title="Documentation catalog"><span className="onboardai-hint">{filtered.length} shown / {items.length} total</span></PanelHeader>
        <PanelBody>
          <div className="onboardai-filters">
            <input aria-label="Search documents" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, plugin, summary, or path…" />
            <select aria-label="Document group" value={group} onChange={event => setGroup(event.target.value)}>
              <option value="all">All documents</option><option value="plugins">Plugins</option><option value="docs">Project docs</option>
            </select>
            <label><input type="checkbox" checked={enabledOnly} onChange={event => setEnabledOnly(event.target.checked)} /> Enabled plugins only</label>
          </div>
          {indexError && <p className="onboardai-message onboardai-message--error" role="alert">{indexError}</p>}
          {loadingIndex ? <p className="onboardai-empty">Loading the documentation catalog…</p> :
            <div className="onboardai-doc-list" aria-label="Documentation results">
              {filtered.map(item => <button type="button" key={item.id} className={`onboardai-doc-item${selected?.id === item.id ? " is-selected" : ""}`} onClick={() => openDocument(item)}>
                <span className="onboardai-doc-item-title">{item.title}<span className="onboardai-badge">{item.group === "plugins" ? "plugin" : "doc"}</span>
                  {typeof item.enabled === "boolean" && <span className={`onboardai-badge ${item.enabled ? "is-enabled" : "is-disabled"}`}>{item.enabled ? "enabled" : "disabled"}</span>}
                </span>
                <span className="onboardai-doc-summary">{item.summary || item.relpath}</span>
              </button>)}
              {!filtered.length && <p className="onboardai-empty">No documents match these filters.</p>}
            </div>}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title={selected?.title || "Document viewer"}>
          {selected && !selected.loading && <StudioDocLink item={selected} />}
        </PanelHeader>
        <PanelBody>
          {selected && <p className="onboardai-doc-meta">{selected.group} · {selected.relpath}</p>}
          {docError && <p className="onboardai-message onboardai-message--error" role="alert">{docError}</p>}
          {!selected && <p className="onboardai-empty">Choose a result to read its documentation.</p>}
          {selected?.loading && <p className="onboardai-empty">Loading document…</p>}
          {selected?.toc_html && <nav className="onboardai-toc" aria-label="Document contents" dangerouslySetInnerHTML={{ __html: selected.toc_html }} />}
          {selected?.html && <article ref={documentRef} className="onboardai-markdown" dangerouslySetInnerHTML={{ __html: selected.html }} />}
        </PanelBody>
      </Panel>
    </div>
  </div>;
}
