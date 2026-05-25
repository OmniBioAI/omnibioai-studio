"""
test_tes_integration.py — submits a hello-world TES task and checks completion.

TES endpoints (FastAPI, port 8081):
  GET  /health               — liveness probe  → {"ok": true}
  GET  /api/tools            — list registered tools
  POST /api/runs/submit      — submit a run     → {"run_id": "..."}
  GET  /api/runs/{run_id}    — poll run state   → {"state": "COMPLETE"|...}
  GET  /api/runs             — list all runs
  GET  /api/runs/{run_id}/logs    — fetch run logs
  GET  /api/runs/{run_id}/results — fetch run results

The integration test submits an "echo_test" task (a lightweight built-in tool
that just echoes its input without pulling any Docker image) and polls until
the run reaches COMPLETE or FAILED.

Run: pytest tests/integration/test_tes_integration.py -v
"""

import time
import pytest
import requests

from conftest import TES_DIRECT_URL, TIMEOUT

BASE = TES_DIRECT_URL

# echo_test is a lightweight built-in TES tool that always succeeds
ECHO_TOOL_ID = "echo_test"
ECHO_TEXT = "hello from integration test"

# How long to wait for a run to finish (seconds)
RUN_TIMEOUT = int(60)
POLL_INTERVAL = 2
TERMINAL_STATES = {"COMPLETE", "COMPLETED", "FAILED", "ERROR", "CANCELLED"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get(path: str) -> requests.Response:
    return requests.get(f"{BASE}{path}", timeout=TIMEOUT)


def _post(path: str, body: dict) -> requests.Response:
    return requests.post(f"{BASE}{path}", json=body, timeout=TIMEOUT)


def _poll_run(run_id: str) -> dict:
    """Poll /api/runs/{run_id} until a terminal state is reached."""
    deadline = time.time() + RUN_TIMEOUT
    while time.time() < deadline:
        r = _get(f"/api/runs/{run_id}")
        if r.status_code == 200:
            data = r.json()
            state = data.get("state", "")
            if state in TERMINAL_STATES:
                return data
        time.sleep(POLL_INTERVAL)
    pytest.fail(f"Run {run_id} did not reach a terminal state within {RUN_TIMEOUT}s")


# ── Health ────────────────────────────────────────────────────────────────────

class TestTesHealth:
    def test_health_returns_200(self):
        r = _get("/health")
        assert r.status_code == 200

    def test_health_body_ok_true(self):
        r = _get("/health")
        assert r.json()["ok"] is True


# ── Tools registry ────────────────────────────────────────────────────────────

class TestTesTools:
    def test_list_tools_returns_200(self):
        r = _get("/api/tools")
        assert r.status_code == 200

    def test_list_tools_returns_list(self):
        r = _get("/api/tools")
        assert isinstance(r.json(), list)

    def test_list_tools_not_empty(self):
        r = _get("/api/tools")
        assert len(r.json()) > 0

    def test_echo_test_tool_is_registered(self):
        r = _get("/api/tools")
        tool_ids = {t.get("tool_id") or t.get("id", "") for t in r.json()}
        assert ECHO_TOOL_ID in tool_ids, (
            f"'{ECHO_TOOL_ID}' not found in tools: {tool_ids}"
        )

    def test_each_tool_has_tool_id_field(self):
        r = _get("/api/tools")
        for tool in r.json():
            assert "tool_id" in tool or "id" in tool


# ── Runs list ─────────────────────────────────────────────────────────────────

class TestTesRunsList:
    def test_list_runs_returns_200(self):
        r = _get("/api/runs")
        assert r.status_code == 200

    def test_list_runs_returns_list(self):
        r = _get("/api/runs")
        data = r.json()
        assert isinstance(data, (list, dict))


# ── Submit run ────────────────────────────────────────────────────────────────

class TestTesSubmit:
    def test_submit_echo_test_returns_200(self):
        r = _post(
            "/api/runs/submit",
            {"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
        )
        assert r.status_code == 200

    def test_submit_echo_test_returns_run_id(self):
        r = _post(
            "/api/runs/submit",
            {"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
        )
        data = r.json()
        assert "run_id" in data
        assert data["run_id"]

    def test_submit_unknown_tool_returns_error(self):
        r = _post(
            "/api/runs/submit",
            {"tool_id": "nonexistent_tool_xyz", "inputs": {}, "resources": {}},
        )
        assert r.status_code in (400, 404, 422)

    def test_submit_missing_tool_id_returns_422(self):
        r = _post("/api/runs/submit", {"inputs": {}, "resources": {}})
        assert r.status_code == 422


# ── Poll run status ───────────────────────────────────────────────────────────

class TestTesRunStatus:
    @pytest.fixture(scope="class")
    def submitted_run(self):
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()

    def test_get_run_by_id_returns_200(self, submitted_run):
        run_id = submitted_run["run_id"]
        r = _get(f"/api/runs/{run_id}")
        assert r.status_code == 200

    def test_get_run_contains_state_field(self, submitted_run):
        run_id = submitted_run["run_id"]
        r = _get(f"/api/runs/{run_id}")
        assert "state" in r.json()

    def test_get_nonexistent_run_returns_404(self):
        r = _get("/api/runs/run-does-not-exist-xyz")
        assert r.status_code == 404


# ── Full end-to-end: submit → wait → COMPLETE ────────────────────────────────

class TestTesEndToEnd:
    def test_echo_test_completes_successfully(self):
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        run_id = r.json()["run_id"]

        final = _poll_run(run_id)
        assert final["state"] == "COMPLETED", (
            f"Expected COMPLETED, got {final['state']}. Run data: {final}"
        )

    def test_completed_run_logs_available(self):
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": "log check"}, "resources": {}},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        run_id = r.json()["run_id"]

        _poll_run(run_id)

        r2 = _get(f"/api/runs/{run_id}/logs")
        assert r2.status_code in (200, 204)

    def test_completed_run_results_available(self):
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": "result check"}, "resources": {}},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        run_id = r.json()["run_id"]

        _poll_run(run_id)

        r2 = _get(f"/api/runs/{run_id}/results")
        assert r2.status_code in (200, 204)
