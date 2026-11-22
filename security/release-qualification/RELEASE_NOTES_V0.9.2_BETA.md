# OmniBioAI Studio v0.9.2-beta

## Plugin truthfulness: every analysis plugin tested

OmniBioAI Studio v0.9.2-beta is an evaluation release about plugin truthfulness. Each of the 245 analysis plugins now has either a recorded test verdict or a documented reason why it cannot be tested yet. Plugins that returned placeholder or synthetic results have been fixed or disabled. A plugin that cannot run yet now refuses with a clear message instead of producing output.

## ⚠️ Breaking changes

Read this before upgrading if a pipeline, workflow or script runs any of the plugins below.

**Some plugins are disabled.** They are hidden from menus and refused by every run path: the plugin page, the API, workflows and the agent. A pipeline step that uses one fails with a message naming the reason. `KNOWN_ISSUES_V0.9.2_BETA.md` lists them by reason. If you used `deseq2_analysis`, use `rnaseq_analysis` for DESeq2 until its image is rebuilt.

**Some workflow steps now refuse instead of returning output.** A few plugins' workflow-node executors had no real backend. They used to write placeholder results, and they now fail with a message that points to the plugin's own page, where the real tool still runs. The affected plugins are listed in the known-issues file.

**More plugins fail on missing input.** A plugin that previously reported success when its input or reference file did not exist now fails. Pipelines that relied on a result always appearing will now see the missing file as a failure.

### 📦 Downloads

| Platform | Architecture | File |
|---|---|---|
| Linux | x64 | `OmniBioAI.Studio-0.9.2-beta.AppImage` |
| Linux | x64 | `omnibioai-studio_0.9.2-beta_amd64.deb` |
| Linux | x64 | `omnibioai-studio-0.9.2-beta.x86_64.rpm` |
| Linux | ARM64 | `OmniBioAI.Studio-0.9.2-beta-arm64.AppImage` |
| Linux | ARM64 | `omnibioai-studio_0.9.2-beta_arm64.deb` |
| Linux | ARM64 | `omnibioai-studio-0.9.2-beta.aarch64.rpm` |
| macOS | Intel | `OmniBioAI.Studio-0.9.2-beta.dmg` |
| macOS | Apple Silicon | `OmniBioAI.Studio-0.9.2-beta-arm64.dmg` |
| Windows | x64 | `OmniBioAI.Studio.Setup.0.9.2-beta.exe` |

All nine installers are built by GitHub Actions from the `v0.9.2-beta` tag. Check every download against `SHA256SUMS-v0.9.2-beta.txt`. The macOS and Windows installers are unsigned and not notarized.

### 🚀 Quick Start

**Linux (DEB - Ubuntu/Debian):**
```bash
sudo dpkg -i omnibioai-studio_0.9.2-beta_*.deb
omnibioai-studio
```

**Linux (RPM - RHEL/Fedora):**
```bash
sudo rpm -i omnibioai-studio-0.9.2-beta.*.rpm
omnibioai-studio
```

**Linux (AppImage):**
```bash
chmod +x OmniBioAI.Studio-0.9.2-beta*.AppImage
./OmniBioAI.Studio-0.9.2-beta*.AppImage --no-sandbox
```

**macOS:** open the DMG, drag the app to Applications, then right-click → Open (the app is not notarized).

**Windows:** run the installer and launch from the Start menu (the installer is unsigned).

### 📋 Requirements
- Docker (auto-prompted on first launch)
- 16GB RAM minimum (32GB recommended)
- 50GB free disk space
- License key (get one at omnibioai.org)

### 🔑 Get Beta Access
Sign up at: https://omnibioai.org/#request

## Highlights

### Plugin testkit: all 245 analysis plugins

Every analysis plugin has been run by the plugin testkit on small, deterministic test data with a known answer, or excluded with a documented reason. Each run had two parts:
- **A real run:** the output must follow from the input.
- **Probes:** the plugin must fail clearly when an input or reference file is missing, or when the language model is unavailable.

**143 plugins have a verdict:**

| Verdict | Plugins |
|---|---|
| Passes from its own image | 42 |
| Passes when run in-process (not yet from its own image) | 46 |
| Was returning placeholder or synthetic results and is fixed; now computes from its input | 26 |
| Had a real bug that is fixed | 17 |
| Workflow executor had no backend and now refuses with a clear message; the plugin page still works | 7 |
| Known defect still open (listed in the known-issues file) | 5 |

**102 plugins are excluded, each with a documented reason:**

| Reason | Plugins |
|---|---|
| Disabled: container image not yet published | 21 |
| Disabled: container image being rebuilt (script or dependency missing) | 13 |
| Disabled: returned placeholder results or is a stub; pending a real implementation | 17 |
| Requires a GPU (and GPU permission) | 29 |
| Image built for x86-64 only; an ARM64 build is needed | 8 |
| Other reasons outside the plugin (missing tool or model in the image, image not available locally, test harness or environment limits) | 14 |

The gate is checked by `scripts/testkit_gate.py` in the workbench repository. It reads the checked-in matrix (`docs/testing/v0.9.2-matrix.csv`) and the plugin manifests, and passes only when every analysis plugin has a verdict or an exclusion and no enabled plugin has an unfixed placeholder-result or stub verdict.

In total, 51 plugins were found returning placeholder, random or built-in output. That includes success reported on a missing input. Of these, 26 are fixed, 7 now refuse, and 18 are disabled.

### Fixes worth naming

- **Differential abundance:** adjusted p-values now apply the Benjamini–Hochberg step-up correctly (omnibioai-workbench#960). The previous calculation could report a result as roughly ten times less significant than it was.
- **ATAC differential accessibility** runs on a rebuilt image that contains its fix. The previously published image predated the corrected p-value adjustment (omnibioai-workbench#961, #931).
- **LLM-based plugins report an error when the language model is unavailable.** Several used to return generic template text when the model failed or answered with nothing. They now fail with "LLM unavailable" (omnibioai-workbench#972, #976).

### Platform

- **Testkit:** amd64 emulation runs x86-64-only plugin images on ARM64 hosts, and an LLM fixture serves recorded language-model answers, so LLM-based plugins can be tested without network access (omnibioai-workbench#963).
- **Plugin image references are checked.** CI checks that every declared image reference follows the naming convention, and the references were resolved against the registry. Five plugins were moved to their published images (omnibioai-workbench#961).
- **Disabled plugins are hidden and refused everywhere.** A disabled plugin does not appear in menus or the planner catalogue, and every run path refuses it with its reason: the plugin page, the API, workflows and the agent.

### Security and operations

- Database account hardening.
- Audit-trail integrity safeguards.
- Credential rotation.
- Improved recovery after an unexpected power loss.

## Behaviour changes

- Disabled plugins, workflow steps that now refuse, and plugins that now fail on missing input are listed under **Breaking changes** at the top of this file.
- Use `rnaseq_analysis` for DESeq2 while `deseq2_analysis` is rebuilt.
- GPU-backed machine-learning plugins require the GPU-job permission (`users.submit_gpu_job`). An administrator grants it per user.

## Qualification summary

To be recorded from the exact release commit before tagging:

- Electron authentication/security tests.
- Full UI suite.
- Desktop renderer and web/PWA builds.
- Dependency audit (full and production-only).
- Installer integrity: every published file matches `SHA256SUMS-v0.9.2-beta.txt`.
- AppImage isolated process/runtime initialization.
- The workbench testkit gate (`scripts/testkit_gate.py`) passes on the workbench commit that ships with this release.

## Known issues

Read the attached `KNOWN_ISSUES_V0.9.2_BETA.md` before installing. It lists the disabled plugins by reason, the plugins that need GPU permission or reference data, and the items carried over from v0.9.1-beta. **The BioRepository is still not ready for protected health information.** This prerelease is intended for evaluation and does not claim production, regulatory, or HIPAA qualification.

**Full Changelog**: https://github.com/OmniBioAI/omnibioai-studio/compare/v0.9.1-beta...v0.9.2-beta
