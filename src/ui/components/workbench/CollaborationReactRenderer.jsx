import React, { useCallback, useEffect, useRef, useState } from "react";
import { nativePluginRequest } from "../../lib/nativePluginApi";
import { Payload, UtilityPanel } from "./UtilityRegistryRenderers";
import "./UtilityRegistryRenderers.css";

export default function CollaborationReactRenderer() {
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [events, setEvents] = useState([]);
  const [chat, setChat] = useState([]);
  const [comments, setComments] = useState([]);
  const [message, setMessage] = useState("");
  const [comment, setComment] = useState("");
  const [connection, setConnection] = useState("Disconnected");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const socket = useRef(null);

  const loadWorkspaces = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const data = await nativePluginRequest("/plugins/collaboration/api/workspaces/");
      const rows = Array.isArray(data) ? data : data.results || [];
      setWorkspaces(rows);
      setWorkspaceId(current => current || String(rows[0]?.id || ""));
    } catch (failure) { setError(failure.message || "Could not load collaboration workspaces."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  const loadWorkspaceData = useCallback(async id => {
    if (!id) return;
    setError("");
    try {
      const [eventData, chatData, commentData] = await Promise.all([
        nativePluginRequest(`/plugins/collaboration/api/events/?workspace=${encodeURIComponent(id)}`),
        nativePluginRequest(`/plugins/collaboration/api/chat/?workspace=${encodeURIComponent(id)}`),
        nativePluginRequest(`/plugins/collaboration/api/comments/?workspace=${encodeURIComponent(id)}`),
      ]);
      setEvents(Array.isArray(eventData) ? eventData : eventData.results || []);
      setChat(Array.isArray(chatData) ? chatData : chatData.results || []);
      setComments(Array.isArray(commentData) ? commentData : commentData.results || []);
    } catch (failure) { setError(failure.message || "Could not load this workspace."); }
  }, []);
  useEffect(() => { loadWorkspaceData(workspaceId); }, [loadWorkspaceData, workspaceId]);
  useEffect(() => {
    if (!workspaceId || typeof window.WebSocket !== "function") return undefined;
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const connectionSocket = new window.WebSocket(`${scheme}//${window.location.host}/ws/collaboration/${encodeURIComponent(workspaceId)}/`);
    socket.current = connectionSocket;
    connectionSocket.onopen = () => setConnection("Connected");
    connectionSocket.onclose = () => setConnection("Disconnected");
    connectionSocket.onerror = () => setConnection("Error");
    connectionSocket.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chat_message") setChat(previous => [...previous, data]);
        if (data.type === "workspace_event" && data.event) setEvents(previous => [data.event, ...previous]);
      } catch { /* Ignore malformed broadcast messages. */ }
    };
    return () => { connectionSocket.close(); if (socket.current === connectionSocket) socket.current = null; };
  }, [workspaceId]);

  function sendMessage(event) {
    event.preventDefault();
    if (!message.trim()) return;
    if (!socket.current || socket.current.readyState !== window.WebSocket.OPEN) { setError("Workspace chat is not connected yet."); return; }
    socket.current.send(JSON.stringify({ type: "chat_message", message: message.trim(), sender_type: "human" }));
    setMessage("");
  }
  async function addComment(event) {
    event.preventDefault(); if (!workspaceId || !comment.trim()) return;
    setBusy(true); setError("");
    try {
      await nativePluginRequest("/plugins/collaboration/api/comments/", { method: "POST", body: { workspace: Number(workspaceId), content: comment.trim() } });
      setComment(""); await loadWorkspaceData(workspaceId);
    } catch (failure) { setError(failure.message || "Could not add comment."); }
    finally { setBusy(false); }
  }
  const activeWorkspace = workspaces.find(item => String(item.id) === workspaceId);
  return <main className="utility-react" aria-label="Collaboration Workspace">
    <header className="utility-react__hero"><div><p>RESEARCH COLLABORATION · SHARED WORKSPACES</p><h1>Collaboration</h1><span>Review workspace activity, exchange live messages, and add governed comments.</span></div>
      <span aria-live="polite">Chat {connection}</span></header>
    {error && <p role="alert" className="utility-react__error">{error}</p>}
    <UtilityPanel title="Workspace"><label className="utility-react__form">Select workspace<select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}><option value="">Choose workspace…</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
      {activeWorkspace && <p>{activeWorkspace.description || "Shared research workspace"} · {activeWorkspace.current_user_role || "member"}</p>}
      {busy && <p role="status">Updating workspace…</p>}</UtilityPanel>
    <div className="utility-react__grid"><UtilityPanel title="Activity timeline"><Payload value={events} empty="No activity yet for this workspace."/></UtilityPanel>
      <UtilityPanel title="Chat"><div className="utility-react__result"><Payload value={chat} empty="No messages yet."/></div>
        <form className="utility-react__form" onSubmit={sendMessage}><label>Message<input value={message} onChange={event => setMessage(event.target.value)} required /></label><button type="submit" disabled={!workspaceId || !message.trim() || connection !== "Connected"}>Send message</button></form>
      </UtilityPanel>
      <UtilityPanel title="Comments"><Payload value={comments} empty="No comments yet."/><form className="utility-react__form" onSubmit={addComment}><label>Add a comment<textarea value={comment} onChange={event => setComment(event.target.value)} rows={3} required /></label><button type="submit" disabled={!workspaceId || !comment.trim() || busy}>Add comment</button></form></UtilityPanel>
    </div>
  </main>;
}
