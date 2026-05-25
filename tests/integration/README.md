# OmniBioAI Integration Tests

End-to-end tests that hit the real running services at `http://localhost` (port 80, via the nginx router) and their direct service ports.

## Prerequisites

- All OmniBioAI services must be running (`docker compose up` from `omnibioai-studio/`)
- Python 3.8+ with `pytest` and `requests` installed

```bash
pip install pytest requests
```

## Quick start

```bash
cd ~/Desktop/machine/omnibioai-studio
./tests/integration/run_integration_tests.sh
```

The shell script performs a pre-flight reachability check, runs all five suites, and exits non-zero if any suite fails.

## Running individual suites

```bash
cd tests/integration

# All suites
pytest . -v

# One suite
pytest test_auth_integration.py -v
pytest test_lims_integration.py -v
pytest test_tes_integration.py -v
pytest test_rag_integration.py -v
pytest test_services_health.py -v

# Stop on first failure
pytest . -v -x

# Show only failures
pytest . --tb=short -q
```

## Test suites

| File | What it covers |
|------|----------------|
| `test_services_health.py` | Health endpoints for all services via nginx and direct ports |
| `test_auth_integration.py` | JWT login → validate → refresh → logout round-trip (auth-service, port 8001) |
| `test_lims_integration.py` | LIMS JWT auth, projects list, samples, me, stats (port 7000) |
| `test_tes_integration.py` | Tool registry, echo_test submission, run polling until COMPLETE (port 8081) |
| `test_rag_integration.py` | Studies list, query API, auth enforcement (port 8090) |

## Shared fixtures (`conftest.py`)

| Fixture | Scope | Description |
|---------|-------|-------------|
| `base_url` | session | `http://localhost` (nginx router) |
| `auth_url` | session | `http://localhost:8001` (auth service direct) |
| `lims_url` | session | `http://localhost:7000` (LIMS direct) |
| `tes_url` | session | `http://localhost:8081` (TES direct) |
| `rag_url` | session | `http://localhost:8090` (RAG direct) |
| `http` | session | `requests.Session` with default timeout |
| `auth_tokens` | session | Logs in to auth service; returns `{access_token, refresh_token}` |
| `access_token` | session | Raw access JWT string |
| `refresh_token` | session | Raw refresh JWT string |
| `auth_headers` | session | `{"Authorization": "Bearer <token>"}` dict |
| `lims_session` | session | Authenticated `requests.Session` for LIMS |
| `rag_headers` | session | `{"Authorization": "Bearer <RAGBIO_API_KEY>"}` dict |

## Environment variables

Override any default with an environment variable before running:

| Variable | Default | Description |
|----------|---------|-------------|
| `OMNIBIOAI_BASE_URL` | `http://localhost` | nginx router base URL |
| `OMNIBIOAI_AUTH_URL` | `http://localhost:8001` | Auth service direct URL |
| `OMNIBIOAI_LIMS_URL` | `http://localhost:7000` | LIMS direct URL |
| `OMNIBIOAI_TES_URL` | `http://localhost:8081` | TES direct URL |
| `OMNIBIOAI_RAG_URL` | `http://localhost:8090` | RAG direct URL |
| `OMNIBIOAI_AUTH_EMAIL` | `admin@omnibioai` | Admin email for auth tests |
| `OMNIBIOAI_AUTH_PASSWORD` | `admin` | Admin password for auth tests |
| `OMNIBIOAI_LIMS_USER` | `man4ish` | LIMS username |
| `OMNIBIOAI_LIMS_PASSWORD` | `root` | LIMS password |
| `RAGBIO_API_KEY` | *(see .env)* | RAG API key |
| `OMNIBIOAI_TEST_TIMEOUT` | `10` | HTTP request timeout in seconds |
| `PYTEST_EXTRA_ARGS` | *(empty)* | Extra flags forwarded to pytest |

Example:

```bash
OMNIBIOAI_AUTH_EMAIL=myuser@example.com \
OMNIBIOAI_AUTH_PASSWORD=mysecret \
pytest test_auth_integration.py -v
```

## Service port reference

| Service | Direct port | nginx path |
|---------|-------------|------------|
| nginx router | 80 | `/_health` |
| auth-service | 8001 | `/_svc/auth/` |
| workbench | 8000 | `/` |
| LIMS | 7000 | `/_svc/lims/` |
| TES | 8081 | `/_svc/tes/` |
| RAG | 8090 | `/_svc/rag/` |
| API gateway | 8080 | `/_svc/gateway/` |
| policy-engine | 8002 | `/_svc/policy/` |
| hpc-policy | 8003 | `/_svc/hpc/` |
| security-audit | 8004 | `/_svc/audit/` |
| control-center | 7070 | `/_svc/control/` |
| toolserver | 9090 | `/_svc/toolserver/` |
| model-registry | 8095 | `/_svc/modelregistry/` |
| workflow-bundles | 8098 | `/_svc/workflows/` |
| OPA | 8181 | `/_svc/opa/` |
| Grafana | 3000 | `/_svc/monitor/` |

## Notes on the TES echo_test

The TES end-to-end tests submit an `echo_test` run. This tool is registered in
`configs/tools.example.yaml` and executes locally without pulling any Docker or
Singularity image, so it should complete within seconds. If your environment
requires a different lightweight tool, change `ECHO_TOOL_ID` in
`test_tes_integration.py`.

## JUnit XML reports

`run_integration_tests.sh` writes per-suite JUnit XML reports to
`tests/integration/results/`. These can be consumed by CI systems (GitHub
Actions, Jenkins, GitLab CI) for test result visualisation.
