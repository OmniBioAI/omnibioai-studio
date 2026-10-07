# Complete example: artifacts and images

Unlike the other three worked examples, there is currently **no single fully
native plugin that demonstrates the complete artifact/multi-image path in
production**. This is stated here plainly rather than fabricated, per the
existing audit record in `docs/workbench-component-library-batch-1.md`
("Proof plugins — all held, with a systemic finding").

## What the real evidence shows

Several real legacy plugins produce multiple plot artifacts per run —
`cell_comm_visualization`, `chipseq_signal_plots`, `scanpy_qc_metrics`, and
`rnaseq_analysis` among them — which is exactly the shape
[`ImageGallery`](../results/image-gallery.md) was built to render. All four
were evaluated as native proof-plugin candidates and **all four were held**,
for one identical, pre-existing, unrelated backend defect: each plugin's
`submit()` method calls `RunStore.create_run(...)` a **second** time with
`meta={"cli": True, ...}`, which carries no `owner_user_id`. Because
`RunStore.create_run()` fully replaces `run.json` on every call, this second
call erases the `owner_user_id` the generic run-submission view had already
recorded from the authenticated request. Under the ownership policy every
artifact/resource check relies on (see
[../security-model.md](../security-model.md)), a run with no recorded
`owner_user_id` is denied to **everyone**, including the user who started
it — so wiring any of these plugins through the standard native path as-is
would make every run immediately inaccessible to its own creator.

This is a backend executor bug, unrelated to the React/descriptor
architecture itself. The frontend contract (`ArtifactList`,
`ArtifactDownload`, `ImageGallery`) is not blocked on anything — it is
proven correct by its own test suite; what is blocked is wiring any of these
*specific* four plugins into the native registry until their executors stop
re-creating the run record without an owner.

## What you can prove today

1. **The artifact contract itself**, through the paired backend ownership/
   containment tests and Studio artifact component/renderer tests listed in
   [../testing.md](../testing.md). The current audit does not claim a clean
   production end-to-end proof plugin.
2. **The one- and multi-image `ImageGallery` paths**, via its test suite:
   `tests/ui/workbench-image-gallery.test.jsx` exercises the component
   against synthetic responses containing one and multiple qualifying
   artifacts. This is test-suite-level proof, not a production demonstration.

## If you are building a new multi-image plugin

Do **not** copy DESeq2's current second `RunStore.create_run()` call. Preserve
the owner-bearing run created by the authenticated submission path, publish
two or more `kind: "plot"` artifacts with `media_type` starting `image/` in your
`RunStore.write_artifacts(...)` manifest, and declare nothing extra in your
descriptor — `ImageGallery` activates automatically from the existing,
unchanged artifacts response once at least one qualifying image is present.
See [../results/image-gallery.md](../results/image-gallery.md) for the full
contract and [../results/artifacts.md](../results/artifacts.md) for the
underlying artifact identity/ownership model.

## If you are fixing one of the four held plugins instead

That is a backend executor fix (stop the second `RunStore.create_run()` call
from dropping `owner_user_id`), not a frontend or descriptor change. Once
fixed, the plugin needs no new native UI work at all — the existing
`ImageGallery`/`ArtifactList` contract already covers its result shape.
Treat this as a backend bug ticket, separate from any #708-style UI work.

## Related pages

[../results/artifacts.md](../results/artifacts.md) ·
[../results/image-gallery.md](../results/image-gallery.md) ·
[../results/static-png.md](../results/static-png.md) ·
[../security-model.md](../security-model.md)
