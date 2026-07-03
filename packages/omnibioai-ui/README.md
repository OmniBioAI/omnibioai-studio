# @man4ish/ui

Shared React component library for the [OmniBioAI](https://github.com/man4ish/omnibioai-studio) platform. Provides `Button`, `Badge`, `Card`, `Input`, `StatusDot`, `Spinner`, `Table`, `Tabs`, `ProgressBar`, `Tooltip`, and `Select` components built on unified design tokens with zero hardcoded colors.

---

## Overview

- **TypeScript-first** — full type definitions shipped with the package
- **Design-token driven** — all colors, spacing, and radii come from `@man4ish/design-tokens`; no hardcoded hex values anywhere in the library
- **Tree-shakeable** — built as ES module + CJS with Vite library mode; only import what you use
- **React 18+ peer dep** — works with any React 18+ project including the OmniBioAI Electron app and any downstream consumer
- **Fully tested** — 50+ unit tests with Vitest + React Testing Library
- **Storybook catalogue** — visual stories for every component and variant
- **Type-safe exports** — full `.d.ts` declarations via vite-plugin-dts
- **CI token lint** — GitHub Actions workflow blocks hardcoded hex values in CSS and TSX on every push and pull request

---

## Installation

This package is published to the GitHub Packages registry under `@man4ish`.

### 1. Authenticate with GitHub Packages

Create or update `.npmrc` in your project root:

```
@man4ish:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Your token needs `read:packages` scope. Generate one at GitHub → Settings → Developer settings → Personal access tokens.

### 2. Install the package

```bash
npm install @man4ish/ui @man4ish/design-tokens
```

`@man4ish/design-tokens` is a required peer — it provides the CSS custom properties that all components reference.

### 3. Load design tokens

In your app entry point, import the token stylesheet once:

```ts
import '@man4ish/design-tokens/dist/tokens.css';
```

All components will pick up the correct colors, spacing, and radii automatically from there.

---

## Components

### `Button`

```tsx
import { Button } from '@man4ish/ui';

<Button variant="primary" onClick={handleRun}>
  Run analysis
</Button>

<Button variant="secondary" size="sm" disabled>
  Cancel
</Button>

<Button variant="danger" loading>
  Deleting...
</Button>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `loading` | `boolean` | `false` | Shows spinner, disables interaction |
| `disabled` | `boolean` | `false` | Disables button |
| `onClick` | `() => void` | — | Click handler |

> **Note:** When `loading` is `true`, a `Spinner` is shown and the button is automatically disabled.

---

### `Badge`

```tsx
import { Badge } from '@man4ish/ui';

<Badge variant="success">Running</Badge>
<Badge variant="warning">Queued</Badge>
<Badge variant="danger">Failed</Badge>
<Badge variant="info">v1.0.0</Badge>
<Badge variant="neutral">Draft</Badge>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'success' \| 'warning' \| 'danger' \| 'info' \| 'neutral' \| 'default'` | `'neutral'` | Semantic color |

> **Note:** `'default'` is a legacy alias for `'neutral'` and maps to the same visual style.

---

### `Card`

```tsx
import { Card } from '@man4ish/ui';

<Card>
  <h3>Plugin output</h3>
  <p>Run completed in 4.2s</p>
</Card>

<Card elevated onClick={handleClick}>
  Clickable card
</Card>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `elevated` | `boolean` | `false` | Adds shadow for visual prominence |
| `onClick` | `() => void` | — | Makes card interactive |
| `className` | `string` | — | Additional CSS classes |

---

### `Input`

```tsx
import { Input } from '@man4ish/ui';

<Input
  label="Sample ID"
  placeholder="Enter sample identifier"
  value={sampleId}
  onChange={e => setSampleId(e.target.value)}
/>

<Input
  label="VCF path"
  error="File not found"
  value={vcfPath}
  onChange={e => setVcfPath(e.target.value)}
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | — | Label above the input |
| `error` | `string` | — | Error message below; turns border red |
| `placeholder` | `string` | — | Placeholder text |
| `value` | `string` | — | Controlled value |
| `onChange` | `ChangeEventHandler` | — | Change handler |
| `disabled` | `boolean` | `false` | Disables input |

---

### `StatusDot`

Compact status indicator used in run lists, job monitors, and pipeline dashboards.

```tsx
import { StatusDot } from '@man4ish/ui';

<StatusDot status="running" />   // animated pulse
<StatusDot status="success" />
<StatusDot status="failed" />
<StatusDot status="queued" />
<StatusDot status="idle" />

<StatusDot status="running" label="Job in progress" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `status` | `'running' \| 'success' \| 'failed' \| 'queued' \| 'idle'` | — | Determines color and animation |
| `label` | `string` | — | Optional text label beside the dot |

---

### `Spinner`

```tsx
import { Spinner } from '@man4ish/ui';

<Spinner />
<Spinner size="sm" />
<Spinner size="lg" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Spinner diameter |

---

### `Table`

Generic sortable, paginated table. Columns are fully typed.

```tsx
import { Table } from '@man4ish/ui';
import type { Column } from '@man4ish/ui';

const columns: Column<MyRow>[] = [
  { key: 'name',   label: 'Repository', sortable: true },
  { key: 'code',   label: 'Code lines', sortable: true, align: 'right' },
  { key: 'status', label: 'Status',
    render: (v) => <Badge variant="success">{String(v)}</Badge> },
];

<Table columns={columns} data={rows} pageSize={10} />
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `columns` | `Column<T>[]` | — | Column definitions |
| `data` | `T[]` | — | Row data |
| `pageSize` | `number` | `10` | Rows per page |
| `emptyMessage` | `string` | `'No results'` | Empty state text |

**Column definition:**

| Key | Type | Default | Description |
|---|---|---|---|
| `key` | `keyof T` | — | Data key |
| `label` | `string` | — | Column header text |
| `sortable` | `boolean` | `false` | Enable sort on click |
| `align` | `'left' \| 'right'` | `'left'` | Text alignment |
| `render` | `(value, row) => ReactNode` | — | Custom cell renderer |

---

### `Tabs`

```tsx
import { Tabs } from '@man4ish/ui';
import type { Tab } from '@man4ish/ui';

<Tabs
  tabs={[
    { key: 'arch',   label: 'Architecture', content: <ArchView /> },
    { key: 'health', label: 'Health',        content: <HealthView /> },
  ]}
  defaultTab="arch"
  onChange={(key) => console.log('switched to', key)}
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `tabs` | `Tab[]` | — | Tab definitions |
| `defaultTab` | `string` | first | Initially active tab key |
| `onChange` | `(key: string) => void` | — | Called on tab switch |

**Tab definition:**

| Key | Type | Default | Description |
|---|---|---|---|
| `key` | `string` | — | Unique identifier |
| `label` | `string` | — | Tab button text |
| `content` | `ReactNode` | — | Panel content |

---

### `ProgressBar`

```tsx
import { ProgressBar } from '@man4ish/ui';

<ProgressBar value={98.7} variant="success" label="98.7%" />
<ProgressBar value={60}   variant="accent" />
<ProgressBar value={25}   variant="danger" size="lg" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | — | Current value (0–max) |
| `max` | `number` | `100` | Maximum value |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Bar height |
| `variant` | `'success' \| 'danger' \| 'warning' \| 'accent' \| 'info'` | `'accent'` | Fill color |
| `showLabel` | `boolean` | `true` | Show percentage label |
| `label` | `string` | — | Override auto label text |

---

### `Tooltip`

```tsx
import { Tooltip } from '@man4ish/ui';

<Tooltip content="27/27 services healthy">
  <Badge variant="success">UP</Badge>
</Tooltip>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `content` | `string` | — | Tooltip text shown on hover |
| `children` | `ReactNode` | — | Element that triggers hover |

---

### `Select`

```tsx
import { Select } from '@man4ish/ui';
import type { SelectOption } from '@man4ish/ui';

<Select
  label="Category"
  options={[
    { value: 'all',  label: 'All categories' },
    { value: 'core', label: 'Core'           },
  ]}
  value={selected}
  onChange={setSelected}
  placeholder="Choose a category"
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `options` | `SelectOption[]` | — | Option list |
| `value` | `string` | — | Controlled value |
| `onChange` | `(v: string) => void` | — | Change handler |
| `label` | `string` | — | Label above the select |
| `placeholder` | `string` | — | Placeholder option |
| `disabled` | `boolean` | `false` | Disables the select |

---

## Importing

Everything is exported from the package root:

```ts
import {
  Button, Badge, Card, Input, StatusDot, Spinner,
  Table, Tabs, ProgressBar, Tooltip, Select,
} from '@man4ish/ui';

import type { Column, Tab, SelectOption } from '@man4ish/ui';
```

Tree-shaking is automatic — unused components are excluded from your bundle at build time.

---

## Local development

```bash
git clone https://github.com/man4ish/omnibioai-ui
cd omnibioai-ui
npm install

# Build once
npm run build

# Watch mode (rebuilds on every save)
npm run dev

# Run tests
npm run test

# Watch mode
npm run test:watch

# View Storybook (visual catalogue of all components)
npm run storybook
```

Output lands in `dist/` as `index.js` (ES module) and `index.cjs` (CommonJS) with `index.d.ts` type declarations.

### Using in another local repo without publishing

```bash
# In this repo
npm run build
npm link

# In your consuming repo
npm link @man4ish/ui
```

---

## Repository layout

```
omnibioai-ui/
├── src/
│   ├── index.ts
│   ├── test-setup.ts
│   ├── components/
│   │   ├── Button/      (Button.tsx, Button.css, Button.test.tsx, Button.stories.tsx)
│   │   ├── Badge/       (Badge.tsx, Badge.css, Badge.test.tsx, Badge.stories.tsx)
│   │   ├── Card/        (Card.tsx, Card.css, Card.test.tsx, Card.stories.tsx)
│   │   ├── Input/       (Input.tsx, Input.css, Input.test.tsx, Input.stories.tsx)
│   │   ├── StatusDot/   (StatusDot.tsx, StatusDot.css, StatusDot.test.tsx, StatusDot.stories.tsx)
│   │   ├── Spinner/     (Spinner.tsx, Spinner.css, Spinner.test.tsx, Spinner.stories.tsx)
│   │   ├── Table/       (Table.tsx, Table.css, Table.test.tsx, Table.stories.tsx)
│   │   ├── Tabs/        (Tabs.tsx, Tabs.css, Tabs.test.tsx, Tabs.stories.tsx)
│   │   ├── ProgressBar/ (ProgressBar.tsx, ProgressBar.css, ProgressBar.test.tsx, ProgressBar.stories.tsx)
│   │   ├── Tooltip/     (Tooltip.tsx, Tooltip.css, Tooltip.test.tsx, Tooltip.stories.tsx)
│   │   └── Select/      (Select.tsx, Select.css, Select.test.tsx, Select.stories.tsx)
├── .storybook/
├── vite.config.ts        ← library build config
├── vitest.config.ts      ← test config (separate from vite)
├── tsconfig.json
├── CHANGELOG.md          ← release history (Keep a Changelog format)
└── package.json
```

---

## Design token contract

Components reference CSS custom properties from `@man4ish/design-tokens`. No component contains a hardcoded color, spacing value, or radius — all visual decisions are delegated to the token layer. This means:

- Swapping themes (light/dark, brand variants) requires only a token override
- All OmniBioAI surfaces (Electron app, web, plugin UIs) stay visually consistent from a single source of truth
- No `!important` hacks or specificity wars when overriding in consuming apps

---

## Related packages

| Package | Purpose |
|---|---|
| [`@man4ish/design-tokens`](https://github.com/man4ish/omnibioai-design-tokens) | CSS custom properties — required peer dependency |
| [`omnibioai-studio`](https://github.com/man4ish/omnibioai-studio) | Electron + React app — primary consumer |
| [`omnibioai`](https://github.com/man4ish/omnibioai) | Django backend — 200+ plugin bioinformatics platform |
| `omnibioai-control-center` | Health dashboard + ecosystem report (consumes design tokens) |

---

## License

MIT
