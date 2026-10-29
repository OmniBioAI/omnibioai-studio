# Secure NAS SFTP owner runbook

Status: implementation ready; disabled by default; no live NAS connection has
been attempted by this workstream.

## Security boundary

Studio reuses Workbench's File Transfer Manager. The `nas_sftp` backend is a
managed-storage backend: IAM resolves the authenticated organization and user,
and the server derives
`tenants/<organization>/users/<user>/file-transfer-manager/<logical-key>`.
Clients may select `nas_sftp` as a configured backend but cannot supply a host,
port, username, key path, known-hosts path, or absolute destination. The normal
storage ledger, checksum verification, transfer lifecycle and audit path remain
authoritative. NAS Primary access does not grant Backup or Archive access.

The integration supports only explicitly configured `list`, `upload`,
`download`, and `delete` operations. Leave `delete` absent unless the approved
product workflow requires it. Uploads use a same-directory temporary object
followed by a verified rename and never overwrite an existing destination.
Symlinks anywhere below the configured root fail closed.

## 1. NAS-side owner action

In UGOS Pro's supported user-management interface, create a dedicated service
account (placeholder: `<studio-transfer-account>`) and a dedicated Primary
transfer directory (placeholder: `<nas-primary-studio-root>`). Grant only the
operations selected for Studio. Do not use `omnibioai-admin`, expose other
shares, grant Backup/Archive write access, change immutable attributes, edit
firmware files, or change `sshd` settings.

Before installing a key, verify through the supported UI or an authorized
maintenance session:

```text
account identity and status
effective home/personal-folder support
effective public-key installation mechanism
forced-command/SFTP restrictions
ownership and permissions of <nas-primary-studio-root>
```

Historical evidence says `/home/omnibioai-admin` was absent and the NAS home
area was immutable. Do not assume `~/.ssh/authorized_keys` works. If this
firmware cannot provision a dedicated SFTP-only account and public key through
a supported interface, stop: the owner must obtain a supported UGOS procedure
or vendor guidance. Do not weaken the appliance.

## 2. DGX credential provisioning

Run these manually as an authorized DGX administrator. Replace placeholders;
the directory must remain outside every repository. Do not pass a passphrase or
private material as a command argument.

```bash
sudo install -d -o root -g root -m 0700 /etc/omnibioai/credentials/nas-sftp
sudo ssh-keygen -t ed25519 \
  -f /etc/omnibioai/credentials/nas-sftp/id_ed25519 \
  -C omnibioai-studio-nas-sftp
sudo chmod 0600 /etc/omnibioai/credentials/nas-sftp/id_ed25519
sudo chmod 0644 /etc/omnibioai/credentials/nas-sftp/id_ed25519.pub
sudo ssh-keygen -lf /etc/omnibioai/credentials/nas-sftp/id_ed25519.pub
```

Provide only the `.pub` file to the NAS owner. After supported manual
installation, compare `ssh-keygen -lf` output for the installed public key with
the DGX output. Never copy, print, commit, or put the private key in `.env`.
If an existing dedicated key is proposed, inspect only `stat` metadata and its
public-key fingerprint; do not overwrite or rotate it without authorization.

## 3. Pin the NAS host identity

Obtain the NAS SSH host-key fingerprint from an independent trusted
administrative channel (UGOS console/vendor-supported admin view), not from the
first application connection. Separately observe the offered key, compare the
fingerprints, and only after an exact match create a dedicated file:

```bash
sudo install -o root -g root -m 0644 /dev/null \
  /etc/omnibioai/credentials/nas-sftp/known_hosts
# Insert the verified host key record manually; do not invent or TOFU a value.
sudo ssh-keygen -F '<verified-host>' \
  -f /etc/omnibioai/credentials/nas-sftp/known_hosts
sudo ssh-keygen -lf /etc/omnibioai/credentials/nas-sftp/known_hosts
```

For a non-default port, the record must use `[host]:port`. A missing or changed
key is a hard failure. Never automatically replace the pinned record and never
use `StrictHostKeyChecking=no`.

## 4. Runtime configuration

Set non-secret values and host file references in the deployment environment:

```text
NAS_SFTP_ENABLED=false
NAS_SFTP_HOST=<verified-current-host-or-address>
NAS_SFTP_PORT=22
NAS_SFTP_USERNAME=<studio-transfer-account>
NAS_SFTP_PRIVATE_KEY_HOST_PATH=/etc/omnibioai/credentials/nas-sftp/id_ed25519
NAS_SFTP_KNOWN_HOSTS_HOST_PATH=/etc/omnibioai/credentials/nas-sftp/known_hosts
NAS_SFTP_REMOTE_ROOT=<nas-primary-studio-root>
NAS_SFTP_CONNECT_TIMEOUT=5
NAS_SFTP_OPERATION_TIMEOUT=15
NAS_SFTP_ALLOWED_OPERATIONS=list,upload,download
```

The historical address `192.168.86.24` is not a default and must be verified
before use. Keep `NAS_SFTP_ENABLED=false` until account, destination,
permissions, public-key fingerprint, and host-key fingerprint are all verified.

After that review, set it true and explicitly include the opt-in overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.nas-sftp.yml config
docker compose -f docker-compose.yml -f docker-compose.nas-sftp.yml up -d --build workbench
```

This implementation workstream does not authorize running those commands.

## 5. Verification and readiness

Startup validates configuration and file ownership/modes. When enabled it makes
a bounded, read-only authenticated SFTP check and lists the configured root; it
does not upload test data. Failure categories are `configuration`,
`host_identity`, `authentication`, or `network_or_operation`. The rest of
Studio starts, while `nas_sftp` reports unavailable through the authenticated
File Transfer Manager health response. Authentication and host-key failures are
not retried; temporary failures use bounded exponential backoff with jitter.

After readiness is `ready`, use an authorized non-production tenant workflow
to upload and download a harmless owner-approved test object. Confirm the
transfer record reports matching size/checksum, the audit trail contains the
transfer ID/logical destination/bytes/outcome, and another tenant receives a
not-found/ownership denial. Do not use production NAS data for qualification.

## 6. Rotation, revocation, troubleshooting

For rotation, provision a second dedicated key through the supported NAS
mechanism, verify its fingerprint, schedule a controlled service restart using
the replacement read-only mount, verify strict-host-key health and an authorized
test transfer, then revoke the old public key. Do not overwrite the old private
key in place. For revocation, disable `NAS_SFTP_ENABLED`, stop NAS-dependent
workflows, revoke the service public key in UGOS, and retain audit records.

- `configuration`: check required names, absolute dedicated root, operation
  allowlist, regular-file ownership, key mode `0600`, and known-hosts mode
  `0644` or stricter.
- `host_identity`: stop and compare the new fingerprint through the trusted
  channel; do not update the pin merely because a connection presents it.
- `authentication`: verify the dedicated account, installed public-key
  fingerprint, supported home/key backend, and forced-command compatibility.
- `network_or_operation`: verify routing/firewall state with the infrastructure
  owner, timeouts, root existence, and least-privilege directory permissions.

