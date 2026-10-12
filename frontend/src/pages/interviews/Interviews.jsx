import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, CalendarPlus, CheckCircle2, Pencil } from "lucide-react";

import Button from "../../components/common/Button.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import FilterBar from "../../components/common/FilterBar.jsx";
import FormModal from "../../components/common/FormModal.jsx";
import Pagination from "../../components/common/Pagination.jsx";
import Select from "../../components/common/Select.jsx";
import { ErrorPanel } from "../../components/dashboard/DashboardParts.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useResourceList } from "../../hooks/useResourceList.js";
import { useToast } from "../../hooks/useToast.js";
import interviewsService from "../../services/interviews.service.js";
import CandidatePicker from "./CandidatePicker.jsx";
import {
  buildInterviewerOptions,
  formatIst,
  getInterviewerName,
  getScheduleFields,
  scheduleInitialValues,
  STATUS_OPTIONS,
  toCreatePayload,
  toFieldError,
  toUpdatePayload,
  validateSchedule,
} from "./interviewHelpers.js";
import { FeedbackBadge, InterviewStatusBadge } from "./interviewParts.jsx";
import { useInterviewers } from "./useInterviewers.js";

// Management list for `interviews.schedule` holders (SUPER_ADMIN, HR_ADMIN).
// The API lists with candidateId, interviewerId, status, page and limit
// filters (no text search) and returns the interviewer as an id only, so
// names come from the interviewers lookup.

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

export default function Interviews() {
  const toast = useToast();
  const { user } = useAuth();

  const list = useResourceList((params) => interviewsService.list(params), {
    initialFilters: { status: "", interviewerId: "" },
  });

  const interviewers = useInterviewers();
  const interviewersUnavailable =
    interviewers.loading || Boolean(interviewers.error);

  // null = closed, {} = schedule, interview = edit
  const [formTarget, setFormTarget] = useState(null);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const editing = formTarget && formTarget.id ? formTarget : null;

  const interviewerFilterOptions = interviewers.items.map((interviewer) => ({
    value: interviewer.id,
    label: interviewer.name,
  }));

  const nameOf = (interview) =>
    getInterviewerName(interview, interviewers.byId, user);

  async function handleSave(values) {
    try {
      if (editing) {
        const changes = toUpdatePayload(values, editing);

        if (Object.keys(changes).length === 0) {
          toast.info("No changes to save");
          return;
        }

        await interviewsService.update(editing.id, changes);
        toast.success("Interview updated");
      } else {
        await interviewsService.create(toCreatePayload(values));
        toast.success("Interview scheduled");
      }
    } catch (error) {
      throw toFieldError(error);
    }

    list.reload();
  }

  async function handleComplete(interview) {
    await interviewsService.update(interview.id, { status: "COMPLETED" });
    toast.success("Interview marked as completed");
    list.reload();
  }

  async function handleCancel(interview) {
    await interviewsService.remove(interview.id);
    toast.success("Interview cancelled");
    list.reload();
  }

  const columns = [
    {
      key: "candidate",
      label: "Candidate",
      render: (interview) => (
        <div className="min-w-[10rem]">
          <Link
            className="font-medium text-[#1B3A1E] hover:underline"
            to={`/admin/interviews/${interview.id}`}
          >
            {interview.candidate?.name ?? "Unknown candidate"}
          </Link>
          <p className="break-all text-xs text-gray-500">
            {interview.candidate?.email}
          </p>
          <p className="text-xs text-gray-500 sm:hidden">
            {nameOf(interview)}
          </p>
        </div>
      ),
    },
    {
      key: "interviewer",
      label: "Interviewer",
      hideBelow: "sm",
      render: (interview) => (
        <span className="text-gray-700">{nameOf(interview)}</span>
      ),
    },
    {
      key: "scheduledAt",
      label: "When",
      render: (interview) => (
        <div className="min-w-[9rem]">
          <p className="text-gray-900">{formatIst(interview.scheduledAt)}</p>
          <p className="text-xs text-gray-500">
            {interview.durationMinutes} min
          </p>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (interview) => (
        <div className="flex flex-wrap gap-1">
          <InterviewStatusBadge status={interview.status} />
          <FeedbackBadge interview={interview} />
        </div>
      ),
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "w-1",
      render: (interview) => (
        <div className="flex items-center justify-end gap-1">
          <IconButton
            label={`Edit interview with ${interview.candidate?.name}`}
            onClick={() => setFormTarget(interview)}
          >
            <Pencil size={18} />
          </IconButton>

          {interview.status === "SCHEDULED" && (
            <IconButton
              label={`Mark interview with ${interview.candidate?.name} as completed`}
              onClick={() => setCompleteTarget(interview)}
            >
              <CheckCircle2 size={18} />
            </IconButton>
          )}

          {interview.status !== "CANCELLED" && (
            <IconButton
              label={`Cancel interview with ${interview.candidate?.name}`}
              onClick={() => setCancelTarget(interview)}
              tone="danger"
            >
              <Ban size={18} />
            </IconButton>
          )}
        </div>
      ),
    },
  ];

  const scheduleButton = (
    <Button
      disabled={interviewersUnavailable}
      onClick={() => setFormTarget({})}
    >
      <CalendarPlus aria-hidden="true" size={18} />
      Schedule interview
    </Button>
  );

  return (
    <div>
      <PageHeader
        actions={scheduleButton}
        description="Schedule interviews and follow their progress. Times are in IST."
        title="Interviews"
      />

      {interviewers.error && (
        <ErrorPanel error={interviewers.error} onRetry={interviewers.reload} />
      )}

      <FilterBar
        hasActiveFilters={list.hasActiveFilters}
        onReset={list.resetFilters}
      >
        <Select
          id="interview-status-filter"
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
          disabled={interviewersUnavailable}
          id="interview-interviewer-filter"
          label="Interviewer"
          onChange={(event) =>
            list.setFilter("interviewerId", event.target.value)
          }
          value={list.filters.interviewerId}
        >
          <option value="">All interviewers</option>
          {interviewerFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FilterBar>

      <DataTable
        caption="Interviews"
        columns={columns}
        emptyAction={
          list.hasActiveFilters ? (
            <Button onClick={list.resetFilters} variant="secondary">
              Reset filters
            </Button>
          ) : (
            scheduleButton
          )
        }
        emptyDescription={
          list.hasActiveFilters
            ? "Try a different filter or clear the filters."
            : "Schedule the first interview for an active candidate."
        }
        emptyTitle={
          list.hasActiveFilters
            ? "No interviews match your filters"
            : "No interviews yet"
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
        fields={getScheduleFields({
          isEdit: Boolean(editing),
          interviewerOptions: buildInterviewerOptions(
            interviewers.items,
            editing,
          ),
          renderCandidate: (props) => <CandidatePicker {...props} />,
          currentMeetingLink: editing?.meetingLink ?? undefined,
        })}
        initialValues={scheduleInitialValues(editing)}
        key={editing ? editing.id : "create"}
        omitEmpty={false}
        onClose={() => setFormTarget(null)}
        onSubmit={handleSave}
        open={formTarget !== null}
        size="lg"
        submitLabel={editing ? "Save changes" : "Schedule interview"}
        title={
          editing
            ? `Edit interview – ${editing.candidate?.name ?? "candidate"}`
            : "Schedule interview"
        }
        validate={editing ? undefined : validateSchedule}
      />

      <ConfirmDialog
        confirmLabel="Mark completed"
        message={`Mark the interview with ${completeTarget?.candidate?.name ?? "this candidate"} as completed? The assigned interviewer can then submit feedback.`}
        onCancel={() => setCompleteTarget(null)}
        onConfirm={() => handleComplete(completeTarget)}
        open={completeTarget !== null}
        title="Mark interview completed"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Cancel interview"
        message={`Cancel the interview with ${cancelTarget?.candidate?.name ?? "this candidate"} on ${cancelTarget ? formatIst(cancelTarget.scheduledAt) : ""}? It stays in the list marked Cancelled.`}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => handleCancel(cancelTarget)}
        open={cancelTarget !== null}
        title="Cancel interview"
      />
    </div>
  );
}

