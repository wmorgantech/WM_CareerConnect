import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Star, UserRound, Video } from "lucide-react";

import BarChart from "../../components/common/BarChart.jsx";
import Button from "../../components/common/Button.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import FilterBar from "../../components/common/FilterBar.jsx";
import Input from "../../components/common/Input.jsx";
import Pagination from "../../components/common/Pagination.jsx";
import Select from "../../components/common/Select.jsx";
import {
  ErrorPanel,
  StatCard,
} from "../../components/dashboard/DashboardParts.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { useResourceList } from "../../hooks/useResourceList.js";
import { useToast } from "../../hooks/useToast.js";
import drivesService from "../../services/drives.service.js";
import { exportReport, getReports } from "../../services/reports.service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate } from "../../utils/formatters.js";
import { useColleges } from "../candidates/useColleges.js";
import { formatIst, isHttpUrl } from "../interviews/interviewHelpers.js";
import { InterviewStatusBadge } from "../interviews/interviewParts.jsx";
import {
  EMPTY_FILTERS,
  EXPORT_ROW_LIMIT,
  getReportType,
  INTERVIEW_STATUSES,
  REPORT_TYPES,
  summarizeScores,
  toReportParams,
  validateDateRange,
} from "./reportConfig.js";
import { useReportSummary } from "./useReportSummary.js";

const NONE = <span className="text-gray-400">—</span>;

function Person({ candidate }) {
  return (
    <div className="min-w-[10rem]">
      <p className="font-medium text-gray-900">
        {candidate?.name ?? "Unknown candidate"}
      </p>
      <p className="break-all text-xs text-gray-500">{candidate?.email}</p>
    </div>
  );
}

function CollegeCell({ college }) {
  return college ? (
    <div className="min-w-[8rem] text-gray-600">
      <p>{college.name}</p>
      <p className="text-xs text-gray-400">{college.city}</p>
    </div>
  ) : (
    NONE
  );
}

function getColumns(type) {
  if (type === "INTERVIEWS") {
    return [
      {
        key: "candidate",
        label: "Candidate",
        render: (row) => <Person candidate={row.candidate} />,
      },
      {
        key: "college",
        label: "College",
        hideBelow: "sm",
        render: (row) => <CollegeCell college={row.candidate?.college} />,
      },
      {
        key: "scheduledAt",
        label: "Interview (IST)",
        render: (row) => (
          <div className="min-w-[9rem]">
            <p className="text-gray-900">{formatIst(row.scheduledAt)}</p>
            <p className="text-xs text-gray-500">{row.durationMinutes} min</p>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        render: (row) => <InterviewStatusBadge status={row.status} />,
      },
      {
        key: "score",
        label: "Score",
        hideBelow: "md",
        render: (row) => (row.score ?? row.score === 0 ? row.score : NONE),
      },
    ];
  }

  if (type === "RESULTS") {
    return [
      {
        key: "candidate",
        label: "Candidate",
        render: (row) => <Person candidate={row.candidate} />,
      },
      {
        key: "college",
        label: "College",
        hideBelow: "sm",
        render: (row) => <CollegeCell college={row.candidate?.college} />,
      },
      {
        key: "scheduledAt",
        label: "Interview (IST)",
        hideBelow: "md",
        render: (row) => formatIst(row.scheduledAt),
      },
      {
        key: "score",
        label: "Score",
        render: (row) => (
          <span className="font-semibold text-[#1B3A1E]">{row.score}</span>
        ),
      },
      {
        key: "feedbackSubmittedAt",
        label: "Feedback submitted (IST)",
        hideBelow: "lg",
        render: (row) => formatIst(row.feedbackSubmittedAt),
      },
    ];
  }

  return [
    {
      key: "name",
      label: "Candidate",
      render: (row) => <Person candidate={row} />,
    },
    {
      key: "phone",
      label: "Phone",
      hideBelow: "md",
      render: (row) =>
        row.phone ? (
          <span className="whitespace-nowrap text-gray-600">{row.phone}</span>
        ) : (
          NONE
        ),
    },
    {
      key: "college",
      label: "College",
      hideBelow: "sm",
      render: (row) => <CollegeCell college={row.college} />,
    },
    {
      key: "resumeUrl",
      label: "Resume",
      hideBelow: "lg",
      render: (row) =>
        isHttpUrl(row.resumeUrl) ? (
          <a
            className="inline-flex items-center gap-1 text-[#1B3A1E] hover:underline"
            href={row.resumeUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open
            <ExternalLink aria-hidden="true" size={14} />
          </a>
        ) : (
          NONE
        ),
    },
    {
      key: "createdAt",
      label: "Added",
      render: (row) => formatDate(row.createdAt),
    },
  ];
}

function useDrives() {
  const [state, setState] = useState({ items: [], loading: true, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { items } = await drivesService.list({ limit: 100 });

      setState({ items, loading: false, error: null });
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return state;
}

const STATUS_COLORS = {
  SCHEDULED: "#2E7D32",
  COMPLETED: "#1B3A1E",
  CANCELLED: "#D32F2F",
};

export default function Reports() {
  const toast = useToast();
  const { hasPermission } = usePermissions();
  const canExport = hasPermission("reports.export");

  const [exporting, setExporting] = useState(false);
  // Synchronous guard: state alone cannot stop clicks that arrive before the
  // next render from starting extra exports.
  const exportingRef = useRef(false);

  const colleges = useColleges();
  const drives = useDrives();

  // The list hook owns the filter state; the summary and the export read it.
  // An invalid date range is never sent to the API: the fetcher answers with
  // an empty page and the table area shows the validation message instead.
  const list = useResourceList(
    (params) =>
      validateDateRange(params)
        ? Promise.resolve({
            items: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
          })
        : getReports({
            ...toReportParams(params),
            page: params.page,
            limit: params.limit,
          }),
    { initialFilters: EMPTY_FILTERS },
  );

  const filters = list.filters;
  const setFilters = list.setFilters;

  const reportType = getReportType(filters.type);
  const dateError = validateDateRange(filters);
  const valid = !dateError;

  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) => key !== "type" && value !== "" && value !== undefined,
  );

  const summary = useReportSummary({ filters, enabled: valid });

  function setFilter(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value };

      // The API lets a drive override the college, so keep one of them.
      if (key === "driveId" && value) {
        next.collegeId = "";
      }

      return next;
    });
  }

  function setType(type) {
    setFilters((current) => ({ ...current, type, status: "" }));
  }

  function resetFilters() {
    setFilters((current) => ({ ...EMPTY_FILTERS, type: current.type }));
  }

  async function handleExport() {
    if (exportingRef.current) {
      return;
    }

    exportingRef.current = true;
    setExporting(true);

    try {
      const name = await exportReport(toReportParams(filters));

      toast.success(`Downloaded ${name}`);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  const total = list.pagination.total;
  const exportDisabled =
    exporting || !valid || Boolean(list.error) || list.loading || total === 0;

  const exportButton = canExport ? (
    <Button
      aria-describedby="export-note"
      disabled={exportDisabled}
      loading={exporting}
      onClick={handleExport}
    >
      {!exporting && <Download aria-hidden="true" size={18} />}
      {exporting ? "Exporting…" : "Export CSV"}
    </Button>
  ) : undefined;

  const summaryData = summary.data;
  const scores = summaryData ? summarizeScores(summaryData.results.items) : null;
  const interviewTotal = summaryData
    ? INTERVIEW_STATUSES.reduce(
        (sum, status) => sum + summaryData.interviews[status],
        0,
      )
    : null;
  const showSummaryLoading = summary.loading && !summaryData;

  return (
    <div>
      <PageHeader
        actions={exportButton}
        description="Recruitment figures and downloadable reports."
        title="Reports"
      />

      {/* ---------------------------------------------------------- summary */}
      <section aria-label="Summary" className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Summary
          <span className="ml-2 text-xs font-normal text-gray-500">
            for the selected college, drive and dates
          </span>
        </h2>

        {valid && summary.error && (
          <ErrorPanel error={summary.error} onRetry={summary.reload} />
        )}

        {valid && !summary.error && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                footnote="Active candidates"
                icon={UserRound}
                label="Candidates"
                loading={showSummaryLoading}
                value={summaryData ? summaryData.candidates : null}
              />
              <StatCard
                footnote="All statuses"
                icon={Video}
                label="Interviews"
                loading={showSummaryLoading}
                value={interviewTotal}
              />
              <StatCard
                footnote="Completed, with feedback"
                icon={Star}
                label="Results"
                loading={showSummaryLoading}
                value={summaryData ? summaryData.results.total : null}
              />
              <StatCard
                footnote={
                  summaryData?.results.partial
                    ? `Average of the first ${summaryData.results.items.length} results`
                    : "Average score (0–100)"
                }
                icon={Star}
                label="Average score"
                loading={showSummaryLoading}
                value={
                  scores && scores.average !== null
                    ? scores.average.toFixed(1)
                    : null
                }
              />
            </div>

            {summaryData && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <BarChart
                  items={INTERVIEW_STATUSES.map((status) => ({
                    label: status.charAt(0) + status.slice(1).toLowerCase(),
                    value: summaryData.interviews[status],
                    color: STATUS_COLORS[status],
                  }))}
                  title="Interviews by status"
                />

                <BarChart
                  emptyText="No scored results for the selected filters."
                  items={scores.bins}
                  note={
                    summaryData.results.partial
                      ? `Based on the first ${summaryData.results.items.length} of ${summaryData.results.total} results.`
                      : undefined
                  }
                  title="Score distribution"
                />
              </div>
            )}
          </>
        )}
      </section>

      {/* ----------------------------------------------------------- report */}
      <section aria-label="Report">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Report</h2>

        <div
          aria-label="Report type"
          className="mb-4 flex flex-wrap gap-2"
          role="tablist"
        >
          {REPORT_TYPES.map((type) => (
            <button
              aria-selected={filters.type === type.value}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#1B3A1E]/40 ${
                filters.type === type.value
                  ? "border-[#1B3A1E] bg-[#1B3A1E] text-white"
                  : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
              }`}
              key={type.value}
              onClick={() => setType(type.value)}
              role="tab"
              type="button"
            >
              {type.label}
            </button>
          ))}
        </div>

        <p className="mb-4 text-sm text-gray-500">{reportType.description}</p>

        <FilterBar
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
        >
          <Select
            disabled={
              colleges.loading ||
              Boolean(colleges.error) ||
              Boolean(filters.driveId)
            }
            hint={
              colleges.error
                ? "Unavailable for your account."
                : filters.driveId
                  ? "Set by the selected drive."
                  : undefined
            }
            id="report-college-filter"
            label="College"
            onChange={(event) => setFilter("collegeId", event.target.value)}
            value={filters.collegeId}
          >
            <option value="">All colleges</option>
            {colleges.items.map((college) => (
              <option key={college.id} value={college.id}>
                {college.name} ({college.city})
              </option>
            ))}
          </Select>

          <Select
            disabled={drives.loading || Boolean(drives.error)}
            hint={
              drives.error
                ? "Unavailable for your account."
                : "Filters by the drive's college."
            }
            id="report-drive-filter"
            label="Drive"
            onChange={(event) => setFilter("driveId", event.target.value)}
            value={filters.driveId}
          >
            <option value="">All drives</option>
            {drives.items.map((drive) => (
              <option key={drive.id} value={drive.id}>
                {drive.title}
              </option>
            ))}
          </Select>

          {reportType.supportsStatus && (
            <Select
              id="report-status-filter"
              label="Status"
              onChange={(event) => setFilter("status", event.target.value)}
              value={filters.status}
            >
              <option value="">All statuses</option>
              {INTERVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          )}

          <Input
            error={dateError || undefined}
            hint={dateError ? undefined : `Applies to: ${reportType.dateField}`}
            id="report-from-date"
            label="From"
            onChange={(event) => setFilter("fromDate", event.target.value)}
            type="date"
            value={filters.fromDate}
          />

          <Input
            id="report-to-date"
            label="To"
            onChange={(event) => setFilter("toDate", event.target.value)}
            type="date"
            value={filters.toDate}
          />
        </FilterBar>

        {dateError ? (
          <div
            className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600"
            role="alert"
          >
            Fix the date range to see this report.
          </div>
        ) : (
          <>
            <DataTable
              caption={`${reportType.label} report`}
              columns={getColumns(filters.type)}
              emptyAction={
                hasActiveFilters ? (
                  <Button onClick={resetFilters} variant="secondary">
                    Reset filters
                  </Button>
                ) : undefined
              }
              emptyDescription={
                hasActiveFilters
                  ? "Try a different date range or clear the filters."
                  : "There is nothing to report yet."
              }
              emptyTitle={
                hasActiveFilters
                  ? "No rows match your filters"
                  : `No ${reportType.label.toLowerCase()} to report`
              }
              error={list.error}
              loading={list.loading}
              onRetry={list.reload}
              rows={list.items}
            />

            {!list.error && total > 0 && (
              <div className="mt-4">
                <Pagination
                  disabled={list.loading}
                  limit={list.limit}
                  onLimitChange={list.setLimit}
                  onPageChange={list.setPage}
                  page={list.page}
                  total={total}
                  totalPages={list.pagination.totalPages}
                />
              </div>
            )}

            {canExport && !list.error && total > 0 && (
              <p className="mt-3 text-xs text-gray-500" id="export-note">
                {total > EXPORT_ROW_LIMIT
                  ? `The CSV export contains the first ${EXPORT_ROW_LIMIT} of ${total} matching rows (a server limit). Narrow the filters to export the rest.`
                  : `The CSV export contains all ${total} matching ${total === 1 ? "row" : "rows"}.`}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
