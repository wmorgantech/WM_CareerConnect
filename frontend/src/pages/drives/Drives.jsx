import { useCallback, useEffect, useState } from "react";
import {
  Flag,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";

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
import { useResourceList } from "../../hooks/useResourceList.js";
import { useToast } from "../../hooks/useToast.js";
import { ApiError } from "../../services/api.js";
import collegesService from "../../services/colleges.service.js";
import drivesService from "../../services/drives.service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateOnly } from "../../utils/formatters.js";

// Backend (drives.schema.ts / drives.service.ts). Every route needs
// `drives.manage`.
//   list:   search (title, description), collegeId, status, isActive, page, limit
//   fields: title 2-200, description <=2000, collegeId (an ACTIVE, non-deleted
//           college), status, startDate, endDate, isActive
//   status: DRAFT | PUBLISHED | CLOSED | CANCELLED; the API accepts any
//           change from one to another.
const DRIVE_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED"];

const STATUS_OPTIONS = DRIVE_STATUSES.map((status) => ({
  value: status,
  label: status.charAt(0) + status.slice(1).toLowerCase(),
}));

const ACTIVE_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const COLLEGE_LIMIT = 100;

const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");

// UI-only sanity check: the API accepts an end date before the start date.
function validateDates(values) {
  if (
    values.startDate &&
    values.endDate &&
    values.endDate < values.startDate
  ) {
    return { endDate: "End date must be on or after the start date" };
  }

  return {};
}

// Create/update 404s for a missing or inactive college belong to the
// College field.
function toFieldError(error) {
  if (error?.code === "COLLEGE_NOT_FOUND") {
    return new ApiError(error.message, {
      status: error.status,
      code: error.code,
      details: { fieldErrors: { collegeId: [error.message] } },
    });
  }

  return error;
}

function collegeLabel(college) {
  return `${college.name} (${college.city})`;
}

function getFields({ isEdit, collegeOptions }) {
  return [
    {
      name: "title",
      label: "Drive title",
      required: true,
      minLength: 2,
      maxLength: 200,
    },
    {
      name: "collegeId",
      label: "College",
      type: "select",
      required: true,
      options: collegeOptions,
      placeholder: "Select a college",
      hint: "Only active colleges can be chosen.",
    },
    {
      name: "startDate",
      label: "Start date",
      type: "date",
      width: "half",
      hint: isEdit ? "A date can be changed but not removed." : undefined,
    },
    {
      name: "endDate",
      label: "End date",
      type: "date",
      width: "half",
      hint: isEdit ? "A date can be changed but not removed." : undefined,
    },
    ...(isEdit
      ? []
      : [
          {
            name: "status",
            label: "Status",
            type: "select",
            required: true,
            options: STATUS_OPTIONS,
            placeholder: "Select a status",
          },
        ]),
    {
      name: "description",
      label: "Description",
      type: "textarea",
      maxLength: 2000,
      rows: 4,
    },
  ];
}

const STATUS_FIELDS = [
  {
    name: "status",
    label: "Status",
    type: "select",
    required: true,
    options: STATUS_OPTIONS,
    placeholder: "Select a status",
    hint: "Any status can be set.",
  },
];

function IconButton({ label, onClick, disabled = false, tone = "default", children }) {
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

function formatDateRange(drive) {
  if (!drive.startDate && !drive.endDate) {
    return <span className="text-gray-400">Not scheduled</span>;
  }

  return (
    <span className="whitespace-nowrap text-gray-600">
      {formatDateOnly(drive.startDate)} – {formatDateOnly(drive.endDate)}
    </span>
  );
}

export default function Drives() {
  const toast = useToast();

  const list = useResourceList((params) => drivesService.list(params), {
    initialFilters: { search: "", status: "", isActive: "", collegeId: "" },
  });

  const [colleges, setColleges] = useState({
    items: [],
    loading: true,
    error: null,
  });

  const loadColleges = useCallback(async () => {
    setColleges((current) => ({ ...current, loading: true, error: null }));

    try {
      const { items } = await collegesService.list({
        limit: COLLEGE_LIMIT,
      });

      setColleges({ items, loading: false, error: null });
    } catch (error) {
      setColleges({ items: [], loading: false, error });
    }
  }, []);

  useEffect(() => {
    loadColleges();
  }, [loadColleges]);

  // null = closed, {} = create, drive = edit
  const [formTarget, setFormTarget] = useState(null);
  const [statusFormTarget, setStatusFormTarget] = useState(null);
  const [activeTarget, setActiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const editing = formTarget && formTarget.id ? formTarget : null;
  const collegesUnavailable = colleges.loading || Boolean(colleges.error);

  // New and edited drives may only use active colleges, but an edited drive
  // keeps showing its current college even if that college is now inactive.
  const collegeOptions = colleges.items
    .filter((college) => college.isActive)
    .map((college) => ({ value: college.id, label: collegeLabel(college) }));

  if (
    editing?.college &&
    !collegeOptions.some((option) => option.value === editing.college.id)
  ) {
    collegeOptions.unshift({
      value: editing.college.id,
      label: `${collegeLabel(editing.college)} – current`,
    });
  }

  const collegeFilterOptions = colleges.items.map((college) => ({
    value: college.id,
    label: college.isActive
      ? collegeLabel(college)
      : `${collegeLabel(college)} – inactive`,
  }));

  async function handleSave(values) {
    try {
      if (editing) {
        const changes = {};

        if (values.title !== editing.title) {
          changes.title = values.title;
        }

        if (values.collegeId !== editing.collegeId) {
          changes.collegeId = values.collegeId;
        }

        if ((values.description ?? "") !== (editing.description ?? "")) {
          changes.description = values.description ?? "";
        }

        ["startDate", "endDate"].forEach((key) => {
          if (values[key] && values[key] !== dateOnly(editing[key])) {
            changes[key] = values[key];
          }
        });

        if (Object.keys(changes).length === 0) {
          toast.info("No changes to save");
          return;
        }

        await drivesService.update(editing.id, changes);
        toast.success("Drive updated");
      } else {
        const payload = { ...values };

        ["description", "startDate", "endDate"].forEach((key) => {
          if (!payload[key]) {
            delete payload[key];
          }
        });

        await drivesService.create(payload);
        toast.success("Drive created");
      }
    } catch (error) {
      throw toFieldError(error);
    }

    list.reload();
  }

  async function handleStatusChange(values) {
    if (values.status === statusFormTarget.status) {
      toast.info("Status unchanged");
      return;
    }

    await drivesService.update(statusFormTarget.id, {
      status: values.status,
    });
    toast.success("Drive status updated");
    list.reload();
  }

  async function handleToggleActive(drive) {
    const next = !drive.isActive;

    await drivesService.update(drive.id, { isActive: next });
    toast.success(next ? "Drive activated" : "Drive deactivated");
    list.reload();
  }

  async function handleDelete(drive) {
    await drivesService.remove(drive.id);
    toast.success("Drive deleted");
    list.reload();
  }

  const columns = [
    {
      key: "title",
      label: "Drive",
      render: (drive) => (
        <div className="min-w-[10rem]">
          <p className="font-medium text-gray-900">{drive.title}</p>
          <p className="text-xs text-gray-500 sm:hidden">
            {drive.college?.name}
          </p>
        </div>
      ),
    },
    {
      key: "college",
      label: "College",
      hideBelow: "sm",
      render: (drive) =>
        drive.college ? (
          <div className="min-w-[8rem] text-gray-600">
            <p>{drive.college.name}</p>
            <p className="text-xs text-gray-400">{drive.college.city}</p>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "dates",
      label: "Dates",
      hideBelow: "md",
      render: formatDateRange,
    },
    {
      key: "status",
      label: "Status",
      render: (drive) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={drive.status} />
          {!drive.isActive && <StatusBadge status="INACTIVE" />}
        </div>
      ),
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "w-1",
      render: (drive) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            disabled={collegesUnavailable}
            label={`Edit ${drive.title}`}
            onClick={() => setFormTarget(drive)}
          >
            <Pencil size={18} />
          </IconButton>

          <IconButton
            label={`Change status of ${drive.title}`}
            onClick={() => setStatusFormTarget(drive)}
          >
            <Flag size={18} />
          </IconButton>

          {drive.isActive ? (
            <IconButton
              label={`Deactivate ${drive.title}`}
              onClick={() => setActiveTarget(drive)}
            >
              <PowerOff size={18} />
            </IconButton>
          ) : (
            <IconButton
              label={`Activate ${drive.title}`}
              onClick={() =>
                handleToggleActive(drive).catch((error) =>
                  toast.error(getErrorMessage(error)),
                )
              }
            >
              <Power size={18} />
            </IconButton>
          )}

          <IconButton
            label={`Delete ${drive.title}`}
            onClick={() => setDeleteTarget(drive)}
            tone="danger"
          >
            <Trash2 size={18} />
          </IconButton>
        </div>
      ),
    },
  ];

  const addButton = (
    <Button
      disabled={collegesUnavailable}
      onClick={() => setFormTarget({})}
    >
      <Plus aria-hidden="true" size={18} />
      Add drive
    </Button>
  );

  return (
    <div>
      <PageHeader
        actions={addButton}
        description="Plan and track campus recruitment drives."
        title="Drives"
      />

      {colleges.error && (
        <ErrorPanel error={colleges.error} onRetry={loadColleges} />
      )}

      <FilterBar
        hasActiveFilters={list.hasActiveFilters}
        onReset={list.resetFilters}
        onSearchChange={list.setSearch}
        search={list.search}
        searchLabel="Search drives"
        searchPlaceholder="Title or description"
      >
        <Select
          id="drive-status-filter"
          label="Status"
          onChange={(event) => list.setFilter("status", event.target.value)}
          value={list.filters.status}
        >
          <option value="">All</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          id="drive-active-filter"
          label="Active"
          onChange={(event) => list.setFilter("isActive", event.target.value)}
          value={list.filters.isActive}
        >
          {ACTIVE_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          disabled={collegesUnavailable}
          id="drive-college-filter"
          label="College"
          onChange={(event) =>
            list.setFilter("collegeId", event.target.value)
          }
          value={list.filters.collegeId}
        >
          <option value="">All colleges</option>
          {collegeFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable
        caption="Drives"
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
            : "Create the first drive for a partner college."
        }
        emptyTitle={
          list.hasActiveFilters
            ? "No drives match your filters"
            : "No drives yet"
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
        fields={getFields({ isEdit: Boolean(editing), collegeOptions })}
        initialValues={
          editing
            ? {
                title: editing.title,
                collegeId: editing.collegeId,
                description: editing.description,
                startDate: dateOnly(editing.startDate),
                endDate: dateOnly(editing.endDate),
              }
            : { status: "DRAFT" }
        }
        key={editing ? editing.id : "create"}
        omitEmpty={false}
        onClose={() => setFormTarget(null)}
        onSubmit={handleSave}
        open={formTarget !== null}
        size="lg"
        submitLabel={editing ? "Save changes" : "Create drive"}
        title={editing ? "Edit drive" : "Add drive"}
        validate={validateDates}
      />

      <FormModal
        fields={STATUS_FIELDS}
        initialValues={{ status: statusFormTarget?.status }}
        key={statusFormTarget?.id ?? "status"}
        onClose={() => setStatusFormTarget(null)}
        onSubmit={handleStatusChange}
        open={statusFormTarget !== null}
        size="sm"
        submitLabel="Update status"
        title={`Change status: ${statusFormTarget?.title ?? ""}`}
      />

      <ConfirmDialog
        confirmLabel="Deactivate"
        message={`${activeTarget?.title ?? "This drive"} will be marked inactive and no longer counted as an active drive. It stays in the list and you can activate it again.`}
        onCancel={() => setActiveTarget(null)}
        onConfirm={() => handleToggleActive(activeTarget)}
        open={activeTarget !== null}
        title="Deactivate drive"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Delete"
        message={`Delete ${deleteTarget?.title ?? "this drive"}? It will be removed from the list and from active drive counts. This cannot be undone from this screen.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        open={deleteTarget !== null}
        title="Delete drive"
      />
    </div>
  );
}
