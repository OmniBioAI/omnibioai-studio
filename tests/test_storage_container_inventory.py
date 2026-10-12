"""storage_container_inventory: one valid JSON document under every condition.

A fake `docker` executable (driven by a per-test scenario file) stands in for
the daemon; its successful `exec` runs the real inner walker over a temporary
tree, so payload output is genuine. Nothing touches live Docker.
"""
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PY = ROOT / "scripts" / "storage_container_inventory.py"
SH = ROOT / "scripts" / "storage_container_inventory.sh"
JUNK_STDERR = 'Error: "quoted" \\ back\\slash\nnewline {"json":"looking"} \x07 SECRET_TOKEN=abc123'

FAKE_DOCKER = r'''#!PYTHON
import json, os, subprocess, sys
scenario = json.load(open(os.environ["FAKE_DOCKER_SCENARIO"]))
junk = scenario.get("stderr", "")
args = sys.argv[1:]
log = scenario.get("log")
if log:
    with open(log, "a") as handle:
        handle.write(json.dumps(args) + "\n")
def fail(rc):
    sys.stderr.write(junk); sys.exit(rc)
if args[0] == "ps":
    service = [a for a in args if a.startswith("label=")][0].split("=", 2)[2]
    spec = scenario["ps"].get(service, {"ids": []})
    if spec.get("rc"): fail(spec["rc"])
    print("\n".join(spec["ids"]))
elif args[0] == "inspect":
    spec = scenario["inspect"][args[1]]
    if spec.get("rc"): fail(spec["rc"])
    sys.stdout.write(spec["raw"] if "raw" in spec else json.dumps([spec["doc"]]))
elif args[0] == "exec":
    spec = scenario["exec"][args[2]]
    inner = sys.stdin.read()
    if spec.get("rc"): fail(spec["rc"])
    if "stdout" in spec:
        sys.stdout.write(spec["stdout"]); sys.exit(0)
    env = {"FTM_LOCAL_ROOT": spec["root"]} if spec.get("root") else {}
    sys.exit(subprocess.run([sys.executable, "-I", "-c", inner], env=env).returncode)
else:
    fail(99)
'''


def doc(name, *, env=(), labels=None, mounts=None, started="2026-10-11T09:00:44.123Z"):
    return {"Name": "/" + name, "State": {"StartedAt": started},
            "Config": {"Env": list(env), "Labels": labels if labels is not None else {"com.docker.compose.project": "studio"}},
            "Mounts": mounts or [], "HostConfig": {"Binds": ["/secret/host:/x"]}}


@pytest.fixture
def run(tmp_path):
    fake = tmp_path / "bin" / "docker"
    fake.parent.mkdir()
    fake.write_text(FAKE_DOCKER.replace("PYTHON", sys.executable))
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)

    def _run(scenario, *extra, via_shell=False):
        scenario.setdefault("stderr", JUNK_STDERR)
        scenario.setdefault("log", str(tmp_path / "docker-calls.log"))
        path = tmp_path / "scenario.json"
        path.write_text(json.dumps(scenario))
        env = {**os.environ, "FAKE_DOCKER_SCENARIO": str(path), "PATH": f"{fake.parent}{os.pathsep}{os.environ['PATH']}"}
        env.pop("DOCKER", None)
        cmd = ["bash", str(SH), *extra] if via_shell else [sys.executable, str(PY), *extra]
        proc = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=120)
        return proc, (json.loads(proc.stdout) if proc.stdout.strip() else None)
    return _run


def assert_single_valid_document(proc):
    report = json.loads(proc.stdout)  # whole stdout must be exactly one JSON value
    decoder = json.JSONDecoder()
    value, end = decoder.raw_decode(proc.stdout.strip())
    assert end == len(proc.stdout.strip()) and value == report
    assert "SECRET_TOKEN" not in proc.stdout and "quoted" not in proc.stdout  # raw stderr never copied
    assert proc.stdout.isascii()
    return report


def tree_with_payload(tmp_path):
    root = tmp_path / "local"
    (root / "storage-ledger" / "a1").mkdir(parents=True)
    (root / "storage-ledger" / "a1" / "payload").write_bytes(b"PAYLOAD-CONTENT")
    return str(root)


def test_no_matching_containers(run):
    proc, report = run({"ps": {}, "inspect": {}, "exec": {}})
    assert_single_valid_document(proc)
    assert proc.returncode == 1 and report["status"] == "partial" and report["containers"] == []
    assert report["services"] == {"workbench": {"containers_found": 0}, "celery-worker": {"containers_found": 0}}
    assert {(e["code"], e["service"]) for e in report["errors"]} == {("no_matching_container", "workbench"), ("no_matching_container", "celery-worker")}


@pytest.mark.parametrize("via_shell", [False, True], ids=["python", "shell-entry-point"])
def test_missing_optional_env_does_not_stop_inventory(run, tmp_path, via_shell):
    # The original failure: celery-worker sets none of the allowlisted keys, so
    # `grep` matched nothing and set -euo pipefail aborted mid-document.
    root = tree_with_payload(tmp_path)
    proc, report = run({
        "ps": {"workbench": {"ids": ["wb1"]}, "celery-worker": {"ids": ["cw1"]}},
        "inspect": {"wb1": {"doc": doc("studio-workbench-1", env=["STORAGE_QUOTA_MODE=audit", "DB_PASSWORD=hunter2"])},
                    "cw1": {"doc": doc("studio-celery-worker-1", env=["DB_PASSWORD=hunter2", "CELERY_BROKER_URL=redis://u:p@r"])}},
        "exec": {"wb1": {"root": root}, "cw1": {"root": root}},
    }, via_shell=via_shell)
    assert_single_valid_document(proc)
    assert proc.returncode == 0 and report["status"] == "complete"
    by = {c["service"]: c for c in report["containers"]}
    assert by["workbench"]["storage_env"] == {"STORAGE_QUOTA_MODE": "audit"}
    assert by["celery-worker"]["storage_env"] == {}
    assert by["celery-worker"]["payload_inventory"]["trees"]
    assert "hunter2" not in proc.stdout and "redis://" not in proc.stdout and "/secret/host" not in proc.stdout


def test_docker_inspect_failure(run, tmp_path):
    proc, report = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"rc": 1}},
                        "exec": {"wb1": {"root": tree_with_payload(tmp_path)}}})
    assert_single_valid_document(proc)
    container = report["containers"][0]
    assert container["errors"] == [{"stage": "inspect", "code": "inspect_failed", "exit_code": 1}]
    assert container["payload_inventory"]["trees"]  # other stages still run
    assert proc.returncode == 1


def test_docker_inspect_garbage_output(run):
    proc, report = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"raw": "not json {"}},
                        "exec": {"wb1": {"stdout": "{}"}}})
    assert_single_valid_document(proc)
    assert report["containers"][0]["errors"][0]["code"] == "invalid_inspect_output"


def test_docker_exec_failure(run):
    proc, report = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"doc": doc("wb")}},
                        "exec": {"wb1": {"rc": 1}}})
    assert_single_valid_document(proc)
    container = report["containers"][0]
    assert container["payload_inventory"] is None
    assert container["errors"] == [{"stage": "exec", "code": "exec_failed", "exit_code": 1}]


@pytest.mark.parametrize("rc", [126, 127])
def test_python_unavailable_inside_container(run, rc):
    proc, report = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"doc": doc("wb")}},
                        "exec": {"wb1": {"rc": rc}}})
    assert_single_valid_document(proc)
    assert report["containers"][0]["errors"] == [{"stage": "exec", "code": "python_unavailable", "exit_code": rc}]


def test_exec_returns_non_json(run):
    proc, report = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"doc": doc("wb")}},
                        "exec": {"wb1": {"stdout": "Traceback (most recent call last):\n  oops"}}})
    assert_single_valid_document(proc)
    assert report["containers"][0]["errors"][0]["code"] == "invalid_inventory_output"


def test_docker_ps_failure(run):
    proc, report = run({"ps": {"workbench": {"rc": 1}, "celery-worker": {"ids": []}}, "inspect": {}, "exec": {}})
    assert_single_valid_document(proc)
    assert {"stage": "ps", "code": "ps_failed", "service": "workbench", "exit_code": 1} in report["errors"]
    assert report["services"]["workbench"] == {"containers_found": None}


def test_docker_binary_missing(run, tmp_path):
    scenario = tmp_path / "s.json"
    scenario.write_text("{}")
    env = {**os.environ, "DOCKER": str(tmp_path / "no-such-docker")}
    proc = subprocess.run([sys.executable, str(PY)], env=env, capture_output=True, text=True, timeout=60)
    report = json.loads(proc.stdout)
    assert proc.returncode == 1 and all(e["code"] == "ps_failed" and e["exit_code"] == 127 for e in report["errors"])


def test_multiple_containers(run, tmp_path):
    root = tree_with_payload(tmp_path)
    proc, report = run({
        "ps": {"workbench": {"ids": ["wb1", "wb2"]}, "celery-worker": {"ids": ["cw1"]}},
        "inspect": {i: {"doc": doc(f"studio-{i}")} for i in ("wb1", "wb2", "cw1")},
        "exec": {"wb1": {"root": root}, "wb2": {"rc": 1}, "cw1": {"root": root}},
    })
    assert_single_valid_document(proc)
    assert [(c["service"], c["container_id"]) for c in report["containers"]] == [("workbench", "wb1"), ("workbench", "wb2"), ("celery-worker", "cw1")]
    assert report["services"] == {"workbench": {"containers_found": 2}, "celery-worker": {"containers_found": 1}}
    assert [bool(c["errors"]) for c in report["containers"]] == [False, True, False]
    assert report["status"] == "partial"


def test_special_characters_in_metadata(run, tmp_path):
    weird = 'we"ird\\name\n\t{x}],é☃'
    root = tmp_path / weird.replace("\n", "_").replace("/", "_")
    (root / 'dir "q"').mkdir(parents=True)
    (root / 'dir "q"' / 'file\\with"quotes☃').write_bytes(b"x")
    proc, report = run({
        "ps": {"workbench": {"ids": ["wb1"]}},
        "inspect": {"wb1": {"doc": doc(weird, labels={"com.docker.compose.project": weird}, started=weird,
                                       env=[f"FTM_LOCAL_ROOT={root}", f"STORAGE_QUOTA_MODE={weird}"],
                                       mounts=[{"Type": "bind", "Source": weird, "Destination": "/data/managed", "RW": True, "Driver": "secret"}])}},
        "exec": {"wb1": {"root": str(root)}},
    })
    assert_single_valid_document(proc)
    c = report["containers"][0]
    assert c["container"] == weird and c["project"] == weird and c["started_at"] == weird
    assert c["storage_env"]["STORAGE_QUOTA_MODE"] == weird
    assert c["mounts"] == [{"Type": "bind", "Source": weird, "Destination": "/data/managed", "RW": True}]
    files = [f["relative_path"] for t in c["payload_inventory"]["trees"] for f in t["files"]]
    assert 'dir "q"/file\\with"quotes☃' in files


def test_payload_contents_never_emitted_and_metadata_reported(run, tmp_path):
    proc, report = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"doc": doc("wb")}},
                        "exec": {"wb1": {"root": tree_with_payload(tmp_path)}}})
    assert_single_valid_document(proc)
    assert "PAYLOAD-CONTENT" not in proc.stdout
    tree = next(t for t in report["containers"][0]["payload_inventory"]["trees"] if t["exists"])
    assert tree["file_count"] == 1 and tree["total_bytes"] == 15
    assert tree["files"][0]["relative_path"] == "storage-ledger/a1/payload" and len(tree["files"][0]["sha256"]) == 64


def test_shell_entry_point_and_atomic_output(run, tmp_path):
    out = tmp_path / "reports" / "storage-inventory.json"
    out.parent.mkdir()
    out.write_text("previous report")
    proc, _ = run({"ps": {"workbench": {"ids": ["wb1"]}}, "inspect": {"wb1": {"doc": doc("wb")}},
                   "exec": {"wb1": {"rc": 127}}}, "--output", str(out), via_shell=True)
    assert proc.stdout == ""
    report = json.loads(out.read_text())
    assert report["containers"][0]["errors"][0]["code"] == "python_unavailable"
    assert not list(out.parent.glob(".storage-inventory.*.tmp"))


def test_only_read_only_docker_commands_are_issued(run, tmp_path):
    root = tree_with_payload(tmp_path)
    run({"ps": {"workbench": {"ids": ["wb1"]}, "celery-worker": {"ids": ["cw1"]}},
         "inspect": {"wb1": {"doc": doc("a")}, "cw1": {"rc": 1}},
         "exec": {"wb1": {"root": root}, "cw1": {"rc": 127}}})
    calls = [json.loads(line) for line in (tmp_path / "docker-calls.log").read_text().splitlines()]
    assert {c[0] for c in calls} == {"ps", "inspect", "exec"}
    assert all(c[:2] == ["exec", "-i"] and c[3:] == ["python3", "-"] for c in calls if c[0] == "exec")
    source = PY.read_text(encoding="utf-8")
    inner = source.split("INNER = r'''", 1)[1].split("'''", 1)[0]
    for forbidden in ("remove", "unlink", "rmtree", "rename", "replace(", "chmod", "open(path, \"w", "'w'", '"w"'):
        assert forbidden not in inner, forbidden
