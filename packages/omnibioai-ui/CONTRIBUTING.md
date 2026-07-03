# Contributing to @man4ish/ui

Thank you for your interest in contributing. This guide reflects the actual structure of the component library — read it before writing any code.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Repository layout](#repository-layout)
- [Component anatomy](#component-anatomy)
- [Adding a new component](#adding-a-new-component)
- [Dev workflow](#dev-workflow)
- [Publishing to GitHub Packages](#publishing-to-github-packages)
- [Code quality](#code-quality)
- [PR checklist](#pr-checklist)

---

## Code of conduct

Be respectful, constructive, and professional. Harassment or dismissive communication will not be tolerated. Assume good faith.

---

## Getting started

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |

### Install

```bash
git clone https://github.com/man4ish/omnibioai-ui
cd omnibioai-ui
npm install
```

The library depends on `@man4ish/design-tokens` (also from GitHub Packages). Authenticate first:

```bash
# ~/.npmrc  (user-level, never committed)
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

The `.npmrc` at the repo root routes `@man4ish` scoped packages to `npm.pkg.github.com` automatically after you set the token.

### Build

```bash
npm run build          # one-shot build → dist/
npm run dev            # watch mode — rebuilds on every save
```

Vite builds two formats: `dist/index.js` (ESM) and `dist/index.cjs` (CommonJS), plus `dist/index.d.ts` type declarations. These are the files listed in `package.json#files`.

---

## Repository layout

```
omnibioai-ui/
├── src/
│   ├── index.ts                    ← barrel export — all public components
│   ├── styles/
│   │   └── base.css                ← (optional) global resets or shared styles
│   └── components/
│       ├── Badge/
│       │   ├── Badge.tsx
│       │   └── Badge.css
│       ├── Button/
│       │   ├── Button.tsx
│       │   └── Button.css
│       ├── Card/
│       │   ├── Card.tsx
│       │   └── Card.css
│       ├── Input/
│       │   ├── Input.tsx
│       │   └── Input.css
│       ├── Spinner/
│       │   ├── Spinner.tsx
│       │   └── Spinner.css
│       └── StatusDot/
│           ├── StatusDot.tsx
│           └── StatusDot.css
├── vite.config.ts                  ← lib mode: entry=src/index.ts, external=[react,react-dom]
├── tsconfig.json
└── .npmrc                          ← routes @man4ish → GitHub Packages
```

---

## Component anatomy

Every component in this library follows the same structure:

**`src/components/<Name>/<Name>.tsx`** — the component implementation:

```tsx
import React from 'react';
import './<Name>.css';

interface <Name>Props {
  // props typed here — no `any`
}

export function <Name>({ ...props }: <Name>Props) {
  return (
    // JSX using BEM-style class names: omni-<name>--<variant>
  );
}
```

**`src/components/<Name>/<Name>.css`** — scoped styles using CSS custom properties from `@man4ish/design-tokens`:

```css
.omni-<name> {
  color: var(--color-text);
  background: var(--color-bg-surface);
  border-radius: var(--radius);
  /* ... */
}
```

**`src/index.ts`** — re-export the component:

```ts
export { <Name> } from './components/<Name>/<Name>';
```

### Existing components and their CSS class prefixes

| Component | CSS prefix | Props |
|---|---|---|
| `Button` | `omni-btn` | `variant` (primary/secondary/danger/ghost), `size` (sm/md/lg), `disabled`, `onClick` |
| `Badge` | `omni-badge` | (see Badge.tsx) |
| `Card` | `omni-card` | (see Card.tsx) |
| `Input` | `omni-input` | (see Input.tsx) |
| `Spinner` | `omni-spinner` | (see Spinner.tsx) |
| `StatusDot` | `omni-status-dot` | (see StatusDot.tsx) |

All class variants follow the pattern `omni-<name>--<modifier>` to avoid collisions with consumer stylesheets.

---

## Adding a new component

### 1. Create the directory and files

```bash
NAME=MyComponent
mkdir src/components/$NAME
touch src/components/$NAME/$NAME.tsx
touch src/components/$NAME/$NAME.css
```

### 2. Write the component

```tsx
// src/components/MyComponent/MyComponent.tsx
import React from 'react';
import './MyComponent.css';

interface MyComponentProps {
  variant?: 'default' | 'highlight';
  children: React.ReactNode;
}

export function MyComponent({ variant = 'default', children }: MyComponentProps) {
  return (
    <div className={`omni-mycomponent omni-mycomponent--${variant}`}>
      {children}
    </div>
  );
}
```

### 3. Write the CSS using design tokens

```css
/* src/components/MyComponent/MyComponent.css */
.omni-mycomponent {
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  color: var(--color-text);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 8px 12px;
}

.omni-mycomponent--highlight {
  border-color: var(--color-accent-border);
  background: var(--color-accent-surface);
}
```

See `omnibioai-design-tokens/tokens.css` for the full list of available CSS custom properties (`--color-*`, `--radius-*`, `--font-*`, `--shadow-*`).

### 4. Export from the barrel

Add one line to `src/index.ts`:

```ts
export { MyComponent } from './components/MyComponent/MyComponent';
```

### 5. Build and verify

```bash
npm run build
# Check dist/ — dist/index.js, dist/index.cjs, dist/index.d.ts should all be updated
```

---

## Dev workflow

### Watch mode

```bash
npm run dev
```

Runs `vite build --watch` — rebuilds `dist/` on every file save. To test the component in a consuming app (e.g. `omnibioai-studio`), link the package locally:

```bash
# In omnibioai-ui:
npm link

# In omnibioai-studio:
npm link @man4ish/ui
```

### TypeScript

Run the TypeScript compiler without emitting to check types:

```bash
npx tsc --noEmit
```

The `vite.config.ts` build target externalises `react` and `react-dom` — they are peer dependencies and must not be bundled.

---

## Publishing to GitHub Packages

Publishing is done from CI or manually:

```bash
npm run build
npm publish
```

The `publishConfig` in `package.json` routes publication to `npm.pkg.github.com` under `@man4ish`. You need a token with `write:packages` scope. Bump `version` in `package.json` before publishing — GitHub Packages does not allow re-publishing the same version.

Version conventions: `MAJOR.MINOR.PATCH` — patch for fixes, minor for new components, major for breaking prop API changes.

---

## Code quality

- **TypeScript:** strict types on all props — no `any`, no implicit `any`. Every exported component must have a named `interface <Name>Props`.
- **CSS:** use design tokens (`var(--color-*)`, `var(--radius-*)`, etc.) for all colours, spacing, and typography — never hardcode hex values or pixel sizes for theming values.
- **Class naming:** BEM-style with `omni-` prefix — `omni-<component>`, `omni-<component>--<modifier>`, `omni-<component>__<element>`.
- **React:** functional components only; hooks are fine; no class components.
- **Exports:** every public component must be re-exported from `src/index.ts` — never import from deep paths.
- **Peer deps:** `react` and `react-dom` are peer dependencies — never import them as direct dependencies.

---

## PR checklist

- [ ] New component created under `src/components/<Name>/` with both `.tsx` and `.css` files
- [ ] CSS uses design tokens (`var(--color-*)`, `var(--radius-*)`) — no hardcoded theme values
- [ ] Component exported from `src/index.ts`
- [ ] TypeScript compiles cleanly: `npx tsc --noEmit`
- [ ] `npm run build` completes without errors
- [ ] Class names follow `omni-<name>--<modifier>` convention
- [ ] `react` and `react-dom` are not imported as direct dependencies
- [ ] Links to the issue: `Closes #<issue-number>`

---

## Questions

Open a GitHub Discussion or tag `@man4ish` in the relevant issue.
