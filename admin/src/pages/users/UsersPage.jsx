import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { usersApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { roleLabel } from "../../config/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import { formatDate } from "../../utils/format.js";
import UserColleges from "./UserColleges.jsx";
import UserForm from "./UserForm.jsx";

const fetchUsers = (params, signal) => usersApi.list(params, signal);
const INITIAL = { search: "", status: "" };

export default function UsersPage() {
  const toast = useToast();
  const { user: me } = useAuth();
  const list = useListQuery(fetchUsers, INITIAL);
  const [panel, setPanel] = useState(null);
  const [collegesFor, setCollegesFor] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const filtered = Object.values(list.filters).some((value) => value !== "");

  const columns = [
    {
      key: "name",
      header: "User",
      render: (u) => (
        <>
          <strong>
            {u.name}
            {u.id === me?.id ? <span className="you"> (you)</span> : null}
          </strong>
          <span className="sub">{u.email}</span>
        </>
      ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (u) => (
        <div className="chips">
          {u.roles.length === 0 ? "—" : u.roles.map((role) => <StatusBadge key={role.id}>{roleLabel(role.name)}</StatusBadge>)}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (u) => <StatusBadge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status === "ACTIVE" ? "Active" : "Inactive"}</StatusBadge>,
    },
    { key: "created", header: "Created", render: (u) => formatDate(u.createdAt) },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (u) => {
        const self = u.id === me?.id;

        return (
          <div className="rowactions">
            <ActionIcon icon={Pencil} label={`Edit ${u.name}`} onClick={() => setPanel({ user: u })} />
            {u.roles.some((role) => role.name === "HOD" || role.name === "STAFF") ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCollegesFor(u)}>
                Colleges
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirm({ kind: "toggle", user: u })}
              disabled={self && u.status === "ACTIVE"}
              title={self ? "You can't deactivate your own account" : undefined}
            >
              {u.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </button>
            <ActionIcon
              icon={Trash2}
              label={`Delete ${u.name}`}
              onClick={() => setConfirm({ kind: "delete", user: u })}
              disabled={self}
              title={self ? "You can't delete your own account" : undefined}
              danger
            />
          </div>
        );
      },
    },
  ];

  async function runConfirmed() {
    const { kind, user } = confirm;

    if (kind === "toggle") {
      await usersApi.setStatus(user.id, user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      toast.success(user.status === "ACTIVE" ? "User deactivated" : "User reactivated");
    } else {
      await usersApi.remove(user.id);
      toast.success("User deleted");
    }

    setConfirm(null);
    list.reload();
  }

  const active = confirm?.user.status === "ACTIVE";

  return (
    <div>
      <PageHeader
        title="Users & roles"
        description="Staff accounts and the roles that decide what they can do."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setPanel({ user: null })}>
            <Plus size={16} aria-hidden="true" />
            Add user
          </button>
        }
      />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name or email…" />
          <SelectFilter
            label="Status"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ]}
          />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={list.items}
          phase={list.phase}
          error={list.error}
          onRetry={list.reload}
          caption="Users"
          emptyTitle={filtered ? "No users match these filters" : "No users yet"}
          emptyText={filtered ? "Try different filters or clear them." : undefined}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {collegesFor ? (
        <UserColleges
          user={collegesFor}
          onClose={() => setCollegesFor(null)}
          onSaved={(message) => {
            setCollegesFor(null);
            toast.success(message);
          }}
        />
      ) : null}

      {panel ? (
        <UserForm
          user={panel.user}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            toast.success(message);
            list.reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === "delete" ? "Delete user?" : active ? "Deactivate user?" : "Reactivate user?"}
        message={
          confirm?.kind === "delete"
            ? `${confirm?.user.name} (${confirm?.user.email}) will be permanently removed. This can't be undone.`
            : active
              ? `${confirm?.user.name} will be signed out and won't be able to sign in until reactivated.`
              : `${confirm?.user.name} will be able to sign in again.`
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : active ? "Deactivate" : "Reactivate"}
        tone={confirm?.kind === "delete" || active ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
