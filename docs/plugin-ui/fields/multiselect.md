# MultiSelectField (`multiselect`)

## Purpose

Select zero or more values from a small, immutable, descriptor-owned
scientific vocabulary.

## When to use it

A fixed set of methods/categories where more than one can apply at once —
enrichment methods (GO/Reactome/GSEA), fixed algorithm choices.

## When NOT to use it

- **Schema v2 `query` descriptors** — `multiselect` is **v1 only**.
- Server-backed resource discovery — **do not use `multiselect` for this.**
  A caller's own prior completed runs use
  [resource-select](resource-select.md) instead. Datasets, registered
  objects, or other user-owned resource families have no evidence-backed
  contract yet; don't snapshot server-owned choices into a descriptor or
  accept unknown values as a workaround.
- Free-form tags or user-created options — the choice set is immutable
  once the descriptor is validated; there is no "add option" interaction.

## Descriptor contract

```json
{"id": "methods", "widget": "multiselect", "format": "text", "label": "Methods", "description": "Choose one or more fixed methods.", "required": true, "multiple": true, "choices": [{"value": "go", "label": "GO (Gene Ontology)"}, {"value": "reactome", "label": "Reactome"}], "default": ["go"]}
```

v1 only.

## Properties / fields

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `format` | `"text"` | yes | |
| `multiple` | `true` | yes | Always exactly `true` |
| `choices` | 1–50 `{value, label}` objects | yes | Unique scalar `value` tokens; bounded inert `label` text (`MAX_MULTISELECT_CHOICES = 50`) |
| `default` | duplicate-free array, subset of `choices` values | yes | Use `[]` for no default selection |

Choice `value` matches `^[A-Za-z0-9][A-Za-z0-9_.+-]{0,127}$`; `label` is
non-empty, ≤200 chars, with no control characters or `<`/`>`.

## Backend responsibilities

Accept only a flat JSON string array, reject objects/unknown values/
duplicates, and restore the descriptor's own display order regardless of
the order the user selected items in — the executor always sees a
normalized, descriptor-ordered list.

## Frontend responsibilities

Render a native `<select multiple>` sized to `min(max(choices.length, 3), 8)`
rows; submit one JSON-stringified string array in `param_{id}` so an
explicit empty selection (`"[]"`) is distinguishable from the field being
omitted entirely.

## Security boundary

Choices are fixed, descriptor-embedded data — never a remote lookup. No
free-text value can ever be submitted; the component itself rejects a
runtime `value` containing anything outside the declared `choices` by
rendering a controlled error instead of the control.

## States

Loading is not applicable (choices are already in the descriptor); default,
disabled, read-only, invalid, required (at least one selection), optional
(an empty array is a valid submission).

## Accessibility

Native multi-select listbox keyboard operation (ctrl/cmd-click, shift-click,
arrow keys); `FieldShell` label/description/error association; long labels
wrap rather than truncate.

## Scientific-data considerations

Labels may be full method/algorithm names ("GO (Gene Ontology)") without
abbreviation; no truncation at any width.

## Example

Pathway-enrichment plugins' fixed GO/Reactome/GSEA method selector; a fixed
three-algorithm anomaly-detection selector.

## Rendered behavior

A native multi-row select box; selecting/deselecting options updates the
controlled array in descriptor order, not click order.

## Validation / failure behavior

Invalid `choices` metadata, or a runtime `value` with duplicates or values
outside the declared set, renders `<p role="alert">Invalid finite
multiselect metadata.</p>` instead of the control.

## Testing

`tests/ui/workbench-choice-fields.test.jsx`.

## Related components

[checkbox](checkbox.md), [select](select.md), [resource-select](resource-select.md)
