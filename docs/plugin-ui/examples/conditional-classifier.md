# Complete example: conditional input — the classifier family

Real, verified from the backend repository's `plugins/shared/plugin_ui.py`
(functions `_inputs`, `_conditional_classifier_inputs`) and
`plugins/admet_property_predictor/plugin.json`. This is the clearest real
example of the finite conditional-field grammar — **not** a general
expression/rule engine.

## 1. The real mechanism

`plugins/shared/plugin_ui.py` defines a frozenset,
`CONDITIONAL_CLASSIFIER_PILOTS`, confirmed to include (among ~20 total)
`admet_property_predictor`, `amr_gene_classifier`,
`scrna_celltype_classifier`, and `spatial_domain_classifier` — all four
candidates named in the original task spec are real members. For every slug
in that set, `_inputs()` dispatches to `_conditional_classifier_inputs()`
instead of the generic `io_contract.consumes` projection every other plugin
uses. This function builds **the same fixed five-field shape** for every
classifier plugin, substituting only the plugin's own primary-input id
(looked up from a second fixed mapping,
`CONDITIONAL_CLASSIFIER_PRIMARY_INPUTS`, e.g. `"molecules"` for
`admet_property_predictor`, `"sequences"` for `amr_gene_classifier`,
`"adata"` for `scrna_celltype_classifier` and `spatial_domain_classifier`).

## 2. The fixed field set (verified from source)

```python
return [
    {"id": "mode", "label": "Mode", "required": True, "format": "text",
     "widget": "select", "choices": ["infer", "train"], "default": "infer"},
    primary,   # e.g. {"id": "molecules", "widget": "file", ...} for admet_property_predictor
    labels,    # {"id": "labels", "widget": "file", ...,
               #  "conditions": [
               #    {"controller": "mode", "operator": "equals", "value": "train", "effect": "visible"},
               #    {"controller": "mode", "operator": "equals", "value": "train", "effect": "required"}
               #  ]}
    {"id": "model_ref", "label": "Model Reference", "required": False,
     "format": "text", "widget": "text"},
    {"id": "hyperparams", "label": "Hyperparameters", "required": False,
     "format": "json", "widget": "text"},
]
```

This is the real, complete conditional grammar used anywhere in this
codebase: exactly one controller field (`mode`), exactly one operator
(`equals`), one literal value, and one of two effects (`visible`,
`required`). It is **not** a generic rule engine — there is no "and"/"or", no
arbitrary comparison operator, and no field other than `mode` ever acts as a
controller in this family. Do not design a new plugin around a more general
conditional expression; this exact shape is the only one implemented.

## 3. Real descriptor instance: `admet_property_predictor`

From `plugins/admet_property_predictor/plugin.json`: a `category: "ml"`
plugin, `execution_model: "async_thread"`, with
`io_contract.consumes = [molecules (csv, required), labels (csv, optional,
"Required when params.mode == 'train'; ignored for 'infer'")]`. The
conditional-classifier template above turns this into:

- `mode` — `select`, choices `["infer", "train"]`, default `"infer"`.
- `molecules` — the primary input, `file` widget (CSV of SMILES).
- `labels` — `file` widget, invisible and not required when `mode` is
  `"infer"`; visible and required when `mode` is `"train"`.
- `model_ref` — optional `text`, "Optional registered model reference."
- `hyperparams` — optional `text` widget with `format: "json"`, "Optional
  JSON hyperparameters for training."

## 4. Input fields used

`select` (see [../fields/select.md](../fields/select.md)) for `mode`, `file`
(see [../fields/file-upload.md](../fields/file-upload.md)) for `molecules`
and the conditional `labels`, `text` (see
[../fields/text.md](../fields/text.md)) for `model_ref` and `hyperparams`
(note: `hyperparams` uses the `text` widget even though its declared
`format` is `"json"` — the field never parses JSON itself; see
[../fields/textarea.md](../fields/textarea.md) for the related multiline
free-text contract used elsewhere for JSON hyperparameters).

## 5. Backend responsibilities

The visibility/required toggle is UX convenience only — Django's own
validation (not shown in this excerpt, and not independently re-verified
beyond the `io_contract` description) must independently enforce that
`labels` is actually present and valid when `mode == "train"`, exactly as it
would for any other required-on-condition field. The frontend condition
exists so the form doesn't show or demand an irrelevant field; it is not a
substitute for backend enforcement.

## 6. Renderer selection

`async_analysis` — these are submit-and-poll ML inference/training jobs,
identical in lifecycle shape to DESeq2 (see
[async-analysis-deseq2.md](async-analysis-deseq2.md)), just with a
conditional input set instead of a flat one.

## 7. Validation / failure behavior

A malformed condition object (wrong keys, unsupported effect, or a
duplicate/contradictory effect for the same field) is rejected by the
backend condition parser (`plugins/shared/plugin_ui.py`, the code path
immediately following `_conditional_classifier_inputs` that checks
`set(condition) != {"controller", "operator", "value", "effect"}` and
`effect not in CONDITION_EFFECTS`) — the descriptor fails closed rather than
rendering a partially-understood condition.

## 8. Tests

This example's field-level behavior is covered by the same frontend field
tests as any other `select`/`file`/`text` field
(`tests/ui/workbench-fields.test.jsx`) plus `PluginForm`'s conditional
visibility logic (`src/ui/components/workbench/PluginForm.jsx`); the
backend condition-grammar parsing is covered in
`plugins/shared/tests/test_plugin_ui_schema.py` on `main`. This guide did
not locate a classifier-family-specific frontend test file distinct from the
generic field/form tests — if you add one, name it for the shared mechanism
(conditional fields), not for one plugin.

## 9. Expected UI behavior

The developer sees a Mode dropdown (Infer/Train), a file picker for the
primary scientific input, an optional model-reference text field, and an
optional hyperparameters field. The Labels file picker is hidden entirely
when Mode is "Infer"; switching Mode to "Train" reveals it and marks it
required, with native required-field validation on submit.
