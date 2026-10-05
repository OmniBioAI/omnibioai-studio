import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@omnibioai/ui";
import * as api from "../../lib/securityApi";
import { getSessionVersion, getToken, onSessionChange } from "../../lib/session";

function errorMessage(error) {
  if (error.mfaMessage) return error.mfaMessage;
  if (error.status === 404) return "This MFA device no longer exists. Refresh the device list.";
  if (error.status === 403) return "This action is not permitted for your session.";
  if (error.status === 422) return "Check the verification code and try again.";
  if (error.status === 429) return "Too many requests. Wait before trying again.";
  return "Unable to update MFA. Please try again.";
}

// Parsing is local only: the URI is never navigated to, persisted, or used as
// an image URL. IAM currently issues SHA1 / six-digit / 30-second TOTP.
function setupFrom(response) {
  const uri = new URL(response.otpauth_uri);
  const secret = uri.searchParams.get("secret");
  if (uri.protocol !== "otpauth:" || uri.hostname !== "totp" || !secret || !Number.isInteger(response.device_id)) {
    throw new Error("Invalid enrollment response");
  }
  return { deviceId: response.device_id, secret };
}

export default function MfaManagement({ currentUser, devices, onChanged }) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  if (!currentUser || !getToken()) return null;
  return <MfaSession key={`${version}:${currentUser.userId}:${currentUser.orgId}`} version={version}
    devices={devices} onChanged={onChanged} />;
}

function MfaSession({ version, devices, onChanged }) {
  const token = getToken();
  const alive = useRef(true);
  const operation = useRef(0);
  const locked = useRef(false);
  const verificationAttempted = useRef(false);
  const [flow, setFlow] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [device, setDevice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef(null);
  const container = useRef(null);

  const current = () => alive.current && version === getSessionVersion() && token === getToken();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; operation.current += 1; };
  }, []);

  const open = flow !== null;
  const destructivePending = busy && (flow === "remove" || (flow === "recovery" && remaining !== null));
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    const element = dialog.current;
    element.showModal();
    return () => {
      element.close();
      if (trigger?.isConnected) trigger.focus();
      else container.current?.focus();
    };
  }, [open]);

  function clear() {
    operation.current += 1;
    locked.current = false;
    setBusy(false);
    setSetup(null);
    setCode("");
    setCodes(null);
    setDevice(null);
    setRemaining(null);
    setFlow(null);
    setError("");
    setNotice("");
    verificationAttempted.current = false;
  }

  async function run(action, accept) {
    if (locked.current || !current()) return;
    locked.current = true;
    const id = ++operation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (current() && id === operation.current) accept(result);
    } catch (failure) {
      if (current() && id === operation.current) {
        if (failure.mfaTerminal) { setSetup(null); setCode(""); onChanged(); }
        setError(errorMessage(failure));
      }
    } finally {
      if (current() && id === operation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }

  function enroll() {
    setFlow("enroll");
    run(api.startMfaEnrollment, result => {
      if (result) {
        setSetup(setupFrom(result));
        verificationAttempted.current = false;
      }
    });
  }

  function verify(event) {
    event.preventDefault();
    verificationAttempted.current = true;
    const enteredCode = code;
    setCode("");
    run(() => api.verifyMfaEnrollment(setup.deviceId, enteredCode), result => {
      if (!result?.verified_at) throw new Error("Verification not confirmed");
      clear();
      onChanged();
    });
  }

  function dismiss() {
    const pendingId = setup?.deviceId;
    const attempted = verificationAttempted.current;
    clear();
    // DELETE supports pending devices too. If start is still in flight, no ID
    // is known: IAM replaces abandoned pending enrollment on the next start.
    // Verification can commit even when its response is lost. Never silently
    // delete a possibly active authenticator when dismissing that flow.
    if (attempted) onChanged();
    else if (pendingId && current()) {
      run(() => api.removeMfaDevice(pendingId), () => onChanged());
    }
  }

  function manageRecovery() {
    setFlow("recovery");
    run(api.getRecoveryCodeStatus, result => {
      if (!Number.isInteger(result?.remaining) || result.remaining < 0) throw new Error("Invalid recovery status");
      setRemaining(result.remaining);
    });
  }

  function issueCodes() {
    run(remaining === 0 ? api.generateRecoveryCodes : api.regenerateRecoveryCodes, result => {
      if (!Array.isArray(result?.codes) || !result.codes.length || result.codes.some(value => typeof value !== "string" || !value)) {
        throw new Error("Invalid recovery response");
      }
      setCodes(result.codes);
    });
  }

  function remove() {
    run(() => api.removeMfaDevice(device.id), () => {
      clear();
      onChanged();
    });
  }

  async function copy(value) {
    const id = operation.current;
    try {
      await navigator.clipboard.writeText(value);
      if (current() && id === operation.current) setNotice("Copied");
    } catch (_) {
      if (current() && id === operation.current) setNotice("Copy unavailable. Select and copy the text manually.");
    }
  }

  return (
    <div ref={container} tabIndex={-1} className="mfa-management sentry-block" data-sentry-block="true">
      {devices && <>
        {devices.map(item => <div className="security-row" key={item.id}>
          <div><strong>{item.label || item.device_type}</strong><span>Device {item.id} · {item.verified_at ? "Verified" : "Awaiting verification"}</span>
            {item.created_at && <span>Added {item.created_at}</span>}
            {item.last_used_at && <span>Last used {item.last_used_at}</span>}</div>
          <Button variant="danger" size="sm" disabled={busy} onClick={() => { setDevice(item); setError(""); setFlow("remove"); }}>Remove</Button>
        </div>)}
        <div className="mfa-actions">
          <Button variant="secondary" size="sm" disabled={busy} onClick={enroll}>Add authenticator</Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={manageRecovery}>Manage recovery codes</Button>
        </div>
      </>}
      {!open && error && <p role="alert">{error}</p>}
      {open && <dialog ref={dialog} className="mfa-dialog sentry-block" data-sentry-block="true"
        aria-labelledby="mfa-dialog-title" aria-describedby="mfa-dialog-description"
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll(":is(button, input):not(:disabled)");
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}
        onCancel={event => {
          event.preventDefault();
          if (codes) setNotice("Save your codes, then choose I have saved my codes to close.");
          else if (destructivePending) setNotice("Wait for this update to finish.");
          else dismiss();
        }}>
        <h3 id="mfa-dialog-title">{flow === "enroll" ? "Add authenticator" : flow === "remove" ? "Remove authenticator" : "Recovery codes"}</h3>
        <p id="mfa-dialog-description">{flow === "enroll" ? "Add a time-based account in your authenticator app, then verify its six-digit code."
          : flow === "remove" ? "Removing the last verified authenticator disables personal MFA."
          : "Recovery codes can each be used once to sign in when your authenticator is unavailable."}</p>
        {busy && <p role="status">Updating MFA…</p>}
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {flow === "enroll" && <>
          {setup ? <form onSubmit={verify} autoComplete="off">
            <p>Manual setup: SHA1, 6 digits, 30 seconds.</p>
            <p>This setup key is only available during this enrollment.</p>
            <code className="mfa-secret">{setup.secret}</code>
            <button type="button" className="omni-btn omni-btn--secondary omni-btn--sm" onClick={() => copy(setup.secret)}>Copy setup key</button>
            <label htmlFor="mfa-verification">Verification code</label>
            <input id="mfa-verification" className="studio-field security-key-input" value={code} onChange={event => setCode(event.target.value)}
              inputMode="numeric" autoComplete="off" maxLength={6} pattern="[0-9]{6}" required disabled={busy} />
            <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={busy || !/^[0-9]{6}$/.test(code)}>Verify authenticator</button>
          </form> : !busy && <Button variant="secondary" onClick={enroll}>Retry enrollment</Button>}
        </>}
        {flow === "remove" && <>
          <p>Remove {device.label || device.device_type} (device {device.id})?</p>
          <Button variant="danger" disabled={busy} onClick={remove}>Confirm removal</Button>
        </>}
        {flow === "recovery" && <>
          {codes ? <>
            <p><strong>Save these recovery codes now. They will not be shown again.</strong></p>
            <pre className="mfa-secret">{codes.join("\n")}</pre>
            <Button variant="secondary" onClick={() => copy(codes.join("\n"))}>Copy all</Button>
            <Button variant="primary" onClick={clear}>I have saved my codes</Button>
          </> : remaining !== null ? <>
            <p>{remaining} unused recovery codes.</p>
            <p>Generating new codes invalidates all previous unused codes. Continue only when you can save the new codes.</p>
            <Button variant="danger" disabled={busy} onClick={issueCodes}>{remaining === 0 ? "Generate recovery codes" : "Regenerate recovery codes"}</Button>
          </> : !busy && <Button variant="secondary" onClick={manageRecovery}>Retry recovery status</Button>}
        </>}
        {!codes && <Button variant="ghost" disabled={destructivePending} onClick={dismiss}>Cancel</Button>}
      </dialog>}
    </div>
  );
}
