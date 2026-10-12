import { Link } from "react-router-dom";

import Button from "../../components/common/Button.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import FilterBar from "../../components/common/FilterBar.jsx";
import Pagination from "../../components/common/Pagination.jsx";
import Select from "../../components/common/Select.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useResourceList } from "../../hooks/useResourceList.js";
import interviewsService from "../../services/interviews.service.js";
import {
  formatIst,
  getFeedbackState,
  STATUS_OPTIONS,
} from "../interviews/interviewHelpers.js";
import {
  FeedbackBadge,
  InterviewStatusBadge,
} from "../interviews/interviewParts.jsx";

// The signed-in interviewer's own interviews. GET /interviews returns only
// interviews assigned to the caller unless they also hold
// `interviews.schedule`. The API filters by status (no text search).
//
// mode "all"       My Interviews: every status, with a Status filter
// mode "feedback"  Interview Feedback: completed interviews only, to give
//                  or review feedback
export default function MyInterviews({ mode = "all" }) {
  const isFeedbackMode = mode === "feedback";

  const list = useResourceList((params) => interviewsService.list(params), {
    initialFilters: { status: isFeedbackMode ? "COMPLETED" : "" },
  });

  const columns = [
    {
      key: "candidate",
      label: "Candidate",
      render: (interview) => (
        <div className="min-w-[10rem]">
          <Link
            className="font-medium text-[#1B3A1E] hover:underline"
            to={`/interviewer/interviews/${interview.id}`}
          >
            {interview.candidate?.name ?? "Unknown candidate"}
          </Link>
          <p className="break-all text-xs text-gray-500">
            {interview.candidate?.email}
          </p>
        </div>
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
      label: <span className="sr-only">Open</span>,
      className: "w-1",
      render: (interview) => {
        const state = getFeedbackState(interview);

        return (
          <Link
            className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
            to={`/interviewer/interviews/${interview.id}`}
          >
            {state === "pending" || state === "unlocked"
              ? "Give feedback"
              : "Open"}
          </Link>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        description={
          isFeedbackMode
            ? "Completed interviews: submit feedback or review what you submitted. Times are in IST."
            : "Interviews assigned to you. Times are in IST."
        }
        title={isFeedbackMode ? "Interview Feedback" : "My Interviews"}
      />

      {!isFeedbackMode && (
        <FilterBar
          hasActiveFilters={list.hasActiveFilters}
          onReset={list.resetFilters}
        >
          <Select
            id="my-interview-status-filter"
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
        </FilterBar>
      )}

      <DataTable
        caption={isFeedbackMode ? "Completed interviews" : "My interviews"}
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
            ? "Try a different status or clear the filter."
            : isFeedbackMode
              ? "Interviews appear here once HR marks them completed."
              : "Interviews scheduled for you will appear here."
        }
        emptyTitle={
          list.hasActiveFilters
            ? "No interviews match your filter"
            : isFeedbackMode
              ? "No completed interviews yet"
              : "No interviews assigned yet"
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
    </div>
  );
}
