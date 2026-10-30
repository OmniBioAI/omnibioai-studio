# spark-c275 NFS storage guard activation

This change is staged only. It does not install systemd units, remount the NAS,
move data, recreate containers, or deploy an image.

## Required layout and identity

Both Workbench processes use the same bind-mounted NFS tree:

| Purpose | Container and host path |
| --- | --- |
| Legacy/versioned FTM root | `/mnt/nas/omnibioai/tenants/managed` |
| Per-user and per-org root | `/mnt/nas/omnibioai/tenants` |
| Legacy flat object registry payloads | `/mnt/nas/omnibioai/tenants/objects` |
| Object registry index | `/mnt/nas/omnibioai/tenants/object_registry.json` |
| Host health state | `/run/omnibioai/nas-health.json` (read-only in containers) |

The expected NFS source is
`192.168.86.24:/volume1/omnibioai`. The backing UUID is
`f9b2ec0f-7e62-4ee0-85fd-ea0c8d5fbbd5`, read from the existing managed-root
identity marker. NFS activation converts that marker to include
`backing_uuid` and `role: primary`; the original is retained as
`.omnibioai-storage-identity.json.pre-nfs`.

At preparation time the host mount was observed as NFSv3 from the expected
source but **read-only**. Activation must stop until it is deliberately restored
read-write and the health publisher reports `AVAILABLE`.

## Dry-run migration gate

The old Compose paths map `${WORK_DIR}/objects/ftm-local`, `${WORK_DIR}/objects`,
and `${WORK_DIR}/object_registry.json`. Produce and review a plan before any
copy or marker update:

```sh
cd /home/manish/Desktop/omnibioai-ecosystem/omnibioai-studio
python3 scripts/storage_nfs_layout.py \
  --source-work-root "${WORK_DIR}" \
  --tenant-root /mnt/nas/omnibioai/tenants \
  --dry-run \
  --report /var/tmp/omnibioai-storage-nfs-plan.json
```

Confirm every source and destination, confirm the flat UUID object-registry
files remain under `tenants/objects`, and record `plan_sha256`. Applying a plan
requires that exact reviewed hash. It copies without overwriting conflicting
content, verifies SHA-256, retains every source, and is idempotent:

```sh
python3 scripts/storage_nfs_layout.py \
  --source-work-root "${WORK_DIR}" \
  --tenant-root /mnt/nas/omnibioai/tenants \
  --apply \
  --approved-plan-sha256 '<reviewed plan_sha256>' \
  --report /var/tmp/omnibioai-storage-nfs-apply.json
```

Do not run apply when the newly rendered dry-run hash differs from the reviewed
hash. Do not remove the old paths during this release.

The local dry run on 2026-10-29 found 417 object files already aligned because
`${WORK_DIR}/objects` resolves to the existing `tenants/objects` directory. It
planned no copy for those files, one registry-index copy, and one marker update.
This confirms the legacy 38 MB flat object registry stays in place.

## Host health publisher installation

After the NFS mount is read-write, install the staged root-owned files:

```sh
sudo install -D -o root -g root -m 0755 \
  deploy/storage-guard/libexec/omnibioai_nas_health.py \
  /usr/local/libexec/omnibioai/omnibioai_nas_health.py
sudo install -D -o root -g root -m 0644 \
  deploy/storage-guard/systemd/omnibioai-nas-health.service \
  /etc/systemd/system/omnibioai-nas-health.service
sudo install -D -o root -g root -m 0644 \
  deploy/storage-guard/systemd/omnibioai-nas-health.timer \
  /etc/systemd/system/omnibioai-nas-health.timer
sudo systemctl daemon-reload
sudo systemctl enable --now omnibioai-nas-health.timer
sudo systemctl start omnibioai-nas-health.service
```

Verify root ownership, mode, freshness, exact source, and availability:

```sh
sudo systemctl status omnibioai-nas-health.timer --no-pager
stat -c '%U:%G %a %n' /run/omnibioai/nas-health.json
jq . /run/omnibioai/nas-health.json
```

Expected mode is `root:root 644`; `status` is `AVAILABLE`, the primary role is
`ok: true`, and `observed_at_unix` advances every 60 seconds. The service uses
an actual create/write/fsync/read/delete round trip, then publishes JSON by
atomic rename. A read-only, wrong-source, missing, or stale mount publishes
`UNAVAILABLE` and exits nonzero.

## Release and acceptance sequence for the owner

First render Compose and inspect only the two affected services. The two bypass
variables must be absent; the Workbench defaults enable both checks.

```sh
scripts/compose-dgx.sh config --quiet
scripts/compose-dgx.sh config --format json > /var/tmp/omnibioai-compose.json
jq '.services.workbench.environment, .services["celery-worker"].environment' \
  /var/tmp/omnibioai-compose.json
```

Release the Workbench image containing the NFS settings support and sibling
path validation, then recreate `workbench` and `celery-worker` together. After
they are healthy, create missing per-user directories:

```sh
scripts/compose-dgx.sh exec workbench \
  python manage.py storage_tenant_folders --ensure
```

Perform a real authenticated CLI upload with a small unique file and an
existing authorized project, then confirm its marked database key and physical
path are under `tenant_<user_id>`:

```sh
probe="/var/tmp/storage-guard-$(date +%s).txt"
printf 'storage guard acceptance\n' > "${probe}"
python -m omnibioai_cli.main storage upload "${probe}" \
  --project-id '<authorized project id>' --checksum --json
```

For the fail-closed acceptance, use a maintenance window. Stop the worker,
unmount `/mnt/nas/omnibioai`, and leave the Workbench process running only long
enough to attempt the same small upload. It must return HTTP 503 with
`STORAGE_BACKEND_UNAVAILABLE`, create no allocation payload on the container
filesystem, and leave no successful CLI manifest entry. The guard checks both
the cached health statement and the live mount identity, so it fails even if a
recent `AVAILABLE` JSON remains. Remount the exact NFS source read-write,
manually run the health service, require a fresh `AVAILABLE` statement, then
restart both services. Never perform the unmount test during active jobs.

Rollback consists of restoring the previous Compose paths and image while
leaving copied data and original sources intact. Do not delete tenant folders,
the pre-NFS marker backup, or legacy object-registry files during rollback.
