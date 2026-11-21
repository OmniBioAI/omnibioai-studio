# OmniBioAI Studio v0.9.1-beta

OmniBioAI Studio v0.9.1-beta is an evaluation release. It adds the BioRepository: versioned datasets with checksums, lineage, GA4GH DRS identifiers and signed downloads. It also corrects a group of plugins that were reporting results they had not computed, and removes the drug-safety verdicts from the ADMET and toxicity plugins.

### 📦 Downloads

| Platform | Architecture | File |
|---|---|---|
| Linux | x64 | `OmniBioAI.Studio-0.9.1.AppImage` |
| Linux | x64 | `omnibioai-studio_0.9.1_amd64.deb` |
| Linux | x64 | `omnibioai-studio-0.9.1.x86_64.rpm` |
| Linux | ARM64 | `OmniBioAI.Studio-0.9.1-arm64.AppImage` |
| Linux | ARM64 | `omnibioai-studio_0.9.1_arm64.deb` |
| Linux | ARM64 | `omnibioai-studio-0.9.1.aarch64.rpm` |
| macOS | Intel | `OmniBioAI.Studio-0.9.1.dmg` |
| macOS | Apple Silicon | `OmniBioAI.Studio-0.9.1-arm64.dmg` |
| Windows | x64 | `OmniBioAI.Studio.Setup.0.9.1.exe` |

All nine installers are built by GitHub Actions from the `v0.9.1-beta` tag. Check every download against `SHA256SUMS-v0.9.1-beta.txt`. The macOS and Windows installers are unsigned and not notarized.

### 🚀 Quick Start

**Linux (DEB - Ubuntu/Debian):**
```bash
sudo dpkg -i omnibioai-studio_0.9.1_*.deb
omnibioai-studio
```

**Linux (RPM - RHEL/Fedora):**
```bash
sudo rpm -i omnibioai-studio-0.9.1.*.rpm
omnibioai-studio
```

**Linux (AppImage):**
```bash
chmod +x OmniBioAI.Studio-0.9.1*.AppImage
./OmniBioAI.Studio-0.9.1*.AppImage --no-sandbox
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

### BioRepository (Phase 1)

A place to keep the datasets an analysis depends on, with enough record-keeping to say later exactly what was used.

- **Versioned datasets.** A dataset has versions; each version records its files, sizes and a SHA-256 checksum per file. Checksums are verified on ingest and can be re-verified afterwards (omnibioai-workbench#906, #907).
- **Typed datasets.** Genomics, transcriptomics and a generic type validate the files they accept and extract basic metadata, so a dataset's declared type matches its contents (#908).
- **Lineage.** A dataset version records what produced it. Workflow and TES run outputs can be registered against the run that wrote them, so an output traces back to its inputs (#911).
- **GA4GH DRS v1 identifiers.** Every dataset version has a DRS id and is readable through a standard DRS API, served on its own host (#910, omnibioai-studio#296). Clients that speak DRS can resolve an id without knowing about Workbench.
- **Signed, expiring downloads.** File downloads are authorised per request and time-limited; a link is not a permanent public URL.
- **Uploads and register-in-place.** Files can be uploaded, or an existing path registered where it already lives, so large reference data does not have to be copied to be catalogued (#907).
- **Projects and membership.** Datasets belong to projects, and project membership controls who can see them. Samples follow project membership and the datasets a user can read (#909, #946).
- **Access.** Reads require the `biorepo.read` permission; search and listings answer 403 without it rather than returning a filtered page (#937).
- **Backups and restore drills.** The repository database is backed up with hourly binary-log copies, and a restore drill replays a backup into a throwaway container and checks the result. The drill can stop at an exact log position so a point-in-time restore can be verified rather than assumed (#939, #941, #942, #943). Backup capacity and disk are documented (#940).
- Scheduled jobs run on a fixed wall clock so a daylight-saving change does not move or skip them (#938).

### Plugin correctness

Continuing the plugin testkit work from v0.9.0. Each fix below has a regression test that runs on the plugin's own testkit data.

- **Four plugins were producing output that did not depend on their input.** They now compute from the input given, or fail (omnibioai-workbench#944):
  - *Polygenic risk score* read genotypes from the VCF instead of generating them, scores the allele named by the weight file whether it is reference or alternate, and mean-imputes missing calls as PLINK does. It fails when the VCF, the genotypes, the weight file or a matching variant is missing.
  - *GWAS* runs a per-variant association test — ordinary least squares for quantitative traits, logistic regression for binary ones — instead of returning a fixed table. A phenotype file is now required.
  - *Phenotype association* scores a gene against the patient's terms only when it is given the gene-to-phenotype annotations; without them it reports the phenotype columns as unscored instead of claiming a match.
  - *eQTL linking* requires its summary statistics and gene list and fails without them, instead of falling back to built-in example data.
- **The ADMET and toxicity plugins no longer issue safety verdicts.** They previously reported predicted toxicity endpoints (hERG, Ames mutagenicity, drug-induced liver injury, skin sensitisation, carcinogenicity) and an overall `SAFE` / `REVIEW` / `UNSAFE` flag, derived from a short substructure list and two thresholds on computed properties. Checking them against a well-characterised reference compound showed the verdicts did not agree with the published facts for that compound in either direction.

  Those verdicts are removed. The plugins now report what they actually compute: the outcome of each named physicochemical rule, with the rule stated alongside it, and which structural alerts matched, grouped by chemistry. Each output carries a note that these are screening heuristics, not a safety assessment, and that an empty result is not evidence that a compound is safe. Reporting real endpoints needs trained models or assay data, which is tracked as follow-up work (#944, #953).
- **A workflow bundle whose predictions were not reproducible is disabled.** One ADMET workflow bundle computed its property and toxicity numbers with a pseudo-random term, so the same molecule could fall on either side of a threshold between runs. The bundle is disabled rather than adjusted, because the numbers cannot be made meaningful without a model behind them (omnibioai-workflow-bundles#78, #77).
- **Plugin card wording.** The ADMET and toxicity cards in Studio described models and predictions these plugins do not produce. They now describe the rules and alerts they do, and state the limits of each (omnibioai-studio#302).
- A harness fix: a plugin test could read an output file written by an earlier run of a different test. Results are now taken from the run's own declared outputs.

### Security

- **Download tokens are no longer written to logs.** BioRepository signed-download URLs carry a token in the query string; the router redacted it from its access log, and router logs are now rotated with a size and retention limit (omnibioai-studio#301).
- Reads of the repository require an explicit permission, and listings fail closed without it (omnibioai-workbench#937).
- The platform signing-key rotation announced in v0.9.0-beta (2026-11-16) remains in effect. No new rotation ships in v0.9.1-beta, and this release does not end existing sessions.

## Behaviour changes

- **The ADMET and toxicity plugin outputs changed shape.** The `endpoints` block, the `safety_flag` and the ADMET `overall_flag` are gone. Anything reading those fields should read the per-rule outcomes and the matched alert lists instead. The downstream mechanism-analysis and report plugins were updated with them, and the report no longer shows a safety verdict row.
- **The polygenic-score, GWAS, phenotype-association and eQTL plugins now fail on missing input** where they previously returned a result. A pipeline that depended on those results appearing unconditionally will now surface the missing input as a failure.
- **A GWAS run requires a phenotype file**, and a polygenic-score run requires a score-weight file.
- Phenotype association accepts an optional gene-annotation input. Without it the run still completes, with the phenotype columns reported as unscored.
- One ADMET workflow bundle is no longer offered.

## Qualification summary

To be recorded from the exact release commit before tagging:

- Electron authentication/security tests.
- Full UI suite.
- Desktop renderer and web/PWA builds.
- Dependency audit (full and production-only).
- Installer integrity: every published file matches `SHA256SUMS-v0.9.1-beta.txt`.
- AppImage isolated process/runtime initialization.

## Known issues

Read the attached `KNOWN_ISSUES_V0.9.1_BETA.md` before installing. **The BioRepository is not ready for protected health information**; see that file for what is still missing. This prerelease is intended for evaluation and does not claim production, regulatory, or HIPAA qualification.

**Full Changelog**: https://github.com/OmniBioAI/omnibioai-studio/compare/v0.9.0-beta...v0.9.1-beta
