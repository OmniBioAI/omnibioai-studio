# Security model

**The descriptor is data, not code.** This page is the practical,
developer-facing version of that rule: what you must never put in a
descriptor, why, and the four safe request flows the native UI system
supports.

## The rule

Never place any of the following inside a plugin UI descriptor or anywhere in
a runtime response the frontend reads:

- credentials, secrets, tokens, API keys;
- filesystem paths, storage bucket/object keys, signed URLs;
- an arbitrary backend endpoint (only the fixed, plugin-scoped shapes in
  [descriptor-spec.md](descriptor-spec.md) are accepted);
- arbitrary script/module/import references, callbacks, or event handlers;
- authorization decisions (what the frontend believes about who-can-do-what
  is never trusted — the backend re-checks everything on every request).

This isn't a style guideline — it's enforced mechanically.
`rejectExecutableMetadata` (`src/ui/lib/pluginApi.js`) recursively scans the
entire descriptor (depth limit 30) and throws on any key matching:

```text
__proto__, prototype, constructor, jsx, javascript, script, script_url, html,
raw_html, dangerouslySetInnerHTML, callback, callbacks, event_handler,
expression, onChange, onClick, onSubmit, onLoad, onError, module, module_path,
import, imports, eval, function, function_name, credentials, password, token,
access_token, api_key, secret, secrets, source_path, filesystem_path,
upstream_url
```

Field IDs additionally reject `__proto__`, `prototype`, `constructor`,
`password`, `token`, `api_key`, `secret`, `credentials` at the identifier
level (`FORBIDDEN_FIELD_IDS`). A repository-wide grep of `src/ui` for
`dangerouslySetInnerHTML`, `eval(`, `new Function`, `Function(`, `srcDoc`,
`javascript:`, and dynamic `import(` finds **zero** matches anywhere outside
this guard's own pattern — there is no path in the current engine where a
descriptor or response value becomes markup, a script, or a dynamic import.

## Unsafe vs. safe: a concrete example

**Unsafe** (never do this):

```json
{"artifacts": [{"download_url": "https://storage.internal/bucket/run-42/out.csv"}]}
```

A raw URL leaks storage topology and bypasses the opaque-identity flow. The
artifact response validator rejects it because artifact records allow exactly
`artifact_id`, `display_name`, `label`, `media_type`, `size_bytes`, and `kind`;
`download_url` is not part of that contract. Separately, descriptor keys such
as `upstream_url` are rejected by `rejectExecutableMetadata`.

**Safe** (what the real contract does):

```json
{"artifacts": [{"artifact_id": "art_NzvP2cW7E0eCG_WoahB1FcWtt0Rdj1N27Z2u2d64FcA", "display_name": "results.csv", "label": "Results", "media_type": "text/csv", "size_bytes": 9021, "kind": "table"}]}
```

The browser only ever sees an **opaque artifact identity**
(`art_` + 43 base64url characters). `ArtifactDownload` constructs exactly one
fixed URL shape,
`/plugins/{slug}/api/ui-artifacts/{run_id}/{artifact_id}/download/`, and the
backend re-authenticates, re-checks `owner_user_id`, resolves the ID against
that plugin/run's own manifest, and proves filesystem containment before
sending a response — see [results/artifacts.md](results/artifacts.md).

## The four safe request flows

**FORM** — ordinary analysis inputs:

```text
React (PluginForm) -> fixed backend operation (descriptor endpoint) -> backend validation -> executor
```

React collects values into the fields you declared; it performs only
client-side UX validation (required/number-format) for immediate feedback.
The backend independently validates, normalizes, and scientifically checks
every value — browser validity is feedback, never authorization.

**RESOURCE** — picking one of the caller's own resources
(see [fields/resource-select.md](fields/resource-select.md)):

```text
React discovery (GET ui-resources/<type>/) -> authorized, owner-scoped resource list
   -> user submits opaque id -> backend re-resolves and re-authorizes that id
```

Discovery never authorizes execution. The submission path
(`resource_owned_by_user`) independently re-checks ownership and state
(`COMPLETED`) exactly as if the id had never been listed — a resource that
was legitimately discoverable, then became unowned/incomplete/deleted before
submission, is rejected identically to one that was never listed.

**ARTIFACT** — downloading a run's output
(see [results/artifacts.md](results/artifacts.md)):

```text
opaque artifact identity -> authenticated backend download route
   -> ownership + run + plugin containment checks -> safe attachment
```

**REFERENCE** — navigating to an external scientific record
(see [results/scientific-reference.md](results/scientific-reference.md)):

```text
reference type + identifier -> authenticated same-origin backend route
   -> server-owned destination (fixed HTTPS host/path per type)
```

The browser only ever constructs
`/plugins/{slug}/api/ui-reference/{reference_type}/?identifier=...`. It never
receives or constructs the actual external URL. The backend validates the
identifier against a per-type grammar (see the allowlisted types in
[results/scientific-reference.md](results/scientific-reference.md)),
defends against open-redirect payloads (absolute/protocol-relative URLs,
scheme/slash/CR-LF injection, traversal, duplicate query params), and returns
the redirect with `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`.

## What the descriptor controls vs. cannot control

| Descriptor controls | Descriptor cannot control |
| --- | --- |
| Which allowlisted field/result components appear, and their declared bounds (min/max, choices, max_items, etc.) | Who is authenticated, authorized, or owns a resource |
| Which fixed, plugin-scoped endpoint shape a component calls | What URL, path, or credential that endpoint ultimately resolves to |
| Labels, descriptions, help text (always escaped, rendered as inert text) | Whether submitted data is scientifically valid — that is always re-checked server-side |
| Conditional visibility/requiredness of its own fields (finite `select`-controller grammar only) | Any JavaScript, HTML, callback, or dynamic import |

## Related

- [descriptor-spec.md](descriptor-spec.md) — the exact schema these rules are
  enforced against.
- [fields/resource-select.md](fields/resource-select.md),
  [results/artifacts.md](results/artifacts.md),
  [results/scientific-reference.md](results/scientific-reference.md) — the
  per-component security boundary in full detail.
- [migration-guide.md](migration-guide.md) — explicit warnings against
  weakening this boundary to make a migration easier.
