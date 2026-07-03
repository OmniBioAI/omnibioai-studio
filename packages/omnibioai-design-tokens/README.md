# @man4ish/design-tokens

Unified design token system for the [OmniBioAI](https://github.com/man4ish/omnibioai-studio) platform — 47 CSS custom properties covering colors, typography, spacing, border radius, and shadows. Single source of truth for all OmniBioAI frontend surfaces.

---

## Installation

This package is published to the GitHub Packages registry under `@man4ish`.

### 1. Authenticate with GitHub Packages

Add to `.npmrc` in your project root:

```
@man4ish:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Your token needs `read:packages` scope. Generate one at GitHub → Settings → Developer settings → Personal access tokens.

### 2. Install

```bash
npm install @man4ish/design-tokens
```

No peer dependencies. No build step required — the package ships the final files directly.

---

## Usage

The package ships three files. Use whichever fits your stack:

### CSS (recommended — React, plain HTML, any framework)

Import once at your app entry point:

```css
@import '@man4ish/design-tokens/tokens.css';
```

Or in your JS/TS entry:

```ts
import '@man4ish/design-tokens/tokens.css';
```

All 47 tokens are then available as CSS custom properties throughout your app:

```css
.my-component {
  background: var(--color-bg-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
  font-family: var(--font-sans);
}
```

### JS/ESM

```ts
import { tokens } from '@man4ish/design-tokens';

console.log(tokens.colorAccent);  // '#...'
```

### TypeScript

`tokens.ts` ships with the package and provides full type definitions — no separate `@types` package needed.

---

## Token reference

### Colors — backgrounds

| Token | Usage |
|---|---|
| `--color-bg` | Page/app background |
| `--color-bg-surface` | Card, panel, sidebar backgrounds |
| `--color-bg-surface2` | Nested surfaces, input backgrounds |
| `--color-bg-surface3` | Tertiary surfaces, hover states |
| `--color-bg-elevated` | Modals, dropdowns, tooltips |

### Colors — borders

| Token | Usage |
|---|---|
| `--color-border` | Default border |
| `--color-border-muted` | Subtle dividers |
| `--color-border-bright` | Focused / highlighted borders |

### Colors — text

| Token | Usage |
|---|---|
| `--color-text` | Primary body text |
| `--color-text-soft` | Slightly muted text |
| `--color-text-secondary` | Secondary labels |
| `--color-text-muted` | Captions, placeholders |
| `--color-text-dim` | Disabled, hint text |

### Colors — brand

| Token | Usage |
|---|---|
| `--color-accent` | Primary brand color — buttons, links, focus rings |
| `--color-blue` | Informational |
| `--color-blue-dim` | Muted blue fill |
| `--color-blue-surface` | Light blue background |
| `--color-blue-border` | Blue border |
| `--color-purple` | Secondary brand / AI features |
| `--color-purple-dim` | Muted purple fill |
| `--color-purple-surface` | Light purple background |
| `--color-purple-border` | Purple border |

### Colors — status

| Token | Usage |
|---|---|
| `--color-danger` | Errors, destructive actions |
| `--color-danger-dim` | Muted danger fill |
| `--color-danger-border` | Danger border |
| `--color-warning` | Warnings, in-progress states |
| `--color-warning-dim` | Muted warning fill |
| `--color-warning-border` | Warning border |
| `--color-success` | Success, completed runs |
| `--color-success-dim` | Muted success fill |
| `--color-success-border` | Success border |
| `--color-info` | Neutral informational |
| `--color-info-dim` | Muted info fill |
| `--color-info-border` | Info border |

### Shadows

| Token | Usage |
|---|---|
| `--shadow-sm` | Subtle elevation — badges, chips |
| `--shadow-card` | Cards, panels |
| `--shadow-header` | Fixed headers, nav bars |

### Typography

| Token | Usage |
|---|---|
| `--font-sans` | Primary UI font |
| `--font-mono` | Code, labels, IDs |
| `--font-size-xs` | 11px |
| `--font-size-sm` | 12px |
| `--font-size-base` | 14px |
| `--font-size-md` | 15px |
| `--font-size-lg` | 16px |
| `--font-size-xl` | 18px |
| `--font-size-2xl` | 22px |

### Border radius

| Token | Usage |
|---|---|
| `--radius-xs` | Tight corners — badges, tags |
| `--radius-sm` | Inputs, small buttons |
| `--radius` | Default — cards, buttons |
| `--radius-lg` | Large cards, modals |
| `--radius-xl` | Hero sections |
| `--radius-pill` | Pills, toggle switches |

### Layout

| Token | Usage |
|---|---|
| `--sidebar-w` | Fixed sidebar width |
| `--topbar-h` | Fixed top navigation height |
| `--scrollbar-w` | Custom scrollbar width |

---

## Repository layout

```
omnibioai-design-tokens/
├── tokens.css    ← CSS custom properties on :root — primary distribution format
├── tokens.js     ← ESM export of token values as JS object
├── tokens.ts     ← TypeScript definitions
├── package.json  ← published as @man4ish/design-tokens to GitHub Packages
└── .npmrc        ← scoped registry config
```

No build step, no `dist/` directory — the source files are the published files.

---

## Used by

| Package | How |
|---|---|
| [`@man4ish/ui`](https://github.com/man4ish/omnibioai-ui) | Required peer dep — all components reference these tokens |
| [`omnibioai-studio`](https://github.com/man4ish/omnibioai-studio) | Electron + React desktop app |
| `omnibioai-control-center` | CSS report uses design tokens for themed dashboard |

---

## Current version

Published as `@man4ish/design-tokens` to GitHub Packages.
47 CSS custom properties — colors, typography, spacing,
border radius, shadows, and layout.

All OmniBioAI frontend surfaces (Electron app, web UI,
ecosystem report) use these tokens as the single source of truth.

---

## Adding or updating tokens

All tokens are defined in `tokens.css` as CSS custom properties on `:root`. When adding a new token:

1. Add the CSS custom property to `tokens.css`
2. Add the corresponding JS export to `tokens.js`
3. Add the TypeScript type to `tokens.ts`
4. Bump the version in `package.json` (semver — patch for new tokens, minor for removals)
5. Republish to GitHub Packages

Never remove or rename an existing token without a major version bump — consumers depend on the exact property names.

---

## License

Apache 2.0
