import { useState } from "react";
import { Link } from "react-router-dom";
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
import { useResourceList } from "../../hooks/useResourceList.js";
import { useToast } from "../../hooks/useToast.js";
import candidatesService from "../../services/candidates.service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate } from "../../utils/formatters.js";
import {
  buildCollegeOptions,
  candidateInitialValues,
  collegeLabel,
  getCandidateFields,
  toCreatePayload,
  toFieldError,
  toUpdatePayload,
} from "./candidateForm.js";
import { useColleges } from "./useColleges.js";

// Backend: every /candidates route needs `candidates.manage`. The list
// supports search (name, email, phone), collegeId, isActive, page and limit.
// There is no shortlist / reject / application-status workflow in the API,
// so none is offered here.
const ACTIVE_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
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

export default function Candidates() {
  const toast = useToast();

  const list = useResourceList((params) => candidatesService.list(params), {
    initialFilters: { search: "", isActive: "", collegeId: "" },
  });

  const colleges = useColleges();
  const collegesUnavailable = colleges.loading || Boolean(colleges.error);

  // null = closed, {} = create, candidate = edit
  const [formTarget, setFormTarget] = useState(null);
  const [activeTarget, setActiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const editing = formTarget && formTarget.id ? formTarget : null;

  const collegeFilterOptions = colleges.items.map((college) => ({
    value: college.id,
    label: college.isActive
      ? collegeLabel(college)
      : `${collegeLabel(college)} – inactive`,
  }));

  async function handleSave(values) {
    try {
      if (editing) {
        const changes = toUpdatePayload(values, editing);

        if (Object.keys(changes).length === 0) {
          toast.info("No changes to save");
          return;
        }

        await candidatesService.update(editing.id, changes);
        toast.success("Candidate updated");
      } else {
        await candidatesService.create(toCreatePayload(values));
        toast.success("Candidate created");
      }
    } catch (error) {
      throw toFieldError(error);
    }

    list.reload();
  }

  async function handleToggleActive(candidate) {
    const next = !candidate.isActive;

    await candidatesService.update(candidate.id, { isActive: next });
    toast.success(next ? "Candidate activated" : "Candidate deactivated");
    list.reload();
  }

  async function handleDelete(candidate) {
    await candidatesService.remove(candidate.id);
    toast.success("Candidate deleted");
    list.reload();
  }

  const columns = [
    {
      key: "name",
      label: "Candidate",
      render: (candidate) => (
        <div className="min-w-[11rem]">
          <Link
            className="font-medium text-[#1B3A1E] hover:underline"
            to={`/admin/candidates/${candidate.id}`}
          >
            {candidate.name}
          </Link>
          <p className="break-all text-xs text-gray-500">{candidate.email}</p>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      hideBelow: "md",
      render: (candidate) =>
        candidate.phone ? (
          <span className="whitespace-nowrap text-gray-600">
            {candidate.phone}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "college",
      label: "College",
      hideBelow: "sm",
      render: (candidate) =>
        candidate.college ? (
          <div className="min-w-[8rem] text-gray-600">
            <p>{candidate.college.name}</p>
            <p className="text-xs text-gray-400">{candidate.college.city}</p>
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (candidate) => (
        <StatusBadge status={candidate.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
    {
      key: "createdAt",
      label: "Added",
      hideBelow: "lg",
      render: (candidate) => formatDate(candidate.createdAt),
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "w-1",
      render: (candidate) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            disabled={collegesUnavailable}
            label={`Edit ${candidate.name}`}
            onClick={() => setFormTarget(candidate)}
          >
            <Pencil size={18} />
          </IconButton>

          {candidate.isActive ? (
            <IconButton
              label={`Deactivate ${candidate.name}`}
              onClick={() => setActiveTarget(candidate)}
            >
              <PowerOff size={18} />
            </IconButton>
          ) : (
            <IconButton
              label={`Activate ${candidate.name}`}
              onClick={() =>
                handleToggleActive(candidate).catch((error) =>
                  toast.error(getErrorMessage(error)),
                )
              }
            >
              <Power size={18} />
            </IconButton>
          )}

          <IconButton
            label={`Delete ${candidate.name}`}
            onClick={() => setDeleteTarget(candidate)}
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
      <UserPlus aria-hidden="true" size={18} />
      Add candidate
    </Button>
  );

  return (
    <div>
      <PageHeader
        actions={addButton}
        description="Browse and manage candidate records."
        title="Candidates"
      />

      {colleges.error && (
        <ErrorPanel error={colleges.error} onRetry={colleges.reload} />
      )}

      <FilterBar
        hasActiveFilters={list.hasActiveFilters}
        onReset={list.resetFilters}
        onSearchChange={list.setSearch}
        search={list.search}
        searchLabel="Search candidates"
        searchPlaceholder="Name, email or phone"
      >
        <Select
          id="candidate-active-filter"
          label="Status"
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
          id="candidate-college-filter"
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
        caption="Candidates"
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
            : "Add the first candidate to get started."
        }
        emptyTitle={
          list.hasActiveFilters
            ? "No candidates match your filters"
            : "No candidates yet"
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
        fields={getCandidateFields({
          isEdit: Boolean(editing),
          collegeOptions: buildCollegeOptions(colleges.items, editing),
          currentResumeUrl: editing?.resumeUrl ?? undefined,
        })}
        initialValues={candidateInitialValues(editing)}
        key={editing ? editing.id : "create"}
        omitEmpty={false}
        onClose={() => setFormTarget(null)}
        onSubmit={handleSave}
        open={formTarget !== null}
        submitLabel={editing ? "Save changes" : "Create candidate"}
        title={editing ? "Edit candidate" : "Add candidate"}
      />

      <ConfirmDialog
        confirmLabel="Deactivate"
        message={`${activeTarget?.name ?? "This candidate"} will be marked inactive and excluded from active candidate counts and from new interviews. The record is kept and you can activate it again.`}
        onCancel={() => setActiveTarget(null)}
        onConfirm={() => handleToggleActive(activeTarget)}
        open={activeTarget !== null}
        title="Deactivate candidate"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Delete"
        message={`Delete ${deleteTarget?.name ?? "this candidate"} (${deleteTarget?.email ?? ""})? The record is removed from the list and cannot be restored from this screen.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        open={deleteTarget !== null}
        title="Delete candidate"
      />
    </div>
  );
}
