import React, { useEffect, useRef, useState } from "react";
import { Spinner } from "@omnibioai/ui";
import {
  addWorkspaceMember,
  createProjectComment,
  createProjectWorkspace,
  deleteProjectComment,
  getProjectDiscussion,
  getProjectWorkspace,
  getWorkspaceMembers,
  removeWorkspaceMember,
  searchMemberCandidates,
  updateProjectComment,
  updateWorkspaceMemberRole,
} from "../../lib/collaborationApi";

const buttonClass = "omni-btn omni-btn--secondary omni-btn--sm";
const roleLabel = value => value ? value[0].toUpperCase() + value.slice(1) : "Unknown";

function message(error, operation) {
  if (error?.name === "AbortError") return "";
  if (error?.code === "unauthorized") return "Sign in again to use collaboration.";
  if (error?.code === "forbidden") return "You do not have permission to perform this action.";
  if (error?.code === "not_found") return "The collaboration workspace is no longer available.";
  if (error?.code === "stale") return "Your session changed before the request completed. Please retry.";
  if (operation === "candidates") return "Unable to search organization members.";
  if (operation === "workspace") return "Collaboration is unavailable right now. Please retry.";
  if (operation === "create-workspace" && error?.code === "invalid") return "Collaboration is already enabled for this project.";
  if (operation === "role" || operation === "remove") {
    return error?.code === "invalid" ? "At least one workspace admin is required." : "The member could not be updated. Please retry.";
  }
  if (operation === "add") return error?.code === "invalid"
    ? "This person cannot be added to the workspace." : "The member could not be added. Please retry.";
  if (operation === "comment") return error?.code === "invalid"
    ? "Enter a comment and retry." : "The discussion could not be updated. Please retry.";
  return "Collaboration is unavailable right now. Please retry.";
}

function Dialog({ title, children, busy, onClose }) {
  const headingId = `collaboration-dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const first = useRef(null);
  const returnFocus = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    returnFocus.current = document.activeElement;
    first.current?.focus();
    const close = event => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
      returnFocus.current?.focus?.();
    };
  }, []);
  return <div className="project-modal-backdrop" onMouseDown={event => {
    if (!busy && event.target === event.currentTarget) onClose();
  }}><section className="project-modal collaboration-dialog" role="dialog" aria-modal="true" aria-labelledby={headingId}>
    <header><h2 id={headingId}>{title}</h2><button ref={first} type="button" className={buttonClass} disabled={busy} onClick={onClose}>Cancel</button></header>
    {children}
  </section></div>;
}

export default function ProjectCollaboration({ project, formatDate = value => value }) {
  const [reload, setReload] = useState(0);
  const [workspaceState, setWorkspaceState] = useState({ status: "loading", data: null, error: "" });
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setWorkspaceState({ status: "loading", data: null, error: "" });
    getProjectWorkspace(project.projectId, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setWorkspaceState({ status: "success", data, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setWorkspaceState({ status: "error", data: null, error: message(error, "workspace") });
    });
    return () => controller.abort();
  }, [project.projectId, reload]);

  const workspace = workspaceState.data;
  return <section className="project-collaboration" data-project-detail-extension="collaboration" aria-labelledby="project-collaboration-heading">
    <div className="project-section-heading"><div><h3 id="project-collaboration-heading">Collaboration</h3>
      {workspace && <p>Project discussion and workspace access</p>}</div>
      {workspaceState.status === "success" && !workspace && project.status === "active" &&
        <button type="button" className="omni-btn omni-btn--primary omni-btn--sm" onClick={() => { setCreateOpen(true); setNotice(""); }}>Enable collaboration</button>}
    </div>
    <div aria-live="polite">{notice && <p className="collaboration-notice" role="status">{notice}</p>}</div>
    {workspaceState.status === "loading" && <p role="status"><Spinner size="sm" /> Loading collaboration…</p>}
    {workspaceState.status === "error" && <div className="collaboration-error"><p role="alert">{workspaceState.error}</p>
      <button type="button" className={buttonClass} onClick={() => setReload(value => value + 1)}>Retry</button></div>}
    {workspaceState.status === "success" && !workspace && <div className="collaboration-empty">
      <p>{project.status === "archived" ? "Collaboration cannot be enabled for an archived project."
        : "Create a collaboration workspace for this project to manage members, roles, and project discussion."}</p>
    </div>}
    {workspace && <><WorkspaceSummary workspace={workspace} />
      <Members workspace={workspace} formatDate={formatDate} onNotice={setNotice} />
      <Discussion workspace={workspace} project={project} formatDate={formatDate} onNotice={setNotice} /></>}
    {createOpen && <WorkspaceDialog project={project} onClose={() => setCreateOpen(false)} onCreated={() => {
      setCreateOpen(false); setNotice("Collaboration workspace enabled."); setReload(value => value + 1);
    }} onConflict={() => {
      setCreateOpen(false); setNotice("Collaboration is already enabled for this project."); setReload(value => value + 1);
    }} />}
  </section>;
}

function WorkspaceDialog({ project, onClose, onCreated, onConflict }) {
  const [name, setName] = useState(`${project.name} collaboration`);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef(new AbortController());
  const locked = useRef(false);
  useEffect(() => () => controller.current.abort(), []);
  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    if (!name.trim()) { setError("Workspace name is required."); return; }
    locked.current = true; setBusy(true); setError("");
    try {
      await createProjectWorkspace(project.projectId, { name, description }, { signal: controller.current.signal });
      if (!controller.current.signal.aborted) onCreated();
    } catch (failure) {
      if (!controller.current.signal.aborted) {
        if (failure?.code === "invalid") onConflict();
        else setError(message(failure, "create-workspace"));
      }
    } finally {
      if (!controller.current.signal.aborted) { locked.current = false; setBusy(false); }
    }
  }
  return <Dialog title="Enable collaboration" busy={busy} onClose={onClose}><form onSubmit={submit} aria-busy={busy}>
    <label htmlFor="collaboration-workspace-name">Workspace name<input id="collaboration-workspace-name" className="studio-field" value={name} maxLength={255} required disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <label htmlFor="collaboration-workspace-description">Description<textarea id="collaboration-workspace-description" className="studio-field" value={description} rows={4} disabled={busy} onChange={event => setDescription(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={busy}>{busy ? "Enabling…" : "Enable collaboration"}</button>
  </form></Dialog>;
}

function WorkspaceSummary({ workspace }) {
  return <div className="collaboration-summary"><div><span>Workspace</span><strong>{workspace.name}</strong></div>
    <div><span>Your role</span><strong className={`collaboration-role collaboration-role--${workspace.currentUserRole}`}>{roleLabel(workspace.currentUserRole)}</strong></div>
    {workspace.description && <p>{workspace.description}</p>}</div>;
}

function Members({ workspace, formatDate, onNotice }) {
  const [state, setState] = useState({ status: "loading", items: [], error: "" });
  const [reload, setReload] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [changing, setChanging] = useState("");
  const [remove, setRemove] = useState(null);
  const isAdmin = workspace.currentUserRole === "admin";
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ status: "loading", items: previous.items, error: "" }));
    getWorkspaceMembers(workspace.workspaceId, { signal: controller.signal }).then(items => {
      if (!controller.signal.aborted) setState({ status: "success", items, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: "error", items: [], error: message(error, "members") });
    });
    return () => controller.abort();
  }, [reload, workspace.workspaceId]);

  async function changeRole(member, nextRole) {
    if (changing) return;
    setChanging(member.membershipId); onNotice("");
    try {
      await updateWorkspaceMemberRole(member.membershipId, nextRole);
      onNotice("Member role updated."); setReload(value => value + 1);
    } catch (error) { onNotice(message(error, "role")); }
    finally { setChanging(""); }
  }

  async function confirmRemove() {
    if (!remove || changing) return;
    setChanging(remove.membershipId); onNotice("");
    try {
      await removeWorkspaceMember(remove.membershipId);
      onNotice("Member removed from the workspace."); setRemove(null); setReload(value => value + 1);
    } catch (error) { onNotice(message(error, "remove")); }
    finally { setChanging(""); }
  }

  return <section className="collaboration-subsection" aria-labelledby="collaboration-members-heading">
    <div className="project-section-heading"><h4 id="collaboration-members-heading">Members</h4>
      {isAdmin && <button type="button" className={buttonClass} onClick={() => setAddOpen(true)}>Add member</button>}</div>
    {state.status === "loading" && <p role="status"><Spinner size="sm" /> Loading members…</p>}
    {state.status === "error" && <p role="alert">{state.error}</p>}
    {state.status === "success" && <ul className="collaboration-members" aria-label="Workspace members">{state.items.map(member => <li key={member.membershipId}>
      <div><strong>{member.displayName}</strong>{member.email && <span>{member.email}</span>}
        <small>Joined {formatDate(member.joinedAt)}</small></div>
      {isAdmin ? <div className="collaboration-member-actions"><label htmlFor={`member-role-${member.membershipId}`}>Role<span className="sr-only"> for {member.displayName}</span>
        <select id={`member-role-${member.membershipId}`} value={member.role} disabled={changing === member.membershipId} onChange={event => changeRole(member, event.target.value)}>
          <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
        </select></label>
        {member.role !== "admin" && <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" disabled={!!changing} onClick={() => setRemove(member)}>Remove</button>}</div>
        : <span className={`collaboration-role collaboration-role--${member.role}`}>{roleLabel(member.role)}</span>}
    </li>)}</ul>}
    {addOpen && <AddMemberDialog workspace={workspace} onClose={() => setAddOpen(false)} onAdded={() => {
      setAddOpen(false); onNotice("Member added to the workspace."); setReload(value => value + 1);
    }} />}
    {remove && <Dialog title="Remove member?" busy={!!changing} onClose={() => setRemove(null)}><div className="collaboration-confirmation">
      <p><strong>{remove.displayName}</strong> will lose access to this collaboration workspace.</p>
      <div><button type="button" className={buttonClass} disabled={!!changing} onClick={() => setRemove(null)}>Cancel</button>
        <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" disabled={!!changing} onClick={confirmRemove}>{changing ? "Removing…" : "Remove member"}</button></div>
    </div></Dialog>}
  </section>;
}

function AddMemberDialog({ workspace, onClose, onAdded }) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState({ status: "initial", items: [], error: "" });
  const [selected, setSelected] = useState(null);
  const [memberRole, setMemberRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const term = query.trim();
    setSelected(null);
    if (term.length < 3) { setState({ status: "initial", items: [], error: "" }); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ status: "searching", items: [], error: "" });
      searchMemberCandidates(workspace.workspaceId, term, { signal: controller.signal }).then(items => {
        if (!controller.signal.aborted) setState({ status: "success", items, error: "" });
      }).catch(failure => {
        if (!controller.signal.aborted) setState({ status: "error", items: [], error: message(failure, "candidates") });
      });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, workspace.workspaceId]);

  async function submit(event) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      await addWorkspaceMember(workspace.workspaceId, selected.principalId, memberRole);
      onAdded();
    } catch (failure) { setError(message(failure, "add")); }
    finally { setBusy(false); }
  }
  return <Dialog title="Add member" busy={busy} onClose={onClose}><form onSubmit={submit} aria-busy={busy}>
    <label htmlFor="collaboration-member-search">Search organization members<input id="collaboration-member-search" className="studio-field" value={query} autoComplete="off" disabled={busy} onChange={event => setQuery(event.target.value)} aria-describedby="collaboration-search-help" /></label>
    <p id="collaboration-search-help" className="collaboration-help">Enter at least 3 characters of an email address.</p>
    {state.status === "searching" && <p role="status"><Spinner size="sm" /> Searching members…</p>}
    {state.status === "error" && <p role="alert">{state.error}</p>}
    {state.status === "success" && state.items.length === 0 && <p role="status">No eligible members found.</p>}
    {state.status === "success" && state.items.length > 0 && <fieldset className="collaboration-candidates"><legend>Eligible members</legend>{state.items.map(candidate => <label key={candidate.principalId}>
      <input type="radio" name="member-candidate" checked={selected?.principalId === candidate.principalId} disabled={busy} onChange={() => setSelected(candidate)} />
      <span><strong>{candidate.displayName}</strong><small>{candidate.email}</small></span>
    </label>)}</fieldset>}
    <label htmlFor="collaboration-new-member-role">Role<select id="collaboration-new-member-role" value={memberRole} disabled={busy} onChange={event => setMemberRole(event.target.value)}>
      <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
    </select></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={busy || !selected}>{busy ? "Adding…" : "Add member"}</button>
  </form></Dialog>;
}

function Discussion({ workspace, project, formatDate, onNotice }) {
  const [state, setState] = useState({ status: "loading", items: [], error: "" });
  const [reload, setReload] = useState(0);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const canCreate = workspace.currentUserRole === "admin" || workspace.currentUserRole === "editor";
  const canAdminister = workspace.currentUserRole === "admin";
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ status: "loading", items: previous.items, error: "" }));
    getProjectDiscussion(workspace.workspaceId, project.projectId, { signal: controller.signal }).then(items => {
      if (!controller.signal.aborted) setState({ status: "success", items: [...items].reverse(), error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ status: "error", items: [], error: message(error, "discussion") });
    });
    return () => controller.abort();
  }, [project.projectId, reload, workspace.workspaceId]);

  async function create(event) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true); onNotice("");
    try {
      await createProjectComment(workspace.workspaceId, project.projectId, content);
      setContent(""); onNotice("Comment added."); setReload(value => value + 1);
    } catch (error) { onNotice(message(error, "comment")); }
    finally { setBusy(false); }
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing?.content.trim() || busy) return;
    setBusy(true); onNotice("");
    try {
      await updateProjectComment(editing.commentId, editing.content);
      setEditing(null); onNotice("Comment updated."); setReload(value => value + 1);
    } catch (error) { onNotice(message(error, "comment")); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!deleting || busy) return;
    setBusy(true); onNotice("");
    try {
      await deleteProjectComment(deleting.commentId);
      setDeleting(null); onNotice("Comment deleted."); setReload(value => value + 1);
    } catch (error) { onNotice(message(error, "comment")); }
    finally { setBusy(false); }
  }

  return <section className="collaboration-subsection" aria-labelledby="collaboration-discussion-heading">
    <div className="project-section-heading"><div><h4 id="collaboration-discussion-heading">Discussion</h4><p>Project discussion</p></div></div>
    {canCreate ? <form className="collaboration-comment-form" onSubmit={create} aria-busy={busy}>
      <label htmlFor="collaboration-comment">Add a comment<textarea id="collaboration-comment" className="studio-field" rows={3} value={content} disabled={busy} onChange={event => setContent(event.target.value)} /></label>
      <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={busy || !content.trim()}>{busy ? "Posting…" : "Post comment"}</button>
    </form> : <p className="collaboration-help">You have read-only access to this discussion.</p>}
    {state.status === "loading" && <p role="status"><Spinner size="sm" /> Loading discussion…</p>}
    {state.status === "error" && <p role="alert">{state.error}</p>}
    {state.status === "success" && state.items.length === 0 && <p className="collaboration-help">No comments yet.</p>}
    {state.status === "success" && state.items.length > 0 && <ol className="collaboration-comments">{state.items.map(comment => <li key={comment.commentId}>
      <div className="collaboration-comment-meta"><strong>Project member</strong><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time></div>
      <p>{comment.content}</p>
      {canAdminister && <div className="collaboration-comment-actions"><button type="button" className={buttonClass} onClick={() => setEditing({ ...comment })}>Edit</button>
        <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" onClick={() => setDeleting(comment)}>Delete</button></div>}
    </li>)}</ol>}
    {editing && <Dialog title="Edit comment" busy={busy} onClose={() => setEditing(null)}><form onSubmit={saveEdit} aria-busy={busy}>
      <label htmlFor="collaboration-edit-comment">Comment<textarea id="collaboration-edit-comment" className="studio-field" rows={4} value={editing.content} disabled={busy} onChange={event => setEditing(value => ({ ...value, content: event.target.value }))} /></label>
      <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={busy || !editing.content.trim()}>{busy ? "Saving…" : "Save comment"}</button>
    </form></Dialog>}
    {deleting && <Dialog title="Delete comment?" busy={busy} onClose={() => setDeleting(null)}><div className="collaboration-confirmation"><p>This comment will be permanently removed from the project discussion.</p>
      <div><button type="button" className={buttonClass} disabled={busy} onClick={() => setDeleting(null)}>Cancel</button>
        <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" disabled={busy} onClick={confirmDelete}>{busy ? "Deleting…" : "Delete comment"}</button></div>
    </div></Dialog>}
  </section>;
}
