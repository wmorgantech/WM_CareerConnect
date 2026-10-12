import { useCallback, useEffect, useState } from "react";
import { Pencil, Power, PowerOff, Trash2, UserPlus } from "lucide-react";

import Button from "../../components/common/Button.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import FilterBar from "../../components/common/FilterBar.jsx";
import FormModal from "../../components/common/FormModal.jsx";
import Pagination from "../../components/common/Pagination.jsx";
import Select from "../../components/common/Select.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import { ErrorPanel } from "../../components/dashboard/DashboardParts.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useResourceList } from "../../hooks/useResourceList.js";
import { useToast } from "../../hooks/useToast.js";
import { ApiError } from "../../services/api.js";
import { getRoles } from "../../services/roles.service.js";
import usersService from "../../services/users.service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate, formatRoleName } from "../../utils/formatters.js";

// Backend (users.schema.ts): name 2-100, email valid, password 8-100,
// roleIds: at least one role id. All /users routes need `users.manage`
// (SUPER_ADMIN only). The list supports search, status, page and limit; it
// has no role filter.
const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const SAME_SET = (a, b) =>
  a.length === b.length && a.every((value) => b.includes(value));

// The API reports a few failures as non-validation errors. Re-shape them so
// FormModal shows the message beside the field it belongs to.
function toFieldError(error) {
  if (error?.code === "USER_ALREADY_EXISTS") {
    return new ApiError(error.message, {
      status: error.status,
      code: error.code,
      details: { fieldErrors: { email: [error.message] } },
    });
  }

  if (error?.code === "INVALID_ROLES") {
    return new ApiError(error.message, {
      status: error.status,
      code: error.code,
      details: { fieldErrors: { roleIds: [error.message] } },
    });
  }

  return error;
}

function getFields({ isEdit, isSelf, roleOptions }) {
  return [
    {
      name: "name",
      label: "Full name",
      required: true,
      minLength: 2,
      maxLength: 100,
      autoComplete: "off",
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      autoComplete: "off",
    },
    {
      name: "password",
      label: isEdit ? "New password" : "Password",
      type: "password",
      required: !isEdit,
      minLength: 8,
      maxLength: 100,
      autoComplete: "new-password",
      hint: isEdit
        ? "Leave blank to keep the current password. Otherwise 8–100 characters."
        : "8–100 characters. Share it with the user securely.",
    },
    {
      name: "roleIds",
      label: "Roles",
      type: "multiselect",
      required: true,
      options: roleOptions,
      disabled: isSelf,
      hint: isSelf
        ? "You cannot change your own roles."
        : "Choose at least one role.",
    },
  ];
}

function IconButton({
  label,
  onClick,
  disabled = false,
  tone = "default",
  children,
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#D32F2F] hover:bg-red-50"
      : "text-[#1B3A1E] hover:bg-green-50";

  return (
    <button
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A1E]/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${toneClass}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export default function Users() {
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const list = useResourceList((params) => usersService.list(params), {
    initialFilters: { search: "", status: "" },
  });

  const [roles, setRoles] = useState({
    items: [],
    loading: true,
    error: null,
  });

  const loadRoles = useCallback(async () => {
    setRoles((current) => ({ ...current, loading: true, error: null }));

    try {
      const items = await getRoles();

      setRoles({ items, loading: false, error: null });
    } catch (error) {
      setRoles({ items: [], loading: false, error });
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // null = closed, {} = create, user = edit
  const [formTarget, setFormTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const editing = formTarget && formTarget.id ? formTarget : null;
  const editingSelf = Boolean(editing && editing.id === currentUser?.id);

  const roleOptions = roles.items.map((role) => ({
    value: role.id,
    label: formatRoleName(role.name),
  }));

  async function handleSave(values) {
    const payload = { ...values };

    try {
      if (editing) {
        const currentRoleIds = editing.roles.map((role) => role.id);
        const changes = {};

        if (payload.name !== editing.name) {
          changes.name = payload.name;
        }

        if (payload.email.toLowerCase() !== editing.email.toLowerCase()) {
          changes.email = payload.email;
        }

        if (payload.password) {
          changes.password = payload.password;
        }

        if (!editingSelf && !SAME_SET(payload.roleIds, currentRoleIds)) {
          changes.roleIds = payload.roleIds;
        }

        if (Object.keys(changes).length === 0) {
          toast.info("No changes to save");
          return;
        }

        await usersService.update(editing.id, changes);
        toast.success("User updated");
      } else {
        await usersService.create(payload);
        toast.success("User created");
      }
    } catch (error) {
      throw toFieldError(error);
    }

    list.reload();
  }

  async function handleToggleStatus(target) {
    const next = target.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

    await usersService.updateStatus(target.id, next);
    toast.success(next === "ACTIVE" ? "User activated" : "User deactivated");
    list.reload();
  }

  async function handleDelete(target) {
    await usersService.remove(target.id);
    toast.success("User deleted");
    list.reload();
  }

  const isSelf = (user) => user.id === currentUser?.id;

  const columns = [
    {
      key: "name",
      label: "User",
      render: (user) => (
        <div className="min-w-[11rem]">
          <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900">
            {user.name}
            {isSelf(user) && <StatusBadge tone="info">You</StatusBadge>}
          </p>
          <p className="break-all text-xs text-gray-500">{user.email}</p>
        </div>
      ),
    },
    {
      key: "roles",
      label: "Roles",
      render: (user) =>
        user.roles?.length > 0 ? (
          <div className="flex min-w-[8rem] flex-wrap gap-1">
            {user.roles.map((role) => (
              <StatusBadge key={role.id} tone="neutral">
                {formatRoleName(role.name)}
              </StatusBadge>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">No role</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      render: (user) => <StatusBadge status={user.status} />,
    },
    {
      key: "createdAt",
      label: "Added",
      hideBelow: "lg",
      render: (user) => formatDate(user.createdAt),
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "w-1",
      render: (user) => {
        const self = isSelf(user);

        return (
          <div className="flex items-center justify-end gap-1">
            <IconButton
              disabled={roles.loading || Boolean(roles.error)}
              label={`Edit ${user.name}`}
              onClick={() => setFormTarget(user)}
            >
              <Pencil size={18} />
            </IconButton>

            {user.status === "ACTIVE" ? (
              <IconButton
                disabled={self}
                label={
                  self
                    ? "You cannot deactivate your own account"
                    : `Deactivate ${user.name}`
                }
                onClick={() => setStatusTarget(user)}
              >
                <PowerOff size={18} />
              </IconButton>
            ) : (
              <IconButton
                label={`Activate ${user.name}`}
                onClick={() =>
                  handleToggleStatus(user).catch((error) =>
                    toast.error(getErrorMessage(error)),
                  )
                }
              >
                <Power size={18} />
              </IconButton>
            )}

            <IconButton
              disabled={self}
              label={
                self
                  ? "You cannot delete your own account"
                  : `Delete ${user.name}`
              }
              onClick={() => setDeleteTarget(user)}
              tone="danger"
            >
              <Trash2 size={18} />
            </IconButton>
          </div>
        );
      },
    },
  ];

  const addButton = (
    <Button
      disabled={roles.loading || Boolean(roles.error)}
      onClick={() => setFormTarget({})}
    >
      <UserPlus aria-hidden="true" size={18} />
      Add user
    </Button>
  );

  return (
    <div>
      <PageHeader
        actions={addButton}
        description="Manage staff accounts, their roles and access."
        title="Users & Roles"
      />

      {roles.error && (
        <ErrorPanel
          error={roles.error}
          onRetry={loadRoles}
        />
      )}

      <FilterBar
        hasActiveFilters={list.hasActiveFilters}
        onReset={list.resetFilters}
        onSearchChange={list.setSearch}
        search={list.search}
        searchLabel="Search users"
        searchPlaceholder="Name or email"
      >
        <Select
          id="user-status-filter"
          label="Status"
          onChange={(event) => list.setFilter("status", event.target.value)}
          value={list.filters.status}
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable
        caption="Users"
        columns={columns}
        emptyAction={
          list.hasActiveFilters ? (
            <Button onClick={list.resetFilters} variant="secondary">
              Reset filters
            </Button>
          ) : undefined
        }
        emptyDescription={
          list.hasActiveFilters
            ? "Try a different search or clear the filters."
            : "Add the first staff user to get started."
        }
        emptyTitle={
          list.hasActiveFilters
            ? "No users match your filters"
            : "No users yet"
        }
        error={list.error}
        loading={list.loading}
        onRetry={list.reload}
        rows={list.items}
      />

      {!list.error && list.pagination.total > 0 && (
        <div className="mt-4">
          <Pagination
            disabled={list.loading}
            limit={list.limit}
            onLimitChange={list.setLimit}
            onPageChange={list.setPage}
            page={list.page}
            total={list.pagination.total}
            totalPages={list.pagination.totalPages}
          />
        </div>
      )}

      <FormModal
        fields={getFields({
          isEdit: Boolean(editing),
          isSelf: editingSelf,
          roleOptions,
        })}
        initialValues={
          editing
            ? {
                name: editing.name,
                email: editing.email,
                roleIds: editing.roles.map((role) => role.id),
              }
            : undefined
        }
        key={editing ? editing.id : "create"}
        onClose={() => setFormTarget(null)}
        onSubmit={handleSave}
        open={formTarget !== null}
        submitLabel={editing ? "Save changes" : "Create user"}
        title={editing ? "Edit user" : "Add user"}
      />

      <ConfirmDialog
        confirmLabel="Deactivate"
        message={`${statusTarget?.name ?? "This user"} will be signed out on their next request and cannot sign in until the account is activated again. Their records are kept.`}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => handleToggleStatus(statusTarget)}
        open={statusTarget !== null}
        title="Deactivate user"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Delete user"
        message={`Permanently delete ${deleteTarget?.name ?? "this user"} (${deleteTarget?.email ?? ""})? The account and its sessions are removed and this cannot be undone. To keep the record and only block sign-in, deactivate the user instead.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        open={deleteTarget !== null}
        title="Delete user"
      />
    </div>
  );
}
