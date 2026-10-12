import { useState } from "react";
import { Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";

import Button from "../../components/common/Button.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import FilterBar from "../../components/common/FilterBar.jsx";
import FormModal from "../../components/common/FormModal.jsx";
import Pagination from "../../components/common/Pagination.jsx";
import Select from "../../components/common/Select.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useResourceList } from "../../hooks/useResourceList.js";
import { useToast } from "../../hooks/useToast.js";
import collegesService from "../../services/colleges.service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate } from "../../utils/formatters.js";

// Backend (colleges.schema.ts): name 2-200, city 2-100, contactPerson <=100,
// phone <=20, email valid, isActive boolean. Every route needs
// `colleges.manage`.
function getFields(isEdit) {
  return [
    {
      name: "name",
      label: "College name",
      required: true,
      minLength: 2,
      maxLength: 200,
    },
    {
      name: "city",
      label: "City",
      required: true,
      minLength: 2,
      maxLength: 100,
      width: "half",
    },
    {
      name: "contactPerson",
      label: "Contact person",
      maxLength: 100,
      width: "half",
    },
    {
      name: "phone",
      label: "Phone",
      type: "tel",
      maxLength: 20,
      inputMode: "tel",
      width: "half",
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      width: "half",
      hint: isEdit
        ? "An email can be changed but not removed."
        : undefined,
    },
    {
      name: "isActive",
      label: "Active (available for new drives and candidates)",
      type: "checkbox",
    },
  ];
}

const CREATE_FIELDS = getFields(false);
const EDIT_FIELDS = getFields(true);

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

// Create: send only the fields that have a value.
// Edit: send only fields that changed. Cleared contact person / phone are
// sent as "" (the API stores an empty value); an empty email cannot be sent
// because the API rejects it, so it is left unchanged.
function toApiPayload(values, college) {
  const payload = { ...values };

  if (!payload.email) {
    delete payload.email;
  }

  if (!college) {
    ["contactPerson", "phone"].forEach((key) => {
      if (!payload[key]) {
        delete payload[key];
      }
    });

    return payload;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) => value !== (college[key] ?? (key === "isActive" ? false : "")),
    ),
  );
}

function IconButton({ label, onClick, tone = "default", children }) {
  const toneClass =
    tone === "danger"
      ? "text-[#D32F2F] hover:bg-red-50"
      : "text-[#1B3A1E] hover:bg-green-50";

  return (
    <button
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A1E]/40 ${toneClass}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

export default function Colleges() {
  const toast = useToast();

  const list = useResourceList((params) => collegesService.list(params), {
    initialFilters: { search: "", isActive: "" },
  });

  // null = closed, {} = create, college = edit
  const [formTarget, setFormTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const editing = formTarget && formTarget.id ? formTarget : null;

  async function handleSave(values) {
    const payload = toApiPayload(values, editing);

    if (editing) {
      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save");
        return;
      }

      await collegesService.update(editing.id, payload);
      toast.success("College updated");
    } else {
      await collegesService.create(payload);
      toast.success("College created");
    }

    list.reload();
  }

  async function handleToggleActive(college) {
    const next = !college.isActive;

    await collegesService.update(college.id, { isActive: next });
    toast.success(next ? "College activated" : "College deactivated");
    list.reload();
  }

  async function handleDelete(college) {
    await collegesService.remove(college.id);
    toast.success("College deleted");
    list.reload();
  }

  const columns = [
    {
      key: "name",
      label: "College",
      render: (college) => (
        <div className="min-w-[10rem]">
          <p className="font-medium text-gray-900">{college.name}</p>
          <p className="text-xs text-gray-500 sm:hidden">{college.city}</p>
        </div>
      ),
    },
    { key: "city", label: "City", hideBelow: "sm" },
    {
      key: "contact",
      label: "Contact",
      hideBelow: "md",
      render: (college) => {
        const lines = [
          college.contactPerson,
          college.phone,
          college.email,
        ].filter(Boolean);

        return lines.length > 0 ? (
          <div className="min-w-[10rem] text-gray-600">
            {lines.map((line) => (
              <p className="break-words" key={line}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        );
      },
    },
    {
      key: "isActive",
      label: "Status",
      render: (college) => (
        <StatusBadge status={college.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key: "createdAt",
      label: "Added",
      hideBelow: "lg",
      render: (college) => formatDate(college.createdAt),
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "w-1",
      render: (college) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            label={`Edit ${college.name}`}
            onClick={() => setFormTarget(college)}
          >
            <Pencil size={18} />
          </IconButton>

          {college.isActive ? (
            <IconButton
              label={`Deactivate ${college.name}`}
              onClick={() => setStatusTarget(college)}
            >
              <PowerOff size={18} />
            </IconButton>
          ) : (
            <IconButton
              label={`Activate ${college.name}`}
              onClick={() =>
                handleToggleActive(college).catch((error) =>
                  toast.error(getErrorMessage(error)),
                )
              }
            >
              <Power size={18} />
            </IconButton>
          )}

          <IconButton
            label={`Delete ${college.name}`}
            onClick={() => setDeleteTarget(college)}
            tone="danger"
          >
            <Trash2 size={18} />
          </IconButton>
        </div>
      ),
    },
  ];

  const addButton = (
    <Button onClick={() => setFormTarget({})}>
      <Plus aria-hidden="true" size={18} />
      Add college
    </Button>
  );

  return (
    <div>
      <PageHeader
        actions={addButton}
        description="Manage partner colleges used for recruitment drives."
        title="Colleges"
      />

      <FilterBar
        hasActiveFilters={list.hasActiveFilters}
        onReset={list.resetFilters}
        onSearchChange={list.setSearch}
        search={list.search}
        searchLabel="Search colleges"
        searchPlaceholder="Name, city, contact or email"
      >
        <Select
          id="college-status-filter"
          label="Status"
          onChange={(event) =>
            list.setFilter("isActive", event.target.value)
          }
          value={list.filters.isActive}
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable
        caption="Colleges"
        columns={columns}
        emptyAction={
          list.hasActiveFilters ? (
            <Button onClick={list.resetFilters} variant="secondary">
              Reset filters
            </Button>
          ) : (
            addButton
          )
        }
        emptyDescription={
          list.hasActiveFilters
            ? "Try a different search or clear the filters."
            : "Add the first college to start planning drives."
        }
        emptyTitle={
          list.hasActiveFilters
            ? "No colleges match your filters"
            : "No colleges yet"
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
        fields={editing ? EDIT_FIELDS : CREATE_FIELDS}
        initialValues={editing ?? { isActive: true }}
        key={editing ? editing.id : "create"}
        omitEmpty={false}
        onClose={() => setFormTarget(null)}
        onSubmit={handleSave}
        open={formTarget !== null}
        submitLabel={editing ? "Save changes" : "Create college"}
        title={editing ? "Edit college" : "Add college"}
      />

      <ConfirmDialog
        confirmLabel="Deactivate"
        message={`${statusTarget?.name ?? "This college"} will no longer be selectable for new drives or candidates. Existing records are kept, and you can activate it again later.`}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => handleToggleActive(statusTarget)}
        open={statusTarget !== null}
        title="Deactivate college"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Delete"
        message={`Delete ${deleteTarget?.name ?? "this college"}? It will be removed from the list and can no longer be used for new drives or candidates. This cannot be undone from this screen.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        open={deleteTarget !== null}
        title="Delete college"
      />
    </div>
  );
}
