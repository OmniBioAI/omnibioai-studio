import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Card, Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "../components/PreferencesProvider";
import { getSessionVersion, onSessionChange } from "../lib/session";
import { getNotificationMetadata, getNotificationPreferences, getNotifications, getUnreadNotificationCount,
  markNotificationRead, updateNotificationPreferences, NOTIFICATION_GROUPS, PAGE_SIZE } from "../lib/notificationsApi";
import "./AccountNotifications.css";

const label = value => value.replaceAll("_", " ").replace(/^./, first => first.toUpperCase());
const errorMessage = error => error?.status === 401 ? "Your notification session is unavailable. Sign in again and retry."
  : error?.status === 403 ? "This request could not be authorized. Reopen Studio and retry."
  : error?.status === 400 ? "The notification request was invalid. Check your selections and retry."
  : "Notifications are unavailable right now. Please retry.";
const buttonClass = "omni-btn omni-btn--secondary omni-btn--sm";

// Each effect owns its response generation, including APIs that ignore abort.
function useRequest(load, dependencies) {
  const [result, setResult] = useState({ status: "loading", data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: "loading", data: null, error: "" });
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ status: "success", data, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ status: "error", data: null, error: errorMessage(error) });
    });
    return () => controller.abort();
  }, dependencies);
  return result;
}

export default function AccountNotifications({ currentUser }) {
  const version = useSyncExternalStore(onSessionChange, getSessionVersion);
  if (!currentUser) return <p role="status">Sign in to view your notifications.</p>;
  return <NotificationCenter key={`${version}:${currentUser.userId}`} />;
}

function NotificationCenter() {
  const formatDate = useAccountDateTime();
  const [query, setQuery] = useState({ page: 1, state: "active", category: "", severity: "" });
  const [reload, setReload] = useState(0), [settingsReload, setSettingsReload] = useState(0);
  const [marking, setMarking] = useState(null), [notice, setNotice] = useState(""), [mutationError, setMutationError] = useState("");
  const mutations = useRef(new AbortController()), markLock = useRef(false);
  useEffect(() => {
    mutations.current = new AbortController();
    return () => mutations.current.abort();
  }, []);
  const settings = useRequest(signal => Promise.all([getNotificationMetadata({ signal }), getNotificationPreferences({ signal })]), [settingsReload]);
  const inbox = useRequest(signal => Promise.all([getNotifications({ ...query, signal }), getUnreadNotificationCount({ signal })]), [query, reload]);
  const [metadata, preferences] = settings.data || [];
  const [list, unread] = inbox.data || [];
  function filter(key, value) { setQuery(previous => ({ ...previous, page: 1, [key]: value })); }

  async function markRead(id) {
    if (markLock.current) return;
    markLock.current = true;
    setMarking(id); setMutationError(""); setNotice("");
    const signal = mutations.current.signal;
    try {
      await markNotificationRead(id, { signal });
      if (!signal.aborted) {
        setNotice("Notification marked as read.");
        setQuery(previous => ({ ...previous, page: previous.state === "unread" ? 1 : previous.page }));
      }
    } catch (error) {
      if (!signal.aborted) setMutationError(errorMessage(error));
    } finally {
      if (!signal.aborted) { markLock.current = false; setMarking(null); }
    }
  }

  return <section className="account-notifications" aria-labelledby="notifications-heading">
    <header><h2 id="notifications-heading">Notifications</h2>
      <p>Manage your personal OmniBioAI in-app notifications and preferences.</p></header>
    <Card title="Inbox">
      <div className="notification-toolbar">
        <p role="status" aria-live="polite">{unread === undefined ? "Unread count unavailable" : `${unread} unread`}</p>
        <button type="button" className={buttonClass} onClick={() => setReload(value => value + 1)}>Refresh inbox</button>
      </div>
      <div className="notification-toolbar" role="group" aria-label="Inbox filters">
        <div className="notification-view-switch">{[["active", "All"], ["unread", "Unread"]].map(([value, text]) =>
          <button key={value} type="button" className={buttonClass} aria-pressed={query.state === value} onClick={() => filter("state", value)}>{text}</button>)}</div>
        {metadata && <>
          <label>Category<select className="studio-field" value={query.category} onChange={event => filter("category", event.target.value)}>
            <option value="">All categories</option>{metadata.categories.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          <label>Severity<select className="studio-field" value={query.severity} onChange={event => filter("severity", event.target.value)}>
            <option value="">All severities</option>{metadata.severities.map(value => <option key={value} value={value}>{label(value.toLowerCase())}</option>)}</select></label>
        </>}
      </div>
      {notice && <p role="status">{notice}</p>}{mutationError && <p role="alert">{mutationError}</p>}
      <div className="notification-inbox" aria-busy={inbox.status === "loading"}>
        {inbox.status === "loading" && <p role="status"><Spinner size="sm" /> Loading notifications…</p>}
        {inbox.status === "error" && <><p role="alert">{inbox.error}</p><button type="button" className={buttonClass} onClick={() => setReload(value => value + 1)}>Retry inbox</button></>}
        {list && (list.items.length ? <ul className="notification-list" aria-label="Notifications">{list.items.map(item =>
          <li key={item.notification_id} className={`notification-row${item.is_unread ? " notification-row--unread" : ""}`}>
            <div className="notification-row-copy"><div className="notification-row-meta"><span>{item.is_unread ? "Unread" : "Read"}</span><span>{label(item.category)}</span><span>{label(item.severity.toLowerCase())}</span></div>
              <h3>{item.title}</h3>{item.summary && <p>{item.summary}</p>}
              <div className="notification-row-meta"><time dateTime={item.created_at}>{formatDate(item.created_at)}</time>{item.group_count > 1 && <span>{item.group_count} grouped events</span>}</div>
            </div>
            {item.is_unread && <button type="button" className={buttonClass} disabled={marking !== null} aria-label={`Mark as read: ${item.title}`} onClick={() => markRead(item.notification_id)}>{marking === item.notification_id ? "Marking…" : "Mark read"}</button>}
          </li>)}</ul> : <div className="notification-empty"><h3>{query.state === "unread" ? "No unread notifications" : query.category || query.severity ? "No matching notifications" : "No notifications yet"}</h3><p>Notifications from your OmniBioAI activity will appear here when available.</p></div>)}
      </div>
      <nav className="notification-toolbar" aria-label="Notification pages">
        <button type="button" className={buttonClass} disabled={query.page <= 1} onClick={() => setQuery(previous => ({ ...previous, page: previous.page - 1 }))}>Previous</button>
        <span aria-live="polite">Page {list?.page ?? query.page}{list ? ` · ${list.total} matching notifications` : ""}</span>
        <button type="button" className={buttonClass} disabled={!list || list.page * PAGE_SIZE >= list.total} onClick={() => setQuery(previous => ({ ...previous, page: previous.page + 1 }))}>Next</button>
      </nav>
    </Card>
    <Card title="Notification preferences">
      {settings.status === "loading" && <p role="status"><Spinner size="sm" /> Loading notification preferences…</p>}
      {settings.status === "error" && <><p role="alert">{settings.error}</p><button type="button" className={buttonClass} onClick={() => setSettingsReload(value => value + 1)}>Retry preferences</button></>}
      {metadata && <NotificationPreferences metadata={metadata} initial={preferences} />}
    </Card>
  </section>;
}

function NotificationPreferences({ metadata, initial }) {
  const [confirmed, setConfirmed] = useState(initial), [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState("");
  const controller = useRef(new AbortController()), lock = useRef(false);
  useEffect(() => { controller.current = new AbortController(); return () => controller.current.abort(); }, []);
  useEffect(() => { setConfirmed(initial); setDraft(initial); setSaved(false); setError(""); }, [initial]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(confirmed);
  function change(key, value) { setDraft(previous => ({ ...previous, [key]: value })); setSaved(false); }
  function categoryChange(category, checked) {
    const selected = draft.enabled_categories.length ? draft.enabled_categories : metadata.categories;
    const next = checked ? [...new Set([...selected, category])] : selected.filter(value => value !== category);
    change("enabled_categories", [...new Set([...next, ...metadata.mandatory_categories])]);
  }
  async function save(event) {
    event.preventDefault();
    if (lock.current || !dirty) return;
    lock.current = true; setSaving(true); setError(""); setSaved(false);
    const signal = controller.current.signal;
    try {
      const result = await updateNotificationPreferences(draft, { signal });
      if (!signal.aborted) { setConfirmed(result); setDraft(result); setSaved(true); }
    } catch (failure) {
      if (!signal.aborted) setError(errorMessage(failure));
    } finally {
      if (!signal.aborted) { lock.current = false; setSaving(false); }
    }
  }
  return <form className="notification-preferences" onSubmit={save} aria-busy={saving}>
    <p>Applies to new notifications. Existing inbox items stay available. Security notifications are always enabled, regardless of category or severity preferences.</p>
    <fieldset disabled={saving}><legend>Notification types</legend><div className="notification-options">{NOTIFICATION_GROUPS.map(group =>
      <label key={group}><input type="checkbox" checked={draft[`${group}_notifications`]} disabled={group === "security"} onChange={event => change(`${group}_notifications`, event.target.checked)} />{label(group)}{group === "security" ? " (required)" : ""}</label>)}</div></fieldset>
    <label>Minimum severity<select className="studio-field" value={draft.min_severity} disabled={saving} onChange={event => change("min_severity", event.target.value)}>{metadata.severities.map(value => <option key={value} value={value}>{label(value.toLowerCase())}</option>)}</select></label>
    <details><summary>Choose notification categories</summary>
      <p>All categories are enabled by default. Required security categories remain enabled.</p>
      <button type="button" className={buttonClass} disabled={saving || !draft.enabled_categories.length} onClick={() => change("enabled_categories", [])}>Enable all categories</button>
      <fieldset disabled={saving}><legend>Enabled categories</legend><div className="notification-options">{metadata.categories.map(category =>
        <label key={category}><input type="checkbox" checked={!draft.enabled_categories.length || draft.enabled_categories.includes(category)} disabled={metadata.mandatory_categories.includes(category)} onChange={event => categoryChange(category, event.target.checked)} />{label(category)}{metadata.mandatory_categories.includes(category) ? " (required)" : ""}</label>)}</div></fieldset>
    </details>
    <p>Related events may be grouped automatically. Group counts reflect the notifications returned by OmniBioAI.</p>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={saving || !dirty}>{saving ? "Saving…" : "Save notification preferences"}</button>
    {saved && <p role="status">Notification preferences saved.</p>}
  </form>;
}
