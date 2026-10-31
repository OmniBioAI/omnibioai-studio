import React, { useRef, useEffect, useState } from "react";
import { isElectron } from "../lib/session";
import { useAppearance } from "../components/AppearanceProvider";
import { buildEmbeddedUrl, createThemeSetMessage, EMBED_READY_EVENT, getExactOrigin } from "../lib/embedAppearance";
import { getStandaloneOnlyApp, standaloneAppUrl } from "../lib/standaloneApps";
import "./ServiceViewer.css";

export default function ServiceViewer({ url, label, onBack, backLabel = "Back to Studio", hideHeader = false }) {
  const webviewRef = useRef(null);
  const iframeRef = useRef(null);
  const readyRef = useRef(false);
  const [iframeReady, setIframeReady] = useState(false);
  const [webviewReady, setWebviewReady] = useState(false);
  const electron = isElectron();
  const standaloneApp = getStandaloneOnlyApp(url);
  const mobileFullScreen = label === "Workflows" || /Lit AI/i.test(label || "");
  const appearance = useAppearance();
  const themeMessage = createThemeSetMessage({
    theme: appearance.resolvedTheme,
    accent: appearance.accent,
    density: appearance.density,
    motion: appearance.resolvedMotion,
  });
  const initialLocation = useRef({ url: null, src: null });
  if (initialLocation.current.url !== url) {
    initialLocation.current = { url, src: buildEmbeddedUrl(url, themeMessage) };
    readyRef.current = false;
  }
  const embeddedUrl = initialLocation.current.src;

  useEffect(() => {
    readyRef.current = false;
    setIframeReady(false);
    setWebviewReady(false);
  }, [embeddedUrl]);

  const sendIframeTheme = () => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow || !readyRef.current) return;
    const origin = getExactOrigin(embeddedUrl);
    frame.contentWindow.postMessage(themeMessage, origin);
  };

  useEffect(() => {
    const onMessage = (event) => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow || event.origin !== getExactOrigin(embeddedUrl)) return;
      if (event.source !== frame.contentWindow) return;
      if (!event.data || typeof event.data !== "object" || event.data.type !== EMBED_READY_EVENT) return;
      if (Object.keys(event.data).length !== 1 || !Object.hasOwn(event.data, "type")) return;
      readyRef.current = true;
      setIframeReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embeddedUrl]);

  useEffect(() => {
    if (iframeReady) sendIframeTheme();
  }, [iframeReady, themeMessage.theme, themeMessage.accent, themeMessage.density, themeMessage.motion]);

  const sendWebviewTheme = () => {
    const webview = webviewRef.current;
    if (!webview || typeof webview.executeJavaScript !== "function") return;
    const origin = getExactOrigin(embeddedUrl);
    const payload = JSON.stringify(themeMessage);
    Promise.resolve(webview.executeJavaScript(`window.postMessage(${payload}, ${JSON.stringify(origin)})`)).catch(() => {});
  };

  useEffect(() => {
    if (webviewReady) sendWebviewTheme();
  }, [webviewReady, themeMessage.theme, themeMessage.accent, themeMessage.density, themeMessage.motion]);

  useEffect(() => {
    if (!electron) return;
    const wv = webviewRef.current;
    if (!wv) return;
    const handler = (e) => {
      if (e.channel === 'open-external' && e.args?.[0]) {
        window.electronAPI.openExternal(e.args[0]);
      }
    };
    wv.addEventListener('ipc-message', handler);
    const themeHandler = () => setWebviewReady(true);
    wv.addEventListener('dom-ready', themeHandler);
    return () => {
      wv.removeEventListener('ipc-message', handler);
      wv.removeEventListener('dom-ready', themeHandler);
    };
  }, [electron, embeddedUrl, themeMessage.theme, themeMessage.accent, themeMessage.density, themeMessage.motion]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {!hideHeader && <div style={{
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        padding: "8px 16px",
        background: "var(--bg2)", borderBottom: "1px solid var(--border)",
      }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            minHeight: 44, padding: "8px 12px", borderRadius: "var(--radius-sm)",
            background: "var(--color-accent-surface)", border: "1px solid var(--color-accent-border)",
            color: "var(--accent)", fontFamily: "var(--font)", fontSize: "var(--font-size-xs)",
            fontWeight: 600, cursor: "pointer",
          }}
        >
          ← {backLabel}
        </button>
        <span className="service-viewer-label" style={{
          fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
          color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        <span className="service-viewer-url" style={{
          marginLeft: "auto",
          fontSize: "var(--font-size-xs)", fontFamily: "var(--mono)",
          color: "var(--border2)", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {url}
        </span>
        {mobileFullScreen && <a className="service-viewer-fullscreen" href={embeddedUrl} target="_blank" rel="noopener noreferrer">
          Open full screen
        </a>}
      </div>}
      {standaloneApp ? (
        <div role="status" style={{ margin: "auto", maxWidth: 620, padding: 24, textAlign: "center" }}>
          <p>{standaloneApp.label} runs as a standalone app and cannot be embedded in Studio.</p>
          <a
            href={standaloneAppUrl(url, appearance.resolvedTheme)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${standaloneApp.label} in a new tab`}
            style={{
              display: "inline-flex", alignItems: "center", minHeight: 44, padding: "8px 14px",
              borderRadius: "var(--radius-sm)", background: "var(--accent)", color: "var(--bg)",
              fontWeight: 600, textDecoration: "none",
            }}
          >
            Open {standaloneApp.label} in a new tab
          </a>
        </div>
      ) : electron ? (
        <webview
          ref={webviewRef}
          src={embeddedUrl}
          nodeintegration="true"
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
      ) : (
        // <webview> is a Chromium/Electron-only element — in a real browser
        // tab (web build) it isn't a recognized custom element and renders
        // nothing, which is why service pages appeared blank there.
        <iframe
          ref={iframeRef}
          src={embeddedUrl}
          title={label || url}
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
