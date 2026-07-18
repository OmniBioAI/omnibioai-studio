import React, { useCallback, useEffect, useState } from "react";
import { Card, Button, Badge, Table, Input, Tabs } from "@omnibioai/ui";
import { Panel, PanelHeader, PanelBody, FormRow } from "../components/UI";
import Login from "../components/Login";
import * as rolesApi from "../lib/rolesApi";

const MANAGE_ROLES = "manage_roles";

export default function RoleManagement({ currentUser }) {
  if (!currentUser) {
    return <Login title="Sign in required" description="Role management requires an authenticated OmniBioAI account." />;
  }
  if (!currentUser.permissions?.includes(MANAGE_ROLES)) {
    return <AccessDenied email={currentUser.email} />;
  }
  return <RoleManagementConsole />;
}

function AccessDenied({ email }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
      <div style={{ width: 360, textAlign: "center" }}>
        <Card elevated>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Access denied</div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginBottom: 12 }}>
            {email} does not have permission to manage roles.
          </div>
          <Badge variant="warning">requires: {MANAGE_ROLES}</Badge>
        </Card>
      </div>
    </div>
  );
}

// ── Console (admin) ──────────────────────────────────────────────────────────

function RoleManagementConsole() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState(null); // null | "new" | id
  const [notice, setNotice] = useState(null);
  const [activeTabKey, setActiveTabKey] = useState("roles");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRoles(await rolesApi.listRoles());
    } catch (err) {
      setLoadError(err.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (selectedRoleId !== null) {
    return (
      <RoleDetail
        roleId={selectedRoleId}
        onDone={(msg) => { setSelectedRoleId(null); setNotice(msg); refresh(); }}
        onCancel={() => setSelectedRoleId(null)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em", marginBottom: 3 }}>
            Role Management
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
            manage roles, permissions, and user assignments
          </div>
        </div>
        {activeTabKey === "roles" && (
          <Button variant="primary" onClick={() => setSelectedRoleId("new")}>+ New Role</Button>
        )}
      </div>

      {notice && <Badge variant={notice.type === "error" ? "danger" : "success"}>{notice.text}</Badge>}
      {loadError && <Badge variant="danger">{loadError}</Badge>}

      <Tabs
        onChange={setActiveTabKey}
        tabs={[
          {
            key: "roles",
            label: "Roles",
            content: (
              <RolesTable
                roles={roles}
                loading={loading}
                onSelect={setSelectedRoleId}
                onDeleted={(msg) => { setNotice(msg); refresh(); }}
              />
            ),
          },
          {
            key: "assign",
            label: "Assign to User",
            content: <UserAssignment roles={roles} />,
          },
        ]}
      />
    </div>
  );
}

function RolesTable({ roles, loading, onSelect, onDeleted }) {
  const [deletingId, setDeletingId] = useState(null);
  const [deleteErrors, setDeleteErrors] = useState({});

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    setDeletingId(role.id);
    setDeleteErrors((e) => ({ ...e, [role.id]: null }));
    try {
      await rolesApi.deleteRole(role.id);
      onDeleted({ type: "success", text: `Role "${role.name}" deleted.` });
    } catch (err) {
      const msg = err.status === 409
        ? `"${role.name}" is still assigned to ${role.user_count} user(s) — remove those assignments first.`
        : (err.message || "Delete failed");
      setDeleteErrors((e) => ({ ...e, [role.id]: msg }));
    } finally {
      setDeletingId(null);
    }
  };

  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "permission_count", label: "Permissions", sortable: true, align: "right" },
    { key: "user_count", label: "Users", sortable: true, align: "right" },
    {
      key: "id",
      label: "",
      align: "right",
      render: (_, role) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" onClick={() => onSelect(role.id)}>Edit</Button>
          <Button
            size="sm" variant="danger"
            disabled={deletingId === role.id}
            onClick={() => handleDelete(role)}
          >
            {deletingId === role.id ? "Deleting…" : "Delete"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Panel>
      <PanelHeader title="◈  Roles" icon iconColor="teal" />
      <PanelBody style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</div>
        ) : (
          <Table columns={columns} data={roles} emptyMessage="No roles yet — create one to get started." />
        )}
        {Object.entries(deleteErrors).filter(([, v]) => v).map(([id, msg]) => (
          <div key={id} style={{ padding: "8px 16px" }}>
            <Badge variant="danger">{msg}</Badge>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}

function RoleDetail({ roleId, onDone, onCancel }) {
  const isNew = roleId === "new";
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [newPerm, setNewPerm] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    let mounted = true;
    (async () => {
      try {
        const role = await rolesApi.getRole(roleId);
        if (!mounted) return;
        setName(role.name);
        setPermissions(role.permissions);
      } catch (err) {
        if (mounted) setError(err.message || "Failed to load role");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [roleId, isNew]);

  const addPermission = () => {
    const p = newPerm.trim();
    if (!p || permissions.includes(p)) return;
    setPermissions([...permissions, p]);
    setNewPerm("");
  };

  const removePermission = (p) => {
    setPermissions(permissions.filter((x) => x !== p));
  };

  const save = async () => {
    if (!name.trim()) { setError("Role name is required"); return; }
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        await rolesApi.createRole(name.trim(), permissions);
        onDone({ type: "success", text: `Role "${name.trim()}" created.` });
      } else {
        await rolesApi.updateRole(roleId, permissions);
        onDone({ type: "success", text: `Role "${name}" updated.` });
      }
    } catch (err) {
      setError(err.status === 409 ? "A role with that name already exists." : (err.message || "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>Loading…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
      <div><Button variant="ghost" onClick={onCancel}>← Back to roles</Button></div>

      <Panel>
        <PanelHeader title={isNew ? "◈  New Role" : `◈  Edit Role — ${name}`} icon iconColor="teal" />
        <PanelBody>
          <FormRow label="Role Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isNew} placeholder="e.g. data_scientist" />
          </FormRow>

          <FormRow label="Permissions">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {permissions.length === 0 && (
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
                  No permissions assigned
                </span>
              )}
              {permissions.map((p) => (
                <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Badge variant="info">{p}</Badge>
                  <button
                    onClick={() => removePermission(p)}
                    title={`Remove ${p}`}
                    style={{
                      background: "transparent", border: "none", color: "var(--color-text-muted)",
                      cursor: "pointer", fontSize: 12, lineHeight: 1, padding: 0,
                    }}
                  >✕</button>
                </span>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addPermission(); }} style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Input value={newPerm} onChange={(e) => setNewPerm(e.target.value)} placeholder="e.g. read:samples" />
              </div>
              <Button variant="secondary" disabled={!newPerm.trim()}>Add</Button>
            </form>
          </FormRow>

          {error && <div style={{ marginTop: 8 }}><Badge variant="danger">{error}</Badge></div>}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button variant="primary" onClick={save} loading={saving} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}

function UserAssignment({ roles }) {
  const [userId, setUserId] = useState("");
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [assignedRoles, setAssignedRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);

  const load = async (e) => {
    e?.preventDefault();
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    setNotice(null);
    try {
      const data = await rolesApi.getUserRoles(id);
      setAssignedRoles(data.roles);
      setLoadedUserId(data.user_id);
    } catch (err) {
      setError(err.status === 404 ? `No user with id ${id}.` : (err.message || "Lookup failed"));
      setLoadedUserId(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (roleName) => {
    setAssignedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice(null);
    try {
      const data = await rolesApi.setUserRoles(loadedUserId, assignedRoles);
      setAssignedRoles(data.roles);
      setNotice({ type: "success", text: "Roles updated." });
    } catch (err) {
      setError(
        err.status === 403
          ? "Cannot modify your own roles to grant yourself additional permissions."
          : (err.message || "Save failed")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 520 }}>
      <Panel>
        <PanelHeader title="◈  Find User" icon iconColor="blue" />
        <PanelBody>
          <form onSubmit={load} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <FormRow label="User ID">
                <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="e.g. 42" />
              </FormRow>
            </div>
            <Button variant="secondary" disabled={loading || !userId.trim()}>
              {loading ? "Loading…" : "Load"}
            </Button>
          </form>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)", marginTop: 6 }}>
            Lookup is by numeric user ID — there's no user directory/search endpoint yet.
          </div>
        </PanelBody>
      </Panel>

      {error && <Badge variant="danger">{error}</Badge>}
      {notice && <Badge variant={notice.type === "error" ? "danger" : "success"}>{notice.text}</Badge>}

      {loadedUserId !== null && (
        <Panel>
          <PanelHeader title={`◈  Roles for user #${loadedUserId}`} icon iconColor="teal" />
          <PanelBody>
            {roles.length === 0 ? (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>No roles exist yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {roles.map((r) => (
                  <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-size-sm)", color: "var(--text)", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={assignedRoles.includes(r.name)}
                      onChange={() => toggleRole(r.name)}
                    />
                    {r.name}
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontFamily: "var(--mono)" }}>
                      ({r.permission_count} permission{r.permission_count === 1 ? "" : "s"})
                    </span>
                  </label>
                ))}
              </div>
            )}
            <Button variant="primary" onClick={save} loading={saving} disabled={saving}>
              {saving ? "Saving…" : "Save Assignment"}
            </Button>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
