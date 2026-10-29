# UGREEN NAS passwordless SSH setup and verification

**Workstream:** `OMNIBIOAI_UGREEN_NAS_SSH_KEY_AUTH_V1`  
**Status:** BLOCKED  
**Evidence timestamp:** 2026-10-26T03:02:32Z (2026-10-25 22:02:32 CDT)  
**DGX client:** `spark-c275`  
**NAS target:** `192.168.86.24:22`, account `omnibioai-admin`

This is a sanitized SSH access-hardening record. No password, private-key
material, token, or unfiltered SSH debug log is included.

## DGX inspection

| Check | Observed result |
|---|---|
| Host and OS | `spark-c275`; Linux `7.0.0-1019-nvidia`, aarch64; Ubuntu 24.04.5 LTS |
| SSH client | OpenSSH 9.6p1 Ubuntu-3ubuntu13.19, OpenSSL 3.0.13 |
| Private-key metadata only | `~/.ssh/omnibioai_nas_ed25519`: regular file, `0600`, owner `manish:manish`, 419 bytes. Contents were not read. |
| Public-key metadata | `~/.ssh/omnibioai_nas_ed25519.pub`: regular file, `0644`, owner `manish:manish`, 106 bytes |
| Public-key fingerprint | `SHA256:+ZF1f4y/KbvSth7FNsqeqsCkRgBpUzrfbAG07eLcIXY` (ED25519), exactly matching the expected fingerprint |
| SSH client config | `~/.ssh/config` is `0600`; it contains only a `github.com` host block. No NAS block exists. |
| Known-hosts file | `~/.ssh/known_hosts` is `0600`; it contains a hashed ED25519 entry for `192.168.86.24`. |
| Trusted NAS host-key fingerprint | `SHA256:vtjqbJozPBQe+AH4EAwJlb9i504MNLmdu/PYAiwpY7Y` (ED25519) |

The live SSH handshake, with `StrictHostKeyChecking=yes`, reported the same
ED25519 host-key fingerprint and confirmed that the host is known and matches
the stored key. No host-key record was added, removed, or replaced.

## Authentication and NAS capability evidence

The required explicit key-only attempt reached the NAS and offered the
specified DGX key fingerprint. The server advertised `publickey,password`,
rejected the key, and returned:

```text
Permission denied (publickey,password).
```

This proves that the generated key is not currently an effective installed
key. It does not prove a successful password login. The advertised methods
show that public-key authentication is available in the SSH protocol for this
connection, but they do not establish the effective `AuthorizedKeysFile` or
`AuthorizedKeysCommand` backend.

No reusable authenticated SSH control session was present on the DGX. The
password was not requested through Codex and was not placed in a command,
file, environment variable, prompt, or report. Therefore, the NAS account,
home-directory, readable daemon configuration, forced-command wrapper, and
firmware-specific authorization backend could not be re-inspected in this
run. The earlier findings about UID/GID, the missing home directory, and the
wrapper remain historical leads, not current verification.

UGREEN's current documentation describes its supported key setup as enabling
the account's **Personal Folder** in UGOS Pro before creating
`~/.ssh/authorized_keys`. It also warns that UGOS may reset home-directory
permissions after a restart or firmware change, so persistence must be tested.
Sources:

- <https://ai.ugreen.com/blogs/how-to/connect-nas-ssh-root-access>
- <https://nas-de.ugreen.com/blogs/how-to/ssh-schluessel-ugreen-nas>

The documentation supports a home-based route in general, but the installed
firmware's effective daemon settings and this account's supported home state
remain unverified. The mere presence of `sss_ssh_authorizedkeys` is not treated
as evidence that an authorization command is configured.

## Effective SSH settings

| Setting | Current evidence |
|---|---|
| Public-key method | Advertised by the live server; the offered key was rejected |
| Password method | Advertised by the live server; successful password authentication was not re-tested in this run |
| `PubkeyAuthentication` | Consistent with the advertised protocol method, but no authoritative `sshd -T` output obtained |
| `AuthorizedKeysFile` | Unverified |
| `AuthorizedKeysCommand` / user | Unverified |
| `StrictModes` | Unverified |
| `ForceCommand` | Historical lead only; not re-read in this run |
| Account home and ownership | Historical missing-home lead only; not re-verified in this run |

An authorized administrator should first enable or restore the Personal Folder
for `omnibioai-admin` through UGOS Pro's supported user-management interface.
With a password-authenticated maintenance session kept open, the administrator
should then capture the following read-only evidence (substituting the DGX LAN
address for `<DGX_LAN_IP>`):

```bash
id
getent passwd omnibioai-admin
namei -l /home/omnibioai-admin
sudo /usr/sbin/sshd -T \
  -C user=omnibioai-admin,host=192.168.86.24,addr=<DGX_LAN_IP> \
  | grep -Ei '^(pubkeyauthentication|authorizedkeysfile|authorizedkeyscommand|authorizedkeyscommanduser|strictmodes|forcecommand) '
```

Do not install the key until that output establishes the effective backend and
the Personal Folder exists with supported ownership. After those facts are
known, install only the public key whose fingerprint is recorded above, record
before/after permissions, keep the maintenance session open, and run the two
required key-only tests plus identity checks. Re-test after a NAS restart or
firmware update to resolve persistence.

## Changes and verification state

- NAS files/settings changed: **NONE**.
- DGX SSH files/settings changed: **NONE**.
- Repository change: this sanitized evidence report only.
- Optional `~/.ssh/config` alias: not added because key-only authentication has
  not passed twice.
- Key-only authentication: **FAILED** once with exit status 255; no password
  prompt was permitted by the test options.
- Repeatability, remote `id`/`whoami`, forced-command compatibility: unverified.
- Password route: preserved because no NAS authentication or SSH setting was
  changed; current successful usability was not re-proven.
- Rollback: none required because no NAS or SSH client configuration changed.

## Where we stand

- **Overall status:** BLOCKED.
- **Readiness:** 35%. Client key identity, permissions, server reachability,
  live host identity, and the negative key-only baseline are verified. The
  server authorization backend, supported home state, installation, two
  successful key-only logins, remote identity, wrapper behavior, password
  fallback, and persistence remain unverified.
- **Next priority:** use UGOS Pro to enable/restore the Personal Folder for
  `omnibioai-admin`, then run the read-only effective-configuration command
  above in an authorized administrator maintenance session.
