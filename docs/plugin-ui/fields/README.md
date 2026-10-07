# Input fields

Fields are the 8 descriptor-selectable input primitives — the subset of the
17-entry `WORKBENCH_COMPONENT_REGISTRY` listed in `WORKBENCH_FIELD_TYPES`
(`src/ui/components/workbench/componentRegistry.jsx`).

| Component | Registry id | Schema availability | Purpose |
| --- | --- | --- | --- |
| [TextField](text.md) | `text` | v1 + v2 | Single-line text |
| [TextAreaField](textarea.md) | `textarea` | v1 + v2 | Multiline plain text |
| [NumberField](number.md) | `number` | **v2 only** | Integer/float entry |
| [SelectField](select.md) | `select` | v1 + v2 | Fixed finite choices |
| [CheckboxField](checkbox.md) | `checkbox` | **v1 only** | Two-state boolean |
| [MultiSelectField](multiselect.md) | `multiselect` | **v1 only** | Multiple finite choices |
| [FileUploadField](file-upload.md) | `file` | **v1 only** | File upload |
| [ResourceSelectField](resource-select.md) | `resource_select` | **v1 only** | Caller's own prior completed run |

**This availability split is a real, current contract limitation, not a
documentation simplification.** The frontend validator enforces two
different field vocabularies depending on schema version:

- Schema v1 (`validateField` in `src/ui/lib/pluginApi.js`) accepts `file`,
  `text`, `textarea`, `select`, `checkbox`, `multiselect`, `resource_select`
  — **not** `number`.
- Schema v2 (`validBatchField` in `src/ui/lib/pluginUiContracts.js`, used only
  by the `query` renderer) accepts `text`, `textarea`, `number`, `select`
  only — **not** `file`, `checkbox`, `multiselect`, `resource_select`, and
  **no conditional fields**.

If you need `number` input, you are writing a v2 `query` plugin. If you need
`checkbox`/`multiselect`/`resource_select`/`file`, you are writing a v1
`async_analysis` (or `informational`, trivially — informational plugins take
no inputs at all) plugin. There is currently no schema version that supports
both halves at once.

Two of the eight are defined directly inside `componentRegistry.jsx` rather
than their own file under `fields/`: `file` (`FileUploadField`) and `select`
(`SelectField`). `textarea`'s registry export, `TextareaField`, is a plain
alias of `TextAreaField` — not a second implementation.

## Rules that apply to every field

- **Shared shell:** every field is wrapped by `PluginField` in a single
  `FieldShell` (`src/ui/components/workbench/fields/FieldShell.jsx`), which
  owns the associated `<label>`, the required marker, the description, the
  optional unit line, and the inline error — all wired together with
  `aria-describedby`/`aria-invalid`. A field component itself never renders
  its own label.
- **Identifier grammar:** every field `id` matches `^[a-z][a-z0-9_]*$` and
  may not be `__proto__`, `prototype`, `constructor`, `password`, `token`,
  `api_key`, `secret`, or `credentials`. **No password, token, API-key, or
  secret field type exists at all** — there is no field for it, by design.
- **Defaults:** `PluginForm`/`PluginField`'s `currentValue()` applies a
  descriptor `default` only when the value is `undefined`. Clearing a field
  to an empty string is a real, distinct value — it does not silently
  restore the default.
- **Trusted props, not descriptor capabilities:** `disabled`, `readOnly`,
  `invalid`/`error`, and loading state are React props passed in by the
  renderer (`AsyncAnalysisRenderer`/`QueryRenderer`) — a descriptor has no
  key that can set any of them.
- **Required semantics:** a field can be made conditionally required (see
  the conditional grammar in [descriptor-spec.md](../descriptor-spec.md)),
  but "required" always ultimately means the same thing per field type —
  see each page for the exact presence check `PluginForm` performs.

## Related

- [descriptor-spec.md](../descriptor-spec.md) — the full schema reference.
- [results/README.md](../results/README.md) — the other half of the
  registry.
