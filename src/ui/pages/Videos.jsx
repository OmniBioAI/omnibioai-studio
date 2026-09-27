import React from "react";

// The Video Tutorials library (search, autocomplete, categories, cards and the
// player) is the omnibioai-videos portal, built for Studio with
// `build_public.py --variant studio` and served by videos:8086 at this
// same-origin route. Studio supplies only its own navigation; it never loads
// the catalog itself, so the service's PUBLIC-only catalog is the single source
// of what can be listed or played here. Keep the trailing slash: the library's
// asset, catalog and media URLs are document-relative, and the router only
// strips the /_svc/videos prefix when a "/" follows it.
export const VIDEO_LIBRARY_URL = "/_svc/videos/";

export default function Videos({ onBack }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--bg)" }}>
      <Toolbar onBack={onBack} />
      <iframe
        src={VIDEO_LIBRARY_URL}
        title="OmniBioAI Video Tutorials"
        allow="fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer"
        style={{ flex:1, border:"none", width:"100%", height:"100%", background:"var(--bg)" }}
      />
    </div>
  );
}

/* ── Toolbar ─────────────────────────────────────────────── */
function Toolbar({ onBack }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      padding:"8px 16px", flexShrink:0,
      background:"var(--bg2)", borderBottom:"1px solid var(--border)",
    }}>
      <button
        onClick={onBack}
        style={{
          display:"flex", alignItems:"center", gap:6,
          padding:"5px 12px", borderRadius:"var(--radius-sm)",
          background:"rgba(0,229,160,0.08)", border:"1px solid rgba(0,229,160,0.2)",
          color:"var(--accent)", fontFamily:"var(--font)",
          fontSize:"var(--font-size-xs)", fontWeight:600, cursor:"pointer",
        }}
      >
        ← Back to Studio
      </button>

      <span style={{ fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
        Video Tutorials
      </span>
    </div>
  );
}
