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

Developer:
    Manish Kumar <manish@omnibioai.org>
"""

import os
import time
import pytest
import requests

from conftest import TES_DIRECT_URL, TIMEOUT

BASE = TES_DIRECT_URL
TES_TOKEN = os.getenv("OMNIBIOAI_TES_TOKEN", "")

# echo_test is a lightweight built-in TES tool that always succeeds
ECHO_TOOL_ID = "echo_test"
ECHO_TEXT = "hello from integration test"

# How long to wait for a run to finish (seconds)
RUN_TIMEOUT = int(60)
POLL_INTERVAL = 2
TERMINAL_STATES = {"COMPLETE", "COMPLETED", "FAILED", "ERROR", "CANCELLED"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get(path: str) -> requests.Response:
    headers = {"Authorization": f"Bearer {TES_TOKEN}"} if TES_TOKEN else {}
    return requests.get(f"{BASE}{path}", headers=headers, timeout=TIMEOUT)


def _post(path: str, body: dict) -> requests.Response:
    headers = {"Authorization": f"Bearer {TES_TOKEN}"} if TES_TOKEN else {}
    return requests.post(f"{BASE}{path}", json=body, headers=headers, timeout=TIMEOUT)


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
    """TES /health responds 200 with ok set to true."""
    def test_health_returns_200(self):
        """GET /health on TES returns HTTP 200."""
        r = _get("/health")
        assert r.status_code == 200

    def test_health_body_ok_true(self):
        """The TES /health body has ok set to true."""
        r = _get("/health")
        assert r.json()["ok"] is True


# ── Tools registry ────────────────────────────────────────────────────────────

class TestTesTools:
    """The TES tool registry at /api/tools lists tools, including the built-in echo_test
    tool."""
    def test_list_tools_returns_200(self):
        """GET /api/tools returns HTTP 200."""
        r = _get("/api/tools")
        assert r.status_code == 200

    def test_list_tools_returns_list(self):
        """The /api/tools response body is a list."""
        r = _get("/api/tools")
        assert isinstance(r.json(), list)

    def test_list_tools_not_empty(self):
        """The /api/tools list contains at least one tool."""
        r = _get("/api/tools")
        assert len(r.json()) > 0

    def test_echo_test_tool_is_registered(self):
        """echo_test is among the tool ids registered with TES."""
        r = _get("/api/tools")
        tool_ids = {t.get("tool_id") or t.get("id", "") for t in r.json()}
        assert ECHO_TOOL_ID in tool_ids, (
            f"'{ECHO_TOOL_ID}' not found in tools: {tool_ids}"
        )

    def test_each_tool_has_tool_id_field(self):
        """Every registered tool entry has a tool_id or id field."""
        r = _get("/api/tools")
        for tool in r.json():
            assert "tool_id" in tool or "id" in tool


class TestTesAuthentication:
    """TES run submission is protected: a request without a token is rejected."""
    def test_submit_without_token_is_protected(self):
        """POST /api/runs/submit with no bearer token returns 401 or 403."""
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
            timeout=TIMEOUT,
        )
        assert r.status_code in (401, 403)


# ── Runs list ─────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not TES_TOKEN, reason="OMNIBIOAI_TES_TOKEN is not configured")
class TestTesRunsList:
    """GET /api/runs with the OMNIBIOAI_TES_TOKEN bearer token; skipped when the token
    is not configured."""
    def test_list_runs_returns_200(self):
        """An authenticated GET /api/runs returns HTTP 200."""
        r = _get("/api/runs")
        assert r.status_code == 200

    def test_list_runs_returns_list(self):
        """The /api/runs response body is a list or an object."""
        r = _get("/api/runs")
        data = r.json()
        assert isinstance(data, (list, dict))


# ── Submit run ────────────────────────────────────────────────────────────────

@pytest.mark.skipif(not TES_TOKEN, reason="OMNIBIOAI_TES_TOKEN is not configured")
class TestTesSubmit:
    """POST /api/runs/submit with the TES token: a valid echo_test submission, and
    rejection of an unknown tool or a missing tool_id. Successful submissions create
    runs on the live TES service. Skipped when the token is not configured."""
    def test_submit_echo_test_returns_200(self):
        """Submitting an echo_test run returns HTTP 200."""
        r = _post(
            "/api/runs/submit",
            {"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
        )
        assert r.status_code == 200

    def test_submit_echo_test_returns_run_id(self):
        """The submit response includes a non-empty run_id."""
        r = _post(
            "/api/runs/submit",
            {"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
        )
        data = r.json()
        assert "run_id" in data
        assert data["run_id"]

    def test_submit_unknown_tool_returns_error(self):
        """Submitting an unknown tool_id returns 400, 404 or 422."""
        r = _post(
            "/api/runs/submit",
            {"tool_id": "nonexistent_tool_xyz", "inputs": {}, "resources": {}},
        )
        assert r.status_code in (400, 404, 422)

    def test_submit_missing_tool_id_returns_422(self):
        """Submitting a body with no tool_id returns 422."""
        r = _post("/api/runs/submit", {"inputs": {}, "resources": {}})
        assert r.status_code == 422


# ── Poll run status ───────────────────────────────────────────────────────────

@pytest.mark.skipif(not TES_TOKEN, reason="OMNIBIOAI_TES_TOKEN is not configured")
class TestTesRunStatus:
    """GET /api/runs/{run_id} for a submitted run and for a nonexistent run. Skipped
    when the TES token is not configured."""
    @pytest.fixture(scope="class")
    def submitted_run(self):
        """Class-scoped fixture: submits one echo_test run with the TES token and
        returns its JSON, raising on a non-2xx response."""
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
            headers={"Authorization": f"Bearer {TES_TOKEN}"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        return r.json()

    def test_get_run_by_id_returns_200(self, submitted_run):
        """GET /api/runs/{run_id} for a just-submitted run returns HTTP 200."""
        run_id = submitted_run["run_id"]
        r = _get(f"/api/runs/{run_id}")
        assert r.status_code == 200

    def test_get_run_contains_state_field(self, submitted_run):
        """The run detail response includes a state field."""
        run_id = submitted_run["run_id"]
        r = _get(f"/api/runs/{run_id}")
        assert "state" in r.json()

    def test_get_nonexistent_run_returns_404(self):
        """GET /api/runs/{run_id} for a nonexistent run id returns 404."""
        r = _get("/api/runs/run-does-not-exist-xyz")
        assert r.status_code == 404


# ── Full end-to-end: submit → wait → COMPLETE ────────────────────────────────

@pytest.mark.skipif(not TES_TOKEN, reason="OMNIBIOAI_TES_TOKEN is not configured")
class TestTesEndToEnd:
    """Submit echo_test runs and poll them to a terminal state, then fetch logs and
    results. Skipped when the TES token is not configured."""
    def test_echo_test_completes_successfully(self):
        """A submitted echo_test run reaches the state COMPLETED within the 60-second
        polling limit."""
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": ECHO_TEXT}, "resources": {}},
            headers={"Authorization": f"Bearer {TES_TOKEN}"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        run_id = r.json()["run_id"]

        final = _poll_run(run_id)
        assert final["state"] == "COMPLETED", (
            f"Expected COMPLETED, got {final['state']}. Run data: {final}"
        )

    def test_completed_run_logs_available(self):
        """Once an echo_test run reaches a terminal state, GET /api/runs/{run_id}/logs
        returns 200 or 204."""
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": "log check"}, "resources": {}},
            headers={"Authorization": f"Bearer {TES_TOKEN}"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        run_id = r.json()["run_id"]

        _poll_run(run_id)

        r2 = _get(f"/api/runs/{run_id}/logs")
        assert r2.status_code in (200, 204)

    def test_completed_run_results_available(self):
        """Once an echo_test run reaches a terminal state, GET
        /api/runs/{run_id}/results returns 200 or 204."""
        r = requests.post(
            f"{BASE}/api/runs/submit",
            json={"tool_id": ECHO_TOOL_ID, "inputs": {"message": "result check"}, "resources": {}},
            headers={"Authorization": f"Bearer {TES_TOKEN}"},
            timeout=TIMEOUT,
        )
        r.raise_for_status()
        run_id = r.json()["run_id"]

        _poll_run(run_id)

        r2 = _get(f"/api/runs/{run_id}/results")
        assert r2.status_code in (200, 204)
