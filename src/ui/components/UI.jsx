import React from "react";

export function Panel({ children, style }) {
  return (
    <div style={{
      background: "var(--bg3)",
      border: "1px solid var(--border)",
      borderRadius: 'var(--radius-lg)',
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, icon, iconColor, children }) {
  const iconBg = { teal: "rgba(0,229,160,0.15)", blue: "rgba(0,148,255,0.15)", orange: "rgba(255,107,53,0.15)" };
  const iconFg = { teal: "var(--accent)", blue: "var(--accent2)", orange: "var(--accent3)" };
  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 'var(--font-size-xs)', fontWeight: 500, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--text)",
      }}>
        {icon && (
          <span style={{
            width: 14, height: 14, borderRadius: 3,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 8,
            background: iconBg[iconColor] || iconBg.teal,
            color: iconFg[iconColor] || iconFg.teal,
          }}>◈</span>
        )}
        {title}
      </div>
      {children}
    </div>
  );
}

export function PanelBody({ children, style }) {
  return (
    <div style={{ padding: "14px 16px", ...style }}>
      {children}
    </div>
  );
}

export function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        fontSize: 'var(--font-size-xs)', fontFamily: "var(--mono)", color: "var(--color-text-muted)",
        letterSpacing: "0.08em", textTransform: "uppercase",
        marginBottom: 6, display: "block",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function Input({ type = "text", placeholder, value, onChange }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,160,0.4)")}
      onBlur={(e)  => (e.target.style.borderColor = "var(--border2)")}
      style={{
        width: "100%",
        background: "var(--bg2)",
        border: "1px solid var(--border2)",
        borderRadius: 'var(--radius-sm)',
        padding: "7px 10px",
        fontSize: 'var(--font-size-sm)',
        fontFamily: "var(--mono)",
        color: "var(--text)",
        outline: "none",
      }}
    />
  );
}

export function Textarea({ placeholder, value, onChange, rows = 4 }) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows}
      onFocus={(e) => (e.target.style.borderColor = "rgba(0,229,160,0.4)")}
      onBlur={(e)  => (e.target.style.borderColor = "var(--border2)")}
      style={{
        width: "100%",
        background: "var(--bg2)",
        border: "1px solid var(--border2)",
        borderRadius: 'var(--radius-sm)',
        padding: "7px 10px",
        fontSize: 'var(--font-size-xs)',
        fontFamily: "var(--mono)",
        color: "var(--text)",
        outline: "none",
        resize: "vertical",
        boxSizing: "border-box",
      }}
    />
  );
}

export function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        width: "100%",
        background: "var(--bg2)",
        border: "1px solid var(--border2)",
        borderRadius: 'var(--radius-sm)',
        padding: "7px 10px",
        fontSize: 'var(--font-size-sm)',
        fontFamily: "var(--mono)",
        color: "var(--text)",
        outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={o.value || o} value={o.value || o} style={{ background: "var(--bg2)" }}>
          {o.label || o}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`toggle ${value ? "on" : "off"}`}
    />
  );
}

export function ToggleRow({ label, sub, value, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 'var(--font-size-sm)', color: "var(--text)" }}>
        {label}
        {sub && (
          <span style={{
            fontSize: 'var(--font-size-xs)', fontFamily: "var(--mono)",
            color: "var(--color-text-muted)", display: "block", marginTop: 1,
          }}>
            {sub}
          </span>
        )}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

export function HealthCard({ label, status, port }) {
  const colorMap = { up: "var(--accent)", warn: "var(--warn)", down: "var(--danger)" };
  const labelMap = { up: "● UP", warn: "◐ INIT", down: "✕ DOWN" };
  const color = colorMap[status];
  return (
    <div style={{
      background: "var(--bg3)",
      border: "1px solid var(--border)",
      borderRadius: 'var(--radius)',
      padding: "10px 12px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2, background: color,
      }} />
      <div style={{
        fontSize: 'var(--font-size-xs)', fontFamily: "var(--mono)", color: "var(--color-text-muted)",
        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 500, fontFamily: "var(--mono)", color }}>
        {labelMap[status]}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: "var(--color-text-muted)", fontFamily: "var(--mono)", marginTop: 2 }}>
        {port}
      </div>
    </div>
  );
}

export function Btn({ children, variant = "ghost", onClick, disabled, style }) {
  const variants = {
    ghost:   { background: "transparent", border: "1px solid var(--border2)", color: "var(--color-text-muted)" },
    primary: { background: "var(--accent)", border: "none", color: "#000" },
    danger:  { background: "rgba(255,71,87,0.12)", border: "1px solid rgba(255,71,87,0.25)", color: "var(--danger)" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 16px", borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)',
        fontFamily: "var(--font)", fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s", letterSpacing: "0.02em",
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}
