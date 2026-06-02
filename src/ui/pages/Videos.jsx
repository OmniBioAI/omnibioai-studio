import React, { useState, useEffect, useRef } from "react";

const VIDEOS_JSON = "/_svc/videos/videos.json";
const VIDEOS_BASE = "/_svc/videos/videos/";

export default function Videos({ onBack }) {
  const [videos,  setVideos]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [active,  setActive]  = useState(null);

  useEffect(() => {
    fetch(VIDEOS_JSON)
      .then(r => {
        if (!r.ok) throw new Error(`No videos.json found (HTTP ${r.status})`);
        return r.json();
      })
      .then(d => setVideos(Array.isArray(d) ? d : (d.videos ?? [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!active) return;
    const h = e => { if (e.key === "Escape") setActive(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active]);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"var(--bg)" }}>
      <Toolbar onBack={onBack} count={!loading && !error ? videos.length : null} />

      <div style={{
        flex:1, overflowY:"auto", padding:20,
        scrollbarWidth:"thin", scrollbarColor:"var(--border2) transparent",
      }}>
        {loading && <Spinner />}
        {!loading && error   && <ErrorBanner msg={error} />}
        {!loading && !error  && videos.length === 0 && <Empty />}
        {!loading && !error  && videos.length > 0 && (
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",
            gap:16,
          }}>
            {videos.map((v, i) => (
              <VideoCard key={v.filename ?? i} video={v} onPlay={() => setActive(v)} />
            ))}
          </div>
        )}
      </div>

      {active && <PlayerModal video={active} onClose={() => setActive(null)} />}
    </div>
  );
}

/* ── Toolbar ─────────────────────────────────────────────── */
function Toolbar({ onBack, count }) {
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
        ← Back to Workbench
      </button>

      <span style={{ fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)", color:"var(--color-text-muted)" }}>
        Video Tutorials
      </span>

      {count !== null && (
        <span style={{
          fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)",
          padding:"2px 8px", borderRadius:"var(--radius-xs)",
          background:"rgba(0,229,160,0.08)", color:"var(--accent)",
          border:"1px solid rgba(0,229,160,0.15)",
        }}>
          {count} video{count !== 1 ? "s" : ""}
        </span>
      )}

      <span style={{
        marginLeft:"auto",
        fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)",
        color:"var(--border2)",
      }}>
        {VIDEOS_JSON}
      </span>
    </div>
  );
}

/* ── Spinner ─────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:60 }}>
      <div style={{
        width:28, height:28, borderRadius:"50%",
        border:"3px solid rgba(255,255,255,0.08)",
        borderTop:"3px solid var(--accent)",
        animation:"spin 1s linear infinite",
      }} />
      <div style={{ fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)", color:"var(--muted)" }}>
        Loading videos...
      </div>
      <style>{`@keyframes spin { 100% { transform:rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Error banner ────────────────────────────────────────── */
function ErrorBanner({ msg }) {
  return (
    <div style={{
      padding:32, borderRadius:"var(--radius-lg)", textAlign:"center",
      background:"rgba(255,71,87,0.06)", border:"1px solid rgba(255,71,87,0.15)",
    }}>
      <div style={{ fontSize:28, marginBottom:10 }}>⚠</div>
      <div style={{ fontSize:"var(--font-size-base)", fontWeight:600, color:"var(--danger)", marginBottom:6 }}>
        {msg}
      </div>
      <div style={{ fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)", color:"var(--muted)" }}>
        Add videos.json to VIDEO_DIR and ensure the videos service is running
      </div>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────── */
function Empty() {
  return (
    <div style={{ padding:60, textAlign:"center" }}>
      <div style={{ fontSize:36, marginBottom:12 }}>🎬</div>
      <div style={{ fontSize:"var(--font-size-sm)", fontFamily:"var(--mono)", color:"var(--muted)" }}>
        No videos found in videos.json
      </div>
    </div>
  );
}

/* ── Video card ──────────────────────────────────────────── */
function VideoCard({ video, onPlay }) {
  const { title, description, filename, tags = [] } = video;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Play ${title}`}
      onClick={onPlay}
      onKeyDown={e => e.key === "Enter" && onPlay()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:"var(--bg3)",
        border:`1px solid ${hovered ? "var(--border2)" : "var(--border)"}`,
        borderRadius:"var(--radius-lg)",
        overflow:"hidden", cursor:"pointer",
        transition:"border-color 0.15s, transform 0.15s, box-shadow 0.15s",
        transform: hovered ? "translateY(-2px)" : "none",
        boxShadow: hovered ? "0 8px 24px rgba(0,0,0,0.4)" : "none",
      }}
    >
      {/* Thumbnail strip */}
      <div style={{ position:"relative", aspectRatio:"16/9", background:"#000", overflow:"hidden" }}>
        <video
          src={`${VIDEOS_BASE}${filename}`}
          preload="metadata"
          muted
          style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
        />
        {/* Play overlay */}
        <div style={{
          position:"absolute", inset:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          background: hovered ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.55)",
          transition:"background 0.15s",
        }}>
          <div style={{
            width:48, height:48, borderRadius:"50%",
            background: hovered ? "var(--accent)" : "rgba(255,255,255,0.15)",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"background 0.15s",
            boxShadow: hovered ? "0 0 0 6px rgba(0,229,160,0.2)" : "none",
          }}>
            <span style={{ fontSize:18, marginLeft:4, color: hovered ? "#000" : "#fff" }}>▶</span>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ fontSize:"var(--font-size-base)", fontWeight:600, color:"var(--text)", lineHeight:1.35 }}>
          {title}
        </div>

        {description && (
          <div style={{
            fontSize:"var(--font-size-xs)", color:"var(--muted)", lineHeight:1.55,
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden",
          }}>
            {description}
          </div>
        )}

        {tags.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:2 }}>
            {tags.map(tag => (
              <span key={tag} style={{
                fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)",
                padding:"2px 7px", borderRadius:"var(--radius-xs)",
                background:"rgba(0,148,255,0.1)", color:"var(--accent2)",
                border:"1px solid rgba(0,148,255,0.2)",
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Player modal ────────────────────────────────────────── */
function PlayerModal({ video, onClose }) {
  const { title, description, filename, tags = [] } = video;
  const videoRef = useRef(null);

  useEffect(() => { videoRef.current?.focus(); }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position:"fixed", inset:0, zIndex:1000,
        background:"rgba(0,0,0,0.88)",
        backdropFilter:"blur(6px)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:"var(--bg2)",
          border:"1px solid var(--border2)",
          borderRadius:"var(--radius-xl)",
          overflow:"hidden",
          width:"100%", maxWidth:920,
          maxHeight:"90vh",
          display:"flex", flexDirection:"column",
        }}
      >
        {/* Modal header */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 16px", borderBottom:"1px solid var(--border)", flexShrink:0,
        }}>
          <span style={{ fontSize:"var(--font-size-base)", fontWeight:600, color:"var(--text)" }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              padding:"4px 12px", borderRadius:"var(--radius-sm)",
              background:"rgba(255,255,255,0.06)", border:"1px solid var(--border2)",
              color:"var(--muted)", cursor:"pointer",
              fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)",
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* Video player */}
        <video
          ref={videoRef}
          src={`${VIDEOS_BASE}${filename}`}
          controls
          autoPlay
          style={{ width:"100%", background:"#000", display:"block", flexShrink:0 }}
        />

        {/* Metadata footer */}
        {(description || tags.length > 0) && (
          <div style={{
            padding:"12px 16px", display:"flex", flexDirection:"column", gap:8,
            overflowY:"auto", flexShrink:0,
          }}>
            {description && (
              <p style={{ fontSize:"var(--font-size-sm)", color:"var(--muted)", lineHeight:1.65, margin:0 }}>
                {description}
              </p>
            )}
            {tags.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {tags.map(tag => (
                  <span key={tag} style={{
                    fontSize:"var(--font-size-xs)", fontFamily:"var(--mono)",
                    padding:"2px 8px", borderRadius:"var(--radius-xs)",
                    background:"rgba(0,148,255,0.1)", color:"var(--accent2)",
                    border:"1px solid rgba(0,148,255,0.2)",
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
