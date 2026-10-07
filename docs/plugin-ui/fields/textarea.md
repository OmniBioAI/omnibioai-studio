# TextAreaField (`textarea`)

## Purpose

Multiline plain-text input — notes, multi-line parameters, or (in v1) JSON
hyperparameter editing as free text.

## When to use it

Any text value where line breaks are meaningful or the expected content is
longer than a single line. v1 plugins also use this for JSON hyperparameter
editing, but the field **never parses JSON itself** — it is a plain
multiline text box; any JSON structure is the backend's responsibility to
parse and validate.

## When NOT to use it

Short single-line values — use [text](text.md). Sequence/list-like
scientific input is only "plain text with line breaks," not a structured
list type — there is no separate list-input component.

## Descriptor contract

```json
{"id": "hyperparams", "component": "textarea", "format": "text", "label": "Hyperparameters", "description": "JSON object of model hyperparameters.", "required": false}
```

Valid in both schema v1 and v2. The registry export `TextareaField` is an
alias of `TextAreaField` — there is exactly one implementation.

## Properties / fields

Same common keys as [text](text.md) (`id`, `component`, `format`, `label`,
`description`, `required`, optional `default`/`placeholder`). `format` is
`"text"` in schema v2. Schema v1 accepts another inert format label such as
`"json"`; the field remains a plain textarea and never parses that format.

## Backend responsibilities

Parse and validate any structured content (e.g. `json.loads` the submitted
string) and reject malformed input with a clear error — the frontend will
submit whatever text was typed, unvalidated.

## Frontend responsibilities

Render a native `<textarea rows={3}>`, hold the controlled string value,
submit as `param_{id}`. No JSON parsing, formatting, or syntax highlighting.

## Security boundary

Plain text only; never interpreted, evaluated, or rendered as HTML/JS. A
submitted value that happens to look like a script or HTML snippet is
treated as inert text everywhere it is later displayed.

## States

Default, disabled, read-only, invalid, required.

## Accessibility

Same `FieldShell` label/description/error association as every other field;
native textarea keyboard behavior (multi-line editing, no special key
trapping).

## Scientific-data considerations

No line-length or total-length limit is enforced client-side; long
multi-line scientific descriptions or parameter blocks are preserved
verbatim up to whatever the backend accepts.

## Example

v1 JSON hyperparameter fields in legacy-compatible async_analysis plugins
(preserves existing free-text format labels, including `"json"`-labeled
content, without the field itself parsing it).

## Rendered behavior

A 3-row textarea that grows only via its own scrollbar, not by resizing the
page layout.

## Validation / failure behavior

Same descriptor-level checks as `text`. No runtime JSON-shape validation
happens in the browser; a plugin that needs JSON must validate it
server-side after submission.

## Testing

`tests/ui/workbench-fields.test.jsx`, `tests/ui/workbench-components.test.jsx`.

## Related components

[text](text.md)
