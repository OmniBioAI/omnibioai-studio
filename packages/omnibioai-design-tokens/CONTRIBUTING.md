# Contributing to @man4ish/design-tokens

Thank you for your interest in contributing. This is the single source of truth for all OmniBioAI visual design values — changes here propagate to every package that consumes it.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Repository layout](#repository-layout)
- [Token structure](#token-structure)
- [Adding or changing a token](#adding-or-changing-a-token)
- [Publishing to GitHub Packages](#publishing-to-github-packages)
- [PR checklist](#pr-checklist)

---

## Code of conduct

Be respectful, constructive, and professional. Harassment or dismissive communication will not be tolerated. Assume good faith.

---

## Getting started

### Prerequisites

No build step. This package ships its source files directly — `tokens.css`, `tokens.js`, and `tokens.ts` are the published artefacts as listed in `package.json#files`.

```bash
git clone https://github.com/man4ish/omnibioai-design-tokens
cd omnibioai-design-tokens
# No npm install required — no dependencies
```

---

## Repository layout

```
omnibioai-design-tokens/
├── tokens.css   ← CSS custom properties on :root — consumed by browser stylesheets
├── tokens.js    ← ES module — export const tokens = {...}  — consumed by JS/TS
├── tokens.ts    ← TypeScript type declarations — provides OmniBioAITokens interface
├── README.md
├── .npmrc       ← routes @man4ish → GitHub Packages
└── package.json
```

There is intentionally no build tooling. The three files are edited directly.

---

## Token structure

Tokens are organised into seven groups, present in all three files:

| Group | CSS prefix | JS key | Description |
|---|---|---|---|
| Backgrounds | `--color-bg*` | `colors.bg*` | Dark surface hierarchy (`#0f1117` → elevated) |
| Borders | `--color-border*` | `colors.border*` | Translucent white borders at various opacities |
| Text | `--color-text*` | `colors.text*` | White → muted grey text scale |
| Brand | `--color-accent*`, `--color-blue*`, `--color-purple*` | `colors.accent*` | Brand green (`#00e5a0`), blue, purple |
| Status | `--color-danger*`, `--color-warning*`, `--color-success*`, `--color-info*` | `colors.danger*` | Semantic status colours + dim/border variants |
| Shadows | `--shadow-sm`, `--shadow-card`, `--shadow-header` | — | Box shadow presets (CSS only) |
| Typography | `--font-sans`, `--font-mono`, `--font-size-*` | `fonts.*`, `fontSize.*` | Inter (sans) + JetBrains Mono (mono) |
| Border radius | `--radius-*` | `radius.*` | xs=4px → pill=9999px |
| Layout | `--sidebar-w`, `--topbar-h`, `--scrollbar-w` | — | App shell dimensions (CSS only) |

### File format details

**`tokens.css`** — standard CSS custom properties on `:root`:

```css
:root {
  --color-accent: #00e5a0;
  --radius-sm: 6px;
  /* ... */
}
```

**`tokens.js`** — plain ES module, no imports:

```js
export const tokens = {
  colors: { accent: '#00e5a0', ... },
  radius: { sm: '6px', ... },
  fontSize: { base: '13px', ... },
  fonts: { sans: "'Inter', system-ui, ...", ... },
};
```

**`tokens.ts`** — TypeScript declaration file that types the `tokens` export:

```ts
export interface OmniBioAITokens {
  colors: Record<string, string>;
  radius: Record<string, string>;
  fontSize: Record<string, string>;
  fonts: Record<string, string>;
}
export declare const tokens: OmniBioAITokens;
```

---

## Adding or changing a token

Because there is no build step, every change must be made in **all three files** to keep them in sync.

### Adding a new token

**Example: adding `--color-teal` to the brand group.**

**1. `tokens.css`** — add the CSS custom property under the relevant group comment:

```css
:root {
  /* Brand */
  --color-accent: #00e5a0;
  /* ... */
  --color-teal: #14b8a6;   /* ← new */
}
```

**2. `tokens.js`** — add the corresponding key to the `colors` object:

```js
export const tokens = {
  colors: {
    accent: '#00e5a0',
    // ...
    teal: '#14b8a6',   // ← new
  },
  // ...
};
```

**3. `tokens.ts`** — the `OmniBioAITokens` interface uses `Record<string, string>` for each group, so no type change is needed for new keys in existing groups. If you add a new top-level group (e.g. `spacing`), add it to the interface:

```ts
export interface OmniBioAITokens {
  colors: Record<string, string>;
  radius: Record<string, string>;
  fontSize: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;  // ← new group
}
```

### Renaming or removing a token

Renaming or removing a token is a **breaking change** for all consumers (`@man4ish/ui`, `omnibioai-studio`, etc.). Before doing so:

1. Search all consumer repos for usages of the token name
2. Update consumers in the same PR or open issues in each repo
3. Bump the major version in `package.json`

### Modifying a token value

Changing a value (e.g. adjusting `--color-accent` from `#00e5a0` to a new hex) is non-breaking but visually impactful. Update all three files and include before/after screenshots in your PR description.

---

## Publishing to GitHub Packages

Publishing is manual:

```bash
npm publish
```

The `publishConfig` in `package.json` routes to `npm.pkg.github.com/@man4ish`. You need a GitHub token with `write:packages` scope configured in `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

**Always bump `version` in `package.json` before publishing.** GitHub Packages rejects re-publishing an existing version.

Version conventions:
- **Patch** (`1.0.x`): value tweaks with no API changes
- **Minor** (`1.x.0`): new tokens added (backwards compatible)
- **Major** (`x.0.0`): tokens renamed or removed (breaking)

After publishing a new version, open PRs in `omnibioai-ui` and `omnibioai-studio` to bump the dependency.

---

## PR checklist

- [ ] Change made in all three files: `tokens.css`, `tokens.js`, `tokens.ts`
- [ ] Values are consistent across all three files (same hex codes, same key names)
- [ ] New group added to `OmniBioAITokens` interface in `tokens.ts` if applicable
- [ ] If renaming/removing: consumer repos searched and issues opened
- [ ] `version` in `package.json` bumped appropriately (patch/minor/major)
- [ ] Before/after screenshots included in PR description for visual changes
- [ ] Links to the issue: `Closes #<issue-number>`

---

## Questions

Open a GitHub Discussion or tag `@man4ish` in the relevant issue.
