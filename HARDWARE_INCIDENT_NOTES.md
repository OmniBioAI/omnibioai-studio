# Hardware incident notes — for repair technician

**Host:** `spark-70f0`, NVIDIA GB10 (Grace-Blackwell unified-memory board).
**Date observed:** 2026-09-11/12 (overnight).
**Filed against:** [omnibioai-workbench#530](https://github.com/OmniBioAI/omnibioai-workbench/issues/530) — software-side investigation is tracked there; this file is the hardware-facing summary for whoever services the machine.

## Symptom 1: fast, disproportionate thermal ramp

Under a fairly modest concurrent GPU load (two LLM inference processes sharing the GPU — see "Load that triggered this" below), GPU temperature climbed from idle baseline to a level requiring an abort within **well under 3 minutes**:

| Time offset | GPU temp | Power draw |
|---|---|---|
| T+0 | 42°C | 4.5 W |
| T+~2 min | 71°C | 48 W |
| T+~3 min | **78°C** (abort threshold: 75°C) | 50 W |

This happened **twice** in one ~10-minute test window (second peak also 76-78°C), each time recovering fully to baseline (~42-46°C) within 2-3 minutes once the GPU load was removed. The ramp rate (~35°C in under 2 minutes) is fast relative to the load level — this was two Ollama-served local LLMs (a 32B and a 70B parameter model) sharing GPU/unified memory, not a synthetic stress test.

Idle baseline recovers cleanly and holds steady (confirmed at session end: 41°C / 4.3W, stable, no drift).

## Symptom 2: GPU driver memory-allocation failures (NVRM)

Real kernel log lines (`dmesg`/`journalctl -k`), captured live during the same concurrent-load window, **before** any thermal throttling or intervention:

```
NVRM: nvCheckOkFailedNoLog: Check failed: Out of memory [NV_ERR_NO_MEMORY] (0x00000051) returned from _memdescAllocInternal(pMemDesc) @ mem_desc.c:1359
```

Observed repeatedly across multiple sessions, not a one-off:
- 2026-09-11 23:42:24 (also paired with `NVRM: _iovaspaceCreateMappingDataFromMemDesc: failed to allocate 0x4000028 bytes for IOVA mapping metadata` and `0 pages hwpoisoned`)
- 2026-09-11 23:47:24
- 2026-09-11 23:47:28
- 2026-09-11 23:49:50
- 2026-09-11 23:52:16

This is a **GPU driver-level VRAM/IOVA allocation failure**, distinct from a standard Linux kernel OOM-killer event (which this host also separately exhibits under unrelated container memory-cgroup pressure, always via `SIGKILL` — that mechanism has been ruled out as the cause of a related software crash symptom; see the linked issue). The NVRM failures above correlate specifically with concurrent large-model GPU memory pressure and are the leading working hypothesis for a related process crash (`SIGSEGV`) under the same load pattern.

## Load that triggered this

Two Ollama-served local LLM inference processes running concurrently on the same GPU:
- `deepseek-r1:32b` (~19-55GB depending on context/quantization)
- `llama3.1:70b` (~42-85GB depending on context/quantization)

This is a real, intentional production workload pattern for this host (a bioinformatics AI platform that runs local LLM inference), not an edge case — the platform's own task scheduler currently allows both to load and run at the same time with no coordination.

## What's NOT yet known

- Whether this is a cooling/airflow issue (fans, thermal paste, dust, ambient temperature), a power delivery issue, a driver/firmware issue, or a GPU hardware fault. No conclusion has been reached — flagging the concrete symptom pattern for diagnosis, not asserting a cause.
- Whether the NVRM allocation failures and the fast thermal ramp share a root cause or are two independent findings under the same load.

## Suggested checks for the technician

- Thermal paste / heatsink contact and dust/airflow inspection given the disproportionate ramp rate for the load level.
- GPU VRAM health / memory test if available for this board.
- Confirm cooling fan curve/behavior is responding correctly under sustained ~50W GPU load (fan response was not independently verified during these tests).

---
*Generated from live-monitored data (temperature logged every 15s, kernel log followed live) during two software-debugging sessions on 2026-09-11/12. Raw evidence and full timeline: omnibioai-workbench#530.*
