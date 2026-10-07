import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@omnibioai/ui";
import { useAccountDateTime } from "../components/PreferencesProvider";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "../lib/projectsApi";
import "./Projects.css";

const FILTERS = ["All", "Active", "Archived"];
const buttonClass = "omni-btn omni-btn--secondary omni-btn--sm";

function userMessage(error, operation) {
  if (error?.name === "AbortError") return "";
  if (error?.code === "unauthorized") return "Sign in again to manage projects.";
  if (operation === "list") return "Projects are unavailable right now. Please retry.";
  if (operation === "detail") return error?.code === "not_found"
    ? "This project is unavailable." : "Project details are unavailable right now.";
  if (error?.code === "forbidden") return "You do not have permission to change this project.";
  if (error?.code === "not_found") return "This project is unavailable.";
  if (error?.code === "invalid") return "Check the project name and description, then retry.";
  if (error?.code === "stale") return "Your session changed before the project update completed. Please retry.";
  return operation === "archive" ? "The project could not be archived. Please retry."
    : operation === "create" ? "The project could not be created. Please retry."
      : "The project could not be updated. Please retry.";
}

function replaceProject(items, project) {
  const existing = items.some(item => item.projectId === project.projectId);
  const next = existing ? items.map(item => item.projectId === project.projectId ? project : item) : [...items, project];
  return next.sort((left, right) => left.name.localeCompare(right.name) || left.projectId.localeCompare(right.projectId));
}

export default function Projects() {
  const formatDate = useAccountDateTime();
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ status: "loading", items: [], error: "" });
  const [filter, setFilter] = useState("Active");
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ status: "loading", items: [], error: "" });
    listProjects({ status: "all", signal: controller.signal }).then(items => {
      if (!controller.signal.aborted) setResult({ status: "success", items, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ status: "error", items: [], error: userMessage(error, "list") });
    });
    return () => controller.abort();
  }, [reload]);

  const visible = useMemo(() => result.items.filter(project => (
    filter === "All" || project.status === filter.toLowerCase()
  )), [filter, result.items]);

  function acceptProject(project) {
    setResult(previous => previous.status === "success"
      ? { ...previous, items: replaceProject(previous.items, project) }
      : previous);
    setSelected(project);
  }

  return <section className="projects-page" aria-labelledby="projects-heading">
    <header className="projects-header"><div>
      <h1 id="projects-heading">Projects</h1>
      <p>Organize scientific work using organization-scoped project identities managed by Workbench.</p>
    </div><button type="button" className="omni-btn omni-btn--primary omni-btn--sm" onClick={() => setCreating(true)}>Create project</button></header>

    <div className="projects-toolbar" role="group" aria-label="Project status filters">
      {FILTERS.map(value => <button key={value} type="button" className={buttonClass} aria-pressed={filter === value}
        onClick={() => setFilter(value)}>{value}</button>)}
    </div>

    <div className="projects-results" aria-busy={result.status === "loading"}>
      {result.status === "loading" && <div className="project-state" role="status"><Spinner size="sm" /> Loading projects…</div>}
      {result.status === "error" && <div className="project-state project-state--error"><p role="alert">{result.error}</p>
        <button type="button" className={buttonClass} onClick={() => setReload(value => value + 1)}>Retry</button></div>}
      {result.status === "success" && result.items.length === 0 && <div className="project-state"><h2>No projects yet</h2>
        <p>Create a project to establish a durable scientific identity for your organization.</p>
        <button type="button" className="omni-btn omni-btn--primary omni-btn--sm" onClick={() => setCreating(true)}>Create project</button></div>}
      {result.status === "success" && result.items.length > 0 && visible.length === 0 && <div className="project-state">
        <h2>No {filter.toLowerCase()} projects</h2><p>Choose another status filter.</p></div>}
      {result.status === "success" && visible.length > 0 && <div className="project-list" aria-label="Projects">
        {visible.map(project => <article key={project.projectId} className={`project-card project-card--${project.status}`}>
          <div className="project-card-copy"><div className="project-card-meta"><span className={`project-status project-status--${project.status}`}>{project.status}</span>
            <time dateTime={project.updatedAt}>Updated {formatDate(project.updatedAt)}</time></div>
            <h2><button type="button" onClick={() => setSelected(project)}>{project.name}</button></h2>
            <p>{project.description || "No description provided."}</p></div>
          <button type="button" className={buttonClass} aria-label={`Open ${project.name}`} onClick={() => setSelected(project)}>Open</button>
        </article>)}
      </div>}
    </div>

    {creating && <ProjectFormDialog mode="create" onClose={() => setCreating(false)} onSaved={project => {
      acceptProject(project); setCreating(false);
    }} />}
    {selected && <ProjectDetail key={selected.projectId} summary={selected} formatDate={formatDate}
      onClose={() => setSelected(null)} onProjectChange={acceptProject} />}
  </section>;
}

function ProjectFormDialog({ mode, project, onClose, onSaved }) {
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => () => controller.current.abort(), []);

  async function submit(event) {
    event.preventDefault();
    if (locked.current) return;
    if (!name.trim()) { setError("Project name is required."); return; }
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      const values = { name, description };
      const saved = mode === "create"
        ? await createProject(values, { signal: controller.current.signal })
        : await updateProject(project.projectId, values, { signal: controller.current.signal });
      if (!controller.current.signal.aborted) onSaved(saved);
    } catch (failure) {
      if (!controller.current.signal.aborted) setError(userMessage(failure, mode));
    } finally {
      if (!controller.current.signal.aborted) { locked.current = false; setSaving(false); }
    }
  }

  const title = mode === "create" ? "Create project" : "Edit project";
  return <div className="project-modal-backdrop" onMouseDown={event => { if (!saving && event.target === event.currentTarget) onClose(); }}>
    <section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="project-form-title">
      <header><h2 id="project-form-title">{title}</h2><button type="button" className={buttonClass} disabled={saving} onClick={onClose}>Cancel</button></header>
      <form onSubmit={submit} aria-busy={saving}>
        <label htmlFor={`project-name-${mode}`}>Name<input id={`project-name-${mode}`} className="studio-field" value={name}
          maxLength={255} required disabled={saving} onChange={event => setName(event.target.value)} /></label>
        <label htmlFor={`project-description-${mode}`}>Description<textarea id={`project-description-${mode}`} className="studio-field"
          value={description} rows={5} disabled={saving} onChange={event => setDescription(event.target.value)} /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="omni-btn omni-btn--primary omni-btn--sm" disabled={saving}>
          {saving ? "Saving…" : mode === "create" ? "Create project" : "Save changes"}</button>
      </form>
    </section>
  </div>;
}

function ProjectDetail({ summary, formatDate, onClose, onProjectChange }) {
  const [detail, setDetail] = useState({ status: "loading", data: summary, error: "" });
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const archiveLock = useRef(false);
  const archiveController = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    getProject(summary.projectId, { signal: controller.signal }).then(project => {
      if (!controller.signal.aborted) setDetail({ status: "success", data: project, error: "" });
    }).catch(error => {
      if (!controller.signal.aborted) setDetail({ status: "error", data: summary, error: userMessage(error, "detail") });
    });
    return () => controller.abort();
  }, [summary.projectId]);

  useEffect(() => {
    const close = event => { if (event.key === "Escape" && !editing && !archiving) onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [archiving, editing, onClose]);

  useEffect(() => () => archiveController.current.abort(), []);

  const project = detail.data;
  function accept(projectValue) {
    setDetail({ status: "success", data: projectValue, error: "" });
    setEditing(false);
    onProjectChange(projectValue);
  }

  async function confirm() {
    if (archiveLock.current) return;
    archiveLock.current = true;
    setArchiving(true);
    setArchiveError("");
    try {
      const archived = await archiveProject(project.projectId, { signal: archiveController.current.signal });
      if (!archiveController.current.signal.aborted) {
        accept(archived);
        setConfirmArchive(false);
      }
    } catch (error) {
      if (!archiveController.current.signal.aborted) setArchiveError(userMessage(error, "archive"));
    } finally {
      if (!archiveController.current.signal.aborted) {
        archiveLock.current = false;
        setArchiving(false);
      }
    }
  }

  return <div className="project-detail-backdrop" onMouseDown={event => { if (!editing && event.target === event.currentTarget) onClose(); }}>
    <aside className="project-detail" role="dialog" aria-modal="true" aria-labelledby="project-detail-title">
      <header><div><span className={`project-status project-status--${project.status}`}>{project.status}</span>
        <h2 id="project-detail-title">{project.name}</h2></div>
        <button type="button" className={buttonClass} aria-label="Close project details" onClick={onClose}>Close</button></header>
      <div className="project-detail-body">
        {detail.status === "loading" && <p role="status"><Spinner size="sm" /> Loading project details…</p>}
        {detail.status === "error" && <p role="alert">{detail.error}</p>}
        {detail.status === "success" && <section className="project-overview" data-project-detail-section="overview" aria-labelledby="project-overview-heading">
          <div className="project-section-heading"><h3 id="project-overview-heading">Overview</h3><div>
            <button type="button" className={buttonClass} onClick={() => setEditing(true)}>Edit project</button>
            {project.status === "active" && <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" onClick={() => {
              setConfirmArchive(true); setArchiveError("");
            }}>Archive project</button>}
          </div></div>
          <p className="project-description">{project.description || "No description provided."}</p>
          <dl className="project-metadata"><div><dt>Status</dt><dd>{project.status}</dd></div>
            <div><dt>Created</dt><dd><time dateTime={project.createdAt}>{formatDate(project.createdAt)}</time></dd></div>
            <div><dt>Updated</dt><dd><time dateTime={project.updatedAt}>{formatDate(project.updatedAt)}</time></dd></div></dl>
          {confirmArchive && <div className="project-confirmation" role="alertdialog" aria-labelledby="archive-project-title">
            <h4 id="archive-project-title">Archive {project.name}?</h4>
            <p>The Project record will remain available. This does not delete artifacts, workspaces, runs, or storage.</p>
            {archiveError && <p role="alert">{archiveError}</p>}
            <div><button type="button" className={buttonClass} disabled={archiving} onClick={() => setConfirmArchive(false)}>Cancel</button>
              <button type="button" className="omni-btn omni-btn--danger omni-btn--sm" disabled={archiving} onClick={confirm}>
                {archiving ? "Archiving…" : "Confirm archive"}</button></div>
          </div>}
        </section>}
        <div className="project-detail-extension" data-project-detail-extension="collaboration" />
      </div>
    </aside>
    {editing && <ProjectFormDialog mode="edit" project={project} onClose={() => setEditing(false)} onSaved={accept} />}
  </div>;
}
