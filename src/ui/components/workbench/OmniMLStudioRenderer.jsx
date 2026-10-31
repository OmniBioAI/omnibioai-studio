import React, { useEffect, useMemo, useState } from "react";
import { Panel, PanelBody, PanelHeader } from "../UI";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { safeErrorMessage } from "../../lib/safeErrorMessage";
import "./OmniMLStudioRenderer.css";

const MARKDOWN_TAGS = new Set([
  "a", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "img", "li", "ol", "p", "pre", "span", "strong", "table", "tbody", "td",
  "th", "thead", "tr", "ul",
]);

function safeUrl(raw, image = false) {
  if (typeof raw !== "string" || !raw || /[\u0000-\u0020]/.test(raw)) return "";
  if (raw.startsWith("#") || (!image && raw.startsWith("/") && !raw.startsWith("//"))) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    if (image && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(raw)) return raw;
  } catch { /* malformed link */ }
  return "";
}

function renderSanitizedNode(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
  if (node.nodeType !== Node.ELEMENT_NODE || !MARKDOWN_TAGS.has(node.tagName.toLowerCase())) return null;
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes, (child, index) => renderSanitizedNode(child, `${key}-${index}`));
  const className = (node.getAttribute("class") || "").replace(/[^a-zA-Z0-9_\s-]/g, "").trim();
  const id = (node.getAttribute("id") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const title = node.getAttribute("title") || undefined;
  const common = { key, ...(className ? { className } : {}), ...(id ? { id } : {}), ...(title ? { title } : {}) };

  if (tag === "a") {
    const href = safeUrl(node.getAttribute("href"));
    if (!href) return <span key={key}>{children}</span>;
    const external = /^https?:/i.test(href);
    return <a {...common} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>;
  }
  if (tag === "img") {
    const src = safeUrl(node.getAttribute("src"), true);
    return src ? <img {...common} src={src} alt={node.getAttribute("alt") || ""} loading="lazy" /> : null;
  }
  return React.createElement(tag, common, ...children);
}

function renderMarkdownFragment(source, keyPrefix) {
  if (typeof source !== "string" || !source.trim() || typeof window === "undefined" || !window.DOMParser) return null;
  const parsed = new window.DOMParser().parseFromString(source, "text/html");
  return Array.from(parsed.body.childNodes, (node, index) => renderSanitizedNode(node, `${keyPrefix}-${index}`));
}

function normalizeItems(payload) {
  if (!Array.isArray(payload?.items)) throw new Error("Tutorial index returned an invalid response.");
  return payload.items.filter(item => item && typeof item.id === "string" && typeof item.title === "string")
    .map(item => ({ id: item.id, title: item.title, summary: String(item.summary || ""), slug: String(item.slug || "") }));
}

export default function OmniMLStudioRenderer() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [document, setDocument] = useState(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [loadingDocument, setLoadingDocument] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    nativePluginRequest("/plugins/omniml_studio/api/index/", { signal: controller.signal })
      .then(payload => { if (!controller.signal.aborted) setItems(normalizeItems(payload)); })
      .catch(failure => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Could not load the tutorial catalog.")); })
      .finally(() => { if (!controller.signal.aborted) setLoadingIndex(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) { setDocument(null); return undefined; }
    const controller = new AbortController();
    setLoadingDocument(true); setDocument(null); setError("");
    const params = new URLSearchParams({ id: selectedId });
    nativePluginRequest(`/plugins/omniml_studio/api/doc/?${params.toString()}`, { signal: controller.signal })
      .then(payload => {
        if (!controller.signal.aborted) {
          if (payload?.ok !== true || typeof payload.html !== "string") throw new Error("Tutorial content is unavailable.");
          setDocument(payload);
        }
      })
      .catch(failure => { if (!controller.signal.aborted) setError(safeErrorMessage(failure, "Could not load this tutorial.")); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDocument(false); });
    return () => controller.abort();
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return items;
    return items.filter(item => `${item.title} ${item.slug} ${item.summary}`.toLocaleLowerCase().includes(needle));
  }, [items, query]);

  return <div className="omniml-studio-react">
    <header className="omniml-studio-intro">
      <div><span className="omniml-studio-eyebrow">Machine learning library</span><h2>OmniML Studio</h2>
        <p>Browse the ML tutorials, find a topic, and read the complete guide without leaving Studio.</p></div>
      <span className="omniml-studio-count" aria-live="polite">{loadingIndex ? "Loading tutorials…" : `${filteredItems.length} shown · ${items.length} total`}</span>
    </header>
    {error && <p className="omniml-studio-error" role="alert">{error}</p>}
    <div className="omniml-studio-layout">
      <Panel>
        <PanelHeader title="Tutorial library" />
        <PanelBody>
          <label className="omniml-studio-search">Search tutorials
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search title, topic, or summary" />
          </label>
          <div className="omniml-studio-list" aria-label="Tutorials" aria-busy={loadingIndex}>
            {loadingIndex && <p role="status">Loading tutorial index…</p>}
            {!loadingIndex && !filteredItems.length && <p className="omniml-studio-empty">{items.length ? "No tutorials match your search." : "No tutorials are available."}</p>}
            {filteredItems.map(item => <button key={item.id} type="button" className="omniml-studio-item"
              aria-current={selectedId === item.id ? "true" : undefined} onClick={() => setSelectedId(item.id)}>
              <strong>{item.title}</strong><span>{item.summary || "Open tutorial"}</span><small>{item.slug}</small>
            </button>)}
          </div>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title={document?.title || (loadingDocument ? "Loading tutorial…" : "Tutorial")}>
          {document?.slug ? <span className="omniml-studio-topic">{document.slug}</span> : null}
        </PanelHeader>
        <PanelBody>
          {!selectedId && <p className="omniml-studio-empty">Choose a tutorial from the library to read it here.</p>}
          {loadingDocument && <p role="status">Loading tutorial content…</p>}
          {document && !loadingDocument && <div className="omniml-studio-reading">
            {document.toc_html && <nav className="omniml-studio-toc" aria-label="Tutorial contents">{renderMarkdownFragment(document.toc_html, "toc")}</nav>}
            <article className="omniml-studio-markdown">{renderMarkdownFragment(document.html, "body")}</article>
          </div>}
        </PanelBody>
      </Panel>
    </div>
  </div>;
}
