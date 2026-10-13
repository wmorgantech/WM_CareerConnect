import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";

import { drivesApi, reportsApi } from "../../api/modules.api.js";
import DataTable from "../../components/ui/DataTable.jsx";
import { DateFilter, FilterBar, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useColleges } from "../../hooks/useColleges.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import { usePermissions } from "../../hooks/usePermissions.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate, formatDateTime, saveBlob } from "../../utils/format.js";
import { INTERVIEW_STATUS_LABEL, INTERVIEW_STATUS_OPTIONS, INTERVIEW_STATUS_TONE } from "../interviews/interviewMeta.js";

const TYPES = [
  { value: "CANDIDATES", label: "Candidates", file: "candidates-report.csv", dateNote: "The date range applies to when the candidate was added." },
  { value: "INTERVIEWS", label: "Interviews", file: "interviews-report.csv", dateNote: "The date range applies to the interview date." },
  { value: "RESULTS", label: "Results", file: "results-report.csv", dateNote: "The date range applies to when feedback was submitted." },
];

const person = (r) => (
  <>
    <strong>{r.name}</strong>
    <span className="sub">{r.email}</span>
  </>
);

const COLUMNS = {
  CANDIDATES: [
    { key: "name", header: "Candidate", render: person },
    { key: "phone", header: "Phone", render: (r) => r.phone || "—" },
    { key: "college", header: "College", render: (r) => (r.college ? r.college.name : "—") },
    { key: "added", header: "Added (IST)", render: (r) => formatDate(r.createdAt) },
  ],
  INTERVIEWS: [
    { key: "candidate", header: "Candidate", render: (r) => person(r.candidate) },
    { key: "college", header: "College", render: (r) => (r.candidate.college ? r.candidate.college.name : "—") },
    { key: "when", header: "When (IST)", render: (r) => formatDateTime(r.scheduledAt) },
    { key: "status", header: "Status", render: (r) => <StatusBadge tone={INTERVIEW_STATUS_TONE[r.status]}>{INTERVIEW_STATUS_LABEL[r.status]}</StatusBadge> },
    { key: "score", header: "Score", render: (r) => (r.score != null ? `${r.score}/100` : "—") },
  ],
  RESULTS: [
    { key: "candidate", header: "Candidate", render: (r) => person(r.candidate) },
    { key: "college", header: "College", render: (r) => (r.candidate.college ? r.candidate.college.name : "—") },
    { key: "score", header: "Score", render: (r) => (r.score != null ? `${r.score}/100` : "—") },
    { key: "submitted", header: "Submitted (IST)", render: (r) => formatDateTime(r.feedbackSubmittedAt) },
  ],
};

const FETCHERS = Object.fromEntries(
  TYPES.map((t) => [t.value, (params, signal) => reportsApi.list({ ...params, type: t.value }, signal)]),
);

const INITIAL = { driveId: "", collegeId: "", status: "", fromDate: "", toDate: "" };

function useDrives(enabled) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const controller = new AbortController();

    drivesApi
      .list({ limit: 100 }, controller.signal)
      .then((result) => setItems(result.items))
      .catch(() => {

      });

    return () => controller.abort();
  }, [enabled]);

  return items;
}

function ReportPanel({ type }) {
  const toast = useToast();
  const { hasPermission } = usePermissions();
  const canExport = hasPermission("reports.export");
  const canPickDrive = hasPermission("drives.manage");
  const list = useListQuery(FETCHERS[type], INITIAL);
  const colleges = useColleges();
  const drives = useDrives(canPickDrive);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);

  const meta = TYPES.find((t) => t.value === type);
  const filtered = Object.values(list.filters).some((value) => value !== "");
  const rangeInvalid = Boolean(list.filters.fromDate && list.filters.toDate && list.filters.fromDate > list.filters.toDate);

  async function exportCsv() {
    if (exportingRef.current) {
      return;
    }

    exportingRef.current = true;
    setExporting(true);

    try {
      const { blob, filename } = await reportsApi.exportCsv({ ...list.filters, type });

      saveBlob(blob, filename || meta.file);
      toast.success("Report downloaded");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }

  return (
    <section className="panel">
      <FilterBar onReset={list.resetFilters} canReset={filtered}>
        {canPickDrive ? (
          <SelectFilter label="Drive" value={list.filters.driveId} onChange={(v) => list.setFilter("driveId", v)} options={drives.map((d) => ({ value: d.id, label: d.title }))} />
        ) : null}
        <SelectFilter label="College" value={list.filters.collegeId} onChange={(v) => list.setFilter("collegeId", v)} options={colleges.items.map((c) => ({ value: c.id, label: c.name }))} />
        {type === "INTERVIEWS" ? (
          <SelectFilter label="Status" value={list.filters.status} onChange={(v) => list.setFilter("status", v)} options={INTERVIEW_STATUS_OPTIONS} />
        ) : null}
        <DateFilter label="From" value={list.filters.fromDate} onChange={(v) => list.setFilter("fromDate", v)} />
        <DateFilter label="To" value={list.filters.toDate} onChange={(v) => list.setFilter("toDate", v)} />
        {canExport ? (
          <button type="button" className="btn btn--primary filters__export" onClick={exportCsv} disabled={exporting || rangeInvalid}>
            <Download size={16} aria-hidden="true" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        ) : null}
      </FilterBar>

      <p className="panel__note">
        {meta.dateNote} Choosing a drive limits the report to that drive's college. CSV export includes at most the first 100 matching rows.
      </p>

      {rangeInvalid ? (
        <p className="notice notice--error" role="alert">
          The “From” date can't be after the “To” date.
        </p>
      ) : null}

      <DataTable
        columns={COLUMNS[type]}
        rows={rangeInvalid ? [] : list.items}
        phase={rangeInvalid ? "ready" : list.phase}
        error={list.error}
        onRetry={list.reload}
        caption={`${meta.label} report`}
        emptyTitle="No data for this report"
        emptyText={filtered ? "Try different filters or clear them." : "Nothing has been recorded yet."}
      />

      <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
    </section>
  );
}

export default function ReportsPage() {
  const [type, setType] = useState("CANDIDATES");

  return (
    <div>
      <PageHeader title="Reports" description="Recruitment data from the live system." />

      <div className="tabs" role="tablist" aria-label="Report type">
        {TYPES.map((t) => (
          <button key={t.value} type="button" role="tab" aria-selected={type === t.value} className={type === t.value ? "tab tab--active" : "tab"} onClick={() => setType(t.value)}>
            {t.label}
          </button>
        ))}
      </div>

      <ReportPanel key={type} type={type} />
    </div>
  );
}
