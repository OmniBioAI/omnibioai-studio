# Dev machine comparison — MacBook Pro (M4 Max) vs. DGX Spark

Companion note to [`HARDWARE_INCIDENT_NOTES.md`](./HARDWARE_INCIDENT_NOTES.md) (the `spark-70f0` GB10 thermal/NVRM
incident, filed against [omnibioai-workbench#530](https://github.com/OmniBioAI/omnibioai-workbench/issues/530)).
That file documents what's wrong with the DGX Spark. This one records what the other machine
in rotation — a MacBook Pro — actually is, so future sessions don't default to "just run it
locally" for work that architecturally requires the Spark's NVIDIA GPU, and don't default to
the Spark for work that's cheaper and safer to run here.

**Date recorded:** 2026-09-14.

## MacBook Pro specs

| | |
|---|---|
| Model | MacBook Pro, Mac16,5 (MX303LL/A) |
| Chip | Apple M4 Max — 14 cores (10P + 4E) |
| GPU | Apple M4 Max integrated, 32 cores, Metal 4 — **no NVIDIA GPU, no CUDA, no NVRM driver stack** |
| RAM | 36 GB unified |
| Storage | 926 GiB volume, 297 GiB available at time of recording |
| OS | macOS 26.5.1 (25F80) |

## Docker Desktop resource allocation (this machine)

```
CPUs allocated:    14
Memory allocated:  17.29 GiB (18176 MiB configured)
Swap:              2 GiB
Disk image cap:    ~246 GiB (251770 MiB)
```

Confirmed working right now: 6 containers up and healthy — a 4-service Airflow stack
(webserver/scheduler/worker/triggerer) + Postgres 13 + Redis, running 32h+ uninterrupted.
This is the shape of a "core docker-compose stack" (app services + Postgres + Redis, CPU-only) —
it runs fine here. A stopped `ollama` container also exists in `docker ps -a` from ~6 weeks ago,
confirming Ollama has been tried on this Mac before, but see the GPU caveat below before treating
that as a green light for GPU-dependent inference work.

## DGX Spark specs (for contrast — see HARDWARE_INCIDENT_NOTES.md for full detail)

- Host: `spark-70f0`, NVIDIA GB10 (Grace-Blackwell unified-memory board), aarch64.
- Has a currently-unresolved hardware/driver fragility: GPU thermal aborts (75°C threshold hit
  in <3 min under concurrent LLM load) and NVRM `NV_ERR_NO_MEMORY` allocation failures — both
  tracked in HARDWARE_INCIDENT_NOTES.md / omnibioai-workbench#530.

## Scoping verdict

**Good fit on this MacBook** (CPU-only, no GPU dependency):
- omnibioai-tes#34 Tier 0 checks (config parsing, artifact-existence checks, HTTP domain
  reachability, image-freshness checks) — none of this touches a GPU.
- Code-level audits, static analysis, git/repo hygiene work.
- Any docker-compose stack limited to app services + Postgres + Redis + similar — confirmed
  running healthily above.

**Not a fit here — needs the DGX Spark specifically:**
- omnibioai-workbench#530's GPU crash reproduction — the bug is tied to the GB10's NVIDIA
  driver stack (NVRM) and its specific thermal behavior. This Mac has no NVIDIA GPU and no
  NVRM driver at all; the failure mode **cannot occur** on this hardware, so "it doesn't
  reproduce on the Mac" would carry zero evidentiary weight either way.
- Any Ollama-based local inference intended to exercise that same GPU/thermal/VRAM path
  (e.g. the `deepseek-r1:32b` + `llama3.1:70b` concurrent-load pattern from the incident). Ollama
  can technically run on Apple Silicon via Metal, but that's a different GPU, driver, and memory
  architecture — it validates nothing about the GB10 incident.
- RAGBio reindex work, if/when it's embedding-model-heavy enough to need the Spark's GPU
  (36 GB unified RAM here vs. Docker's 17.29 GiB allocation is also comparatively tight for
  large embedding batches — check the specific reindex job's memory footprint before assuming
  this box can absorb it).
- Anything else from the original thermal-incident testing session — by definition that testing
  requires the hardware that has the thermal problem.

**Rule of thumb:** if the task needs an NVIDIA GPU, CUDA, or is trying to reproduce or validate
anything from the #530 incident, it belongs on the Spark. If it's CPU-bound — parsing, auditing,
static checks, a lightweight compose stack — this MacBook is adequately provisioned and already
proven (see Docker Desktop stats above).
