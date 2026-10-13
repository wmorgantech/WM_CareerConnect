import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, CalendarClock, ClipboardCheck, UserCheck, Users } from "lucide-react";

import { placementApi, resultsApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useListQuery } from "../../hooks/useListQuery.js";
import { attemptStatusLabel, formatScore } from "../../utils/assessment.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import { formatDateTime } from "../../utils/format.js";

const numberFormat = new Intl.NumberFormat("en-IN");

const TABS = [
  { id: "assessment", label: "Assessment results" },
  { id: "interviews", label: "Interview shortlist" },
  { id: "final", label: "Final results" },
];

const DECISIONS = {
  assessment: [
    { value: "QUALIFIED", label: "Qualified" },
    { value: "NOT_QUALIFIED", label: "Not qualified" },
    { value: "PENDING", label: "Pending" },
  ],
  final: [
    { value: "SELECTED", label: "Selected" },
    { value: "NOT_SELECTED", label: "Not selected" },
    { value: "PENDING", label: "Pending" },
  ],
};

const DECISION_BADGE = {
  QUALIFIED: { tone: "success", label: "Qualified" },
  NOT_QUALIFIED: { tone: "danger", label: "Not qualified" },
  SELECTED: { tone: "success", label: "Selected" },
  NOT_SELECTED: { tone: "danger", label: "Not selected" },
  PENDING: { tone: "neutral", label: "Pending" },
};

const APPLICATION_STATUS = {
  SHORTLISTED: "Shortlisted",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_COMPLETED: "Interview completed",
  ON_HOLD: "On hold",
  SELECTED: "Selected",
  REJECTED: "Rejected",
};

const INTERVIEW_STATUS = { SCHEDULED: "Scheduled", COMPLETED: "Completed" };

function Decision({ value }) {
  const badge = DECISION_BADGE[value] ?? DECISION_BADGE.PENDING;

  return <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>;
}

const studentColumn = { key: "student", header: "Student", render: (r) => (<><strong>{r.name}</strong><span className="sub">{r.applicationNo}</span></>) };
const driveColumn = { key: "drive", header: "College", render: (r) => (<><span>{r.college.name ?? "—"}</span><span className="sub">{r.drive.title} · {r.level}</span></>) };

const COLUMNS = {
  assessment: [
    studentColumn,
    driveColumn,
    {
      key: "status",
      header: "Assessment",
      render: (r) => <StatusBadge tone={r.attemptStatus === "NOT_STARTED" ? "neutral" : r.attemptStatus === "IN_PROGRESS" ? "info" : "success"}>{attemptStatusLabel(r.attemptStatus)}</StatusBadge>,
    },
    { key: "score", header: "Marks", render: (r) => (r.score === null ? "—" : <><strong>{formatScore(r.score)}</strong><span className="sub">of {r.maxScore} · {formatScore(r.percentage)}%</span></>) },
    { key: "decision", header: "Result", render: (r) => <Decision value={r.decision} /> },
  ],
  interviews: [
    studentColumn,
    driveColumn,
    { key: "stage", header: "Stage", render: (r) => APPLICATION_STATUS[r.applicationStatus] ?? r.applicationStatus },
    { key: "round", header: "Current round", render: (r) => r.round ?? "Not recorded" },
    {
      key: "interview",
      header: "Interview",
      render: (r) =>
        r.interviewStatus ? (
          <>
            <StatusBadge tone={r.interviewStatus === "COMPLETED" ? "success" : "info"}>{INTERVIEW_STATUS[r.interviewStatus] ?? r.interviewStatus}</StatusBadge>
            <span className="sub">{formatDateTime(r.scheduledAt)}</span>
          </>
        ) : (
          "Not scheduled yet"
        ),
    },
  ],
  final: [
    studentColumn,
    driveColumn,
    { key: "stage", header: "Stage", render: (r) => APPLICATION_STATUS[r.applicationStatus] ?? r.applicationStatus },
    { key: "decision", header: "Final result", render: (r) => <Decision value={r.decision} /> },
  ],
};

const EMPTY = {
  assessment: { title: "No students yet", text: "Students from your colleges appear here once they register." },
  interviews: { title: "No students shortlisted for interview", text: "Students appear here after they are shortlisted by the recruitment team." },
  final: { title: "No final results yet", text: "Students appear here once they qualify from the assessment." },
};

const CAPTION = { assessment: "Assessment results", interviews: "Interview shortlist", final: "Final results" };

function NoCollege() {
  return (
    <section className="panel">
      <div className="tablewrap tablewrap--empty">
        <p className="state__title">No college is assigned to your account yet</p>
        <p className="state__text">Ask the Super Admin to assign your college. Nothing is shown until then.</p>
      </div>
    </section>
  );
}

function Overview({ scope, onForbidden }) {
  const [state, setState] = useState({ phase: "loading", data: null, error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setState((current) => ({ ...current, phase: "loading", error: null }));

    placementApi
      .overview(scope, controller.signal)
      .then((data) => setState({ phase: "ready", data, error: null }))
      .catch((error) => {
        if (isAbortError(error)) return;

        if (error.status === 403) onForbidden();

        setState({ phase: "error", data: null, error });
      });

    return () => controller.abort();
  }, [scope, reloadKey, onForbidden]);

  if (state.phase === "error") {
    return state.error?.status === 403 ? null : <ErrorState title="Couldn't load the overview" message={getErrorMessage(state.error)} onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const d = state.data;
  const value = (key) => (d ? numberFormat.format(d[key]) : "…");
  const cards = [
    { key: "registered", label: "Registered students", icon: Users, tone: "green", value: value("registered") },
    { key: "attended", label: "Assessment attended", icon: ClipboardCheck, tone: "blue", value: value("assessmentAttended"), sub: d ? `${numberFormat.format(d.assessmentCompleted)} completed` : "" },
    { key: "qualified", label: "Qualified for next round", icon: UserCheck, tone: "green", value: value("qualified"), sub: d ? `${numberFormat.format(d.notQualified)} not qualified · ${numberFormat.format(d.assessmentPending)} pending` : "" },
    { key: "interview", label: "Interview shortlisted", icon: CalendarClock, tone: "amber", value: value("interviewShortlisted") },
    { key: "selected", label: "Final selected", icon: Award, tone: "green", value: value("finalSelected"), sub: d ? `${numberFormat.format(d.finalNotSelected)} not selected · ${numberFormat.format(d.finalPending)} pending` : "" },
  ];

  return (
    <section className="metrics" aria-label="College overview" aria-busy={state.phase === "loading"}>
      {cards.map(({ key, label, icon: Icon, tone, value: shown, sub }) => (
        <article className="metric-card" key={key}>
          <div className={`metric-card__icon metric-card__icon--${tone}`}>
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="metric-card__body">
            <p className="metric-card__label">{label}</p>
            <p className="metric-card__value">{shown}</p>
            {sub ? <p className="metric-card__sub">{sub}</p> : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function PlacementList({ tab, scope, onForbidden }) {
  const fetcher = useCallback((params, signal) => placementApi.list(tab, { ...scope, ...params }, signal), [tab, scope]);
  const initial = useMemo(() => ({ search: "", decision: "" }), []);
  const list = useListQuery(fetcher, initial, { limit: 25 });
  const forbidden = list.phase === "error" && list.error?.status === 403;
  const filtered = Object.values(list.filters).some((v) => v !== "");

  useEffect(() => {
    if (forbidden) onForbidden();
  }, [forbidden, onForbidden]);

  if (forbidden) return null;

  return (
    <section className="panel">
      <FilterBar onReset={list.resetFilters} canReset={filtered}>
        <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name or application no…" />
        {DECISIONS[tab] ? <SelectFilter label="Result" value={list.filters.decision} onChange={(v) => list.setFilter("decision", v)} options={DECISIONS[tab]} /> : null}
      </FilterBar>

      <DataTable
        columns={COLUMNS[tab]}
        rows={list.items}
        rowKey={(r) => r.applicationId}
        phase={list.phase}
        error={list.error}
        onRetry={list.reload}
        caption={CAPTION[tab]}
        emptyTitle={filtered ? "No students match these filters" : EMPTY[tab].title}
        emptyText={filtered ? "Try different filters or clear them." : EMPTY[tab].text}
      />

      <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
    </section>
  );
}

// Read-only placement overview for the HOD and STAFF portals. Every number and row comes from the
// college-scoped /results/placement endpoints; the page never filters by college on its own.
export default function PlacementPage() {
  const [tab, setTab] = useState("assessment");
  const [filters, setFilters] = useState({ driveId: "", collegeId: "", level: "" });
  const [options, setOptions] = useState({ drives: [], colleges: [] });
  const [forbidden, setForbidden] = useState(false);
  const onForbidden = useCallback(() => setForbidden(true), []);
  const scope = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")), [filters]);

  useEffect(() => {
    const controller = new AbortController();

    resultsApi
      .list({ limit: 500 }, controller.signal)
      .then(({ items }) => {
        const drives = new Map(items.map((r) => [r.drive.id, r.drive.title]));
        const colleges = new Map(items.filter((r) => r.college.id).map((r) => [r.college.id, r.college.name]));

        setOptions({
          drives: [...drives].map(([value, label]) => ({ value, label })),
          colleges: [...colleges].map(([value, label]) => ({ value, label })),
        });
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const setFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));

  return (
    <div>
      <PageHeader
        title="College overview"
        description="Registrations, assessment results, interview shortlist and final results for the students of your colleges. This page is read-only."
      />

      {forbidden ? (
        <NoCollege />
      ) : (
        <>
          <section className="panel">
            <FilterBar onReset={() => setFilters({ driveId: "", collegeId: "", level: "" })} canReset={Object.keys(scope).length > 0}>
              <SelectFilter label="Drive" value={filters.driveId} onChange={(v) => setFilter("driveId", v)} options={options.drives} />
              {options.colleges.length > 1 ? <SelectFilter label="College" value={filters.collegeId} onChange={(v) => setFilter("collegeId", v)} options={options.colleges} /> : null}
              <SelectFilter label="Level" value={filters.level} onChange={(v) => setFilter("level", v)} options={[{ value: "UG", label: "UG" }, { value: "PG", label: "PG" }]} />
            </FilterBar>
          </section>

          <Overview scope={scope} onForbidden={onForbidden} />

          <div className="tabs" role="tablist" aria-label="College placement views">
            {TABS.map(({ id, label }) => (
              <button key={id} type="button" role="tab" id={`placement-tab-${id}`} aria-selected={tab === id} aria-controls="placement-panel" className={tab === id ? "tab tab--active" : "tab"} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          <div id="placement-panel" role="tabpanel" aria-labelledby={`placement-tab-${tab}`}>
            <PlacementList key={tab} tab={tab} scope={scope} onForbidden={onForbidden} />
          </div>
        </>
      )}
    </div>
  );
}
