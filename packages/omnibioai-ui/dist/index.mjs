import { useMemo as e, useState as t } from "react";
import { jsx as n, jsxs as r } from "react/jsx-runtime";
//#region src/components/Spinner/Spinner.tsx
function i({ size: e = "md", color: t }) {
	return /* @__PURE__ */ n("span", {
		className: `omni-spinner omni-spinner--${e}`,
		style: t ? { borderTopColor: t } : void 0
	});
}
//#endregion
//#region src/components/Button/Button.tsx
function a({ variant: e = "primary", size: t = "md", disabled: a, loading: o, onClick: s, children: c }) {
	return /* @__PURE__ */ r("button", {
		className: `omni-btn omni-btn--${e} omni-btn--${t}`,
		disabled: a || o,
		onClick: s,
		children: [o && /* @__PURE__ */ n(i, { size: "sm" }), c]
	});
}
//#endregion
//#region src/components/Badge/Badge.tsx
function o({ variant: e = "neutral", children: t }) {
	return /* @__PURE__ */ n("span", {
		className: `omni-badge omni-badge--${e === "neutral" ? "default" : e}`,
		children: t
	});
}
//#endregion
//#region src/components/Card/Card.tsx
function s({ children: e, title: t, actions: i, padding: a, elevated: o, onClick: s, className: c }) {
	return /* @__PURE__ */ r("div", {
		className: [
			"omni-card",
			o ? "omni-card--elevated" : "",
			s ? "omni-card--clickable" : "",
			c || ""
		].filter(Boolean).join(" "),
		style: a ? { padding: a } : void 0,
		onClick: s,
		children: [(t || i) && /* @__PURE__ */ r("div", {
			className: "omni-card__header",
			children: [t && /* @__PURE__ */ n("div", {
				className: "omni-card__title",
				children: t
			}), i && /* @__PURE__ */ n("div", {
				className: "omni-card__actions",
				children: i
			})]
		}), /* @__PURE__ */ n("div", {
			className: "omni-card__body",
			children: e
		})]
	});
}
//#endregion
//#region src/components/Input/Input.tsx
function c({ value: e, onChange: t, placeholder: i, label: a, error: o, disabled: s }) {
	return /* @__PURE__ */ r("div", {
		className: "omni-input-group",
		children: [
			a && /* @__PURE__ */ n("label", {
				className: "omni-input-label",
				children: a
			}),
			/* @__PURE__ */ n("input", {
				className: `omni-input${o ? " omni-input--error" : ""}`,
				value: e,
				onChange: t,
				placeholder: i,
				disabled: s
			}),
			o && /* @__PURE__ */ n("div", {
				className: "omni-input-error",
				children: o
			})
		]
	});
}
//#endregion
//#region src/components/StatusDot/StatusDot.tsx
var l = {
	running: "omni-status-dot--up omni-status-dot--pulse",
	success: "omni-status-dot--up",
	failed: "omni-status-dot--down",
	queued: "omni-status-dot--warn",
	idle: "omni-status-dot--init"
};
function u({ status: e, label: t }) {
	return /* @__PURE__ */ r("span", {
		className: "omni-status-dot-wrap",
		children: [/* @__PURE__ */ n("span", { className: `omni-status-dot ${l[e]}` }), t && /* @__PURE__ */ n("span", {
			className: "omni-status-dot-label",
			children: t
		})]
	});
}
//#endregion
//#region src/components/Table/Table.tsx
function d({ columns: i, data: a, pageSize: o = 10, emptyMessage: s = "No results" }) {
	let [c, l] = t(null), [u, d] = t(null), [f, p] = t(1), m = e(() => !c || !u ? a : [...a].sort((e, t) => {
		let n = e[c], r = t[c];
		if (n == null) return 1;
		if (r == null) return -1;
		let i = n < r ? -1 : +(n > r);
		return u === "asc" ? i : -i;
	}), [
		a,
		c,
		u
	]), h = Math.max(1, Math.ceil(m.length / o)), g = Math.min(f, h), _ = m.slice((g - 1) * o, g * o);
	function v(e) {
		e.sortable && (c === e.key ? (d((e) => e === "asc" ? "desc" : e === "desc" ? null : "asc"), u === "desc" && l(null)) : (l(e.key), d("asc")), p(1));
	}
	return /* @__PURE__ */ r("div", {
		className: "omni-table-wrap",
		children: [/* @__PURE__ */ r("table", {
			className: "omni-table",
			children: [/* @__PURE__ */ n("thead", { children: /* @__PURE__ */ n("tr", { children: i.map((e) => {
				let t = c === e.key;
				return /* @__PURE__ */ n("th", {
					className: [
						e.sortable ? "sortable" : "",
						e.align === "right" ? "r" : "",
						t && u === "asc" ? "sorted-asc" : "",
						t && u === "desc" ? "sorted-desc" : ""
					].filter(Boolean).join(" "),
					onClick: () => v(e),
					children: e.label
				}, String(e.key));
			}) }) }), /* @__PURE__ */ n("tbody", { children: _.length === 0 ? /* @__PURE__ */ n("tr", { children: /* @__PURE__ */ n("td", {
				colSpan: i.length,
				style: {
					textAlign: "center",
					color: "var(--color-text-muted)",
					padding: "24px"
				},
				children: s
			}) }) : _.map((e, t) => /* @__PURE__ */ n("tr", { children: i.map((t) => /* @__PURE__ */ n("td", {
				className: t.align === "right" ? "r" : "",
				children: t.render ? t.render(e[t.key], e) : String(e[t.key] ?? "—")
			}, String(t.key))) }, t)) })]
		}), h > 1 && /* @__PURE__ */ r("div", {
			className: "omni-table-footer",
			children: [
				/* @__PURE__ */ n("button", {
					className: "omni-pg-btn",
					disabled: g === 1,
					onClick: () => p((e) => e - 1),
					children: "←"
				}),
				Array.from({ length: h }, (e, t) => t + 1).filter((e) => e === 1 || e === h || Math.abs(e - g) <= 1).reduce((e, t, n, r) => (n > 0 && t - r[n - 1] > 1 && e.push("..."), e.push(t), e), []).map((e, t) => e === "..." ? /* @__PURE__ */ n("span", {
					className: "omni-pg-info",
					children: "…"
				}, `e${t}`) : /* @__PURE__ */ n("button", {
					className: `omni-pg-btn${g === e ? " active" : ""}`,
					onClick: () => p(e),
					children: e
				}, e)),
				/* @__PURE__ */ n("button", {
					className: "omni-pg-btn",
					disabled: g === h,
					onClick: () => p((e) => e + 1),
					children: "→"
				}),
				/* @__PURE__ */ r("span", {
					className: "omni-pg-info",
					style: { marginLeft: "auto" },
					children: [m.length, " items"]
				})
			]
		})]
	});
}
//#endregion
//#region src/components/Tabs/Tabs.tsx
function f({ tabs: e, defaultTab: i, onChange: a }) {
	let [o, s] = t(i ?? e[0]?.key ?? "");
	function c(e) {
		s(e), a?.(e);
	}
	let l = e.find((e) => e.key === o);
	return /* @__PURE__ */ r("div", {
		className: "omni-tabs",
		children: [/* @__PURE__ */ n("div", {
			className: "omni-tab-nav",
			children: e.map((e) => /* @__PURE__ */ n("button", {
				className: `omni-tab-btn${o === e.key ? " active" : ""}`,
				onClick: () => c(e.key),
				children: e.label
			}, e.key))
		}), /* @__PURE__ */ n("div", {
			className: "omni-tab-panel",
			children: l?.content
		})]
	});
}
//#endregion
//#region src/components/ProgressBar/ProgressBar.tsx
function p({ value: e, max: t = 100, size: i = "md", variant: a = "accent", showLabel: o = !0, label: s }) {
	let c = Math.min(100, Math.max(0, e / t * 100)), l = s ?? `${Math.round(c)}%`;
	return /* @__PURE__ */ r("div", {
		className: "omni-progress-wrap",
		children: [/* @__PURE__ */ n("div", {
			className: `omni-progress-track omni-progress-track--${i}`,
			children: /* @__PURE__ */ n("div", {
				className: `omni-progress-fill omni-progress-fill--${a}`,
				style: { width: `${c}%` }
			})
		}), o && /* @__PURE__ */ n("span", {
			className: "omni-progress-label",
			children: l
		})]
	});
}
//#endregion
//#region src/components/Tooltip/Tooltip.tsx
function m({ content: e, children: t }) {
	return /* @__PURE__ */ r("span", {
		className: "omni-tooltip-wrap",
		children: [t, /* @__PURE__ */ n("span", {
			className: "omni-tooltip-box",
			children: e
		})]
	});
}
//#endregion
//#region src/components/Select/Select.tsx
function h({ options: e, value: t, onChange: i, label: a, disabled: o, placeholder: s }) {
	return /* @__PURE__ */ r("div", {
		className: "omni-select-group",
		children: [a && /* @__PURE__ */ n("label", {
			className: "omni-select-label",
			children: a
		}), /* @__PURE__ */ r("select", {
			className: "omni-select",
			value: t,
			disabled: o,
			onChange: (e) => i(e.target.value),
			children: [s && /* @__PURE__ */ n("option", {
				value: "",
				disabled: !0,
				children: s
			}), e.map((e) => /* @__PURE__ */ n("option", {
				value: e.value,
				children: e.label
			}, e.value))]
		})]
	});
}
//#endregion
export { o as Badge, a as Button, s as Card, c as Input, p as ProgressBar, h as Select, i as Spinner, u as StatusDot, d as Table, f as Tabs, m as Tooltip };
