import { useEffect, useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";

import { resultsApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useListQuery } from "../../hooks/useListQuery.js";
import { attemptStatusLabel, formatScore, topicLabel } from "../../utils/assessment.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import { formatDateTime, saveBlob } from "../../utils/format.js";

const fetchResults = (params, signal) => resultsApi.list(params, signal);
const INITIAL = { driveId: "", collegeId: "", level: "", status: "", search: "" };

const rowClass = (row) => (row.highlight === "GREEN" ? "row--green" : row.highlight === "YELLOW" ? "row--yellow" : undefined);

function Detail({ applicationId, onClose }) {
  const [state, setState] = useState({ phase: "loading", data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    resultsApi
      .get(applicationId, controller.signal)
      .then((data) => setState({ phase: "ready", data, error: null }))
      .catch((error) => !isAbortError(error) && setState({ phase: "error", data: null, error }));

    return () => controller.abort();
  }, [applicationId]);

  const d = state.data;

  return (
    <SidePanel open title="Result" subtitle={d?.name} onClose={onClose} footer={<button type="button" className="btn btn--outline" onClick={onClose}>Close</button>}>
      {state.phase === "loading" ? <LoadingState label="Loading result…" /> : null}
      {state.phase === "error" ? <ErrorState title="Couldn't load this result" message={getErrorMessage(state.error)} /> : null}
      {d ? (
        <div className="stack">
          <dl className="detail">
            <div><dt>Application</dt><dd>{d.applicationNo}</dd></div>
            <div><dt>College</dt><dd>{d.college.name ?? "—"}</dd></div>
            <div><dt>Drive</dt><dd>{d.drive.title}</dd></div>
            <div><dt>Level</dt><dd>{d.level}</dd></div>
            <div><dt>Assessment</dt><dd>{attemptStatusLabel(d.attemptStatus)}</dd></div>
            <div><dt>Score</dt><dd>{d.score === null ? "—" : `${formatScore(d.score)} / ${d.maxScore} (${formatScore(d.percentage)}%)`}</dd></div>
            <div><dt>Rank</dt><dd>{d.rank ?? "Not ranked"}</dd></div>
            <div><dt>Submitted</dt><dd>{d.submittedAt ? formatDateTime(d.submittedAt) : "—"}</dd></div>
          </dl>

          {d.sections.length > 0 ? (
            <table className="table">
              <caption className="sr-only">Score by topic</caption>
              <thead>
                <tr>
                  <th scope="col">Topic</th>
                  <th scope="col" className="is-right">Score</th>
                  <th scope="col" className="is-right">Answered</th>
                  <th scope="col" className="is-right">Correct</th>
                </tr>
              </thead>
              <tbody>
                {d.sections.map((s) => (
                  <tr key={s.key}>
                    <td data-label="Topic">{topicLabel(s.key)}</td>
                    <td data-label="Score" className="is-right">{formatScore(s.score)} / {formatScore(s.max)}</td>
                    <td data-label="Answered" className="is-right">{s.answered}</td>
                    <td data-label="Correct" className="is-right">{s.correct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {d.integrityEvents ? (
            <section className="detail__section">
              <h3>Focus and full-screen events</h3>
              {d.flaggedForReview ? <p className="notice notice--warn"><span>Flagged for review. Events are evidence for the team, not proof of misconduct.</span></p> : null}
              {d.integrityEvents.length === 0 ? (
                <p className="panel__note">None recorded.</p>
              ) : (
                <ul className="checklist">
                  {d.integrityEvents.map((e, i) => (
                    <li key={`${e.at}-${i}`}>{e.type.replaceAll("_", " ").toLowerCase()} — {formatDateTime(e.at)}</li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </SidePanel>
  );
}

export default function ResultsPage() {
  const toast = useToast();
  const list = useListQuery(fetchResults, INITIAL, { limit: 25 });
  const [options, setOptions] = useState({ drives: [], colleges: [] });
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);

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

  const filtered = Object.values(list.filters).some((v) => v !== "");
  const summary = list.summary;

  const columns = useMemo(
    () => [
      { key: "rank", header: "Rank", render: (r) => <span className="rank">{r.rank ?? "—"}</span> },
      { key: "student", header: "Student", render: (r) => (<><strong>{r.name}</strong><span className="sub">{r.applicationNo}</span></>) },
      { key: "college", header: "College", render: (r) => (<><span>{r.college.name ?? "—"}</span><span className="sub">{r.drive.title}</span></>) },
      { key: "level", header: "Level", render: (r) => r.level },
      {
        key: "status",
        header: "Assessment",
        render: (r) => (
          <>
            <StatusBadge tone={r.attemptStatus === "NOT_STARTED" ? "neutral" : r.attemptStatus === "IN_PROGRESS" ? "info" : "success"}>{attemptStatusLabel(r.attemptStatus)}</StatusBadge>
            {r.flaggedForReview ? <StatusBadge tone="warn">Review</StatusBadge> : null}
          </>
        ),
      },
      { key: "score", header: "Score", render: (r) => (r.score === null ? "—" : <><strong>{formatScore(r.score)}</strong><span className="sub">of {r.maxScore} · {formatScore(r.percentage)}%</span></>) },
      {
        key: "actions",
        header: "Actions",
        align: "right",
        render: (r) => (
          <ActionIcon icon={Eye} label={`View results for ${r.name}`} onClick={() => setSelected(r.applicationId)} />
        ),
      },
    ],
    [],
  );

  async function exportCsv() {
    setExporting(true);

    try {
      const params = Object.fromEntries(Object.entries(list.filters).filter(([, v]) => v !== ""));
      const { blob, filename } = await resultsApi.exportCsv(params);

      saveBlob(blob, filename ?? "results.csv");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Results & ranking"
        description="Ranked by score. Students with the same score share a rank (1, 2, 2, 4). The Top 10 are green, other ranked students yellow."
        actions={
          <button type="button" className="btn btn--outline" onClick={exportCsv} disabled={exporting}>
            <Download size={15} aria-hidden="true" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        }
      />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name or application no…" />
          <SelectFilter label="Drive" value={list.filters.driveId} onChange={(v) => list.setFilter("driveId", v)} options={options.drives} />
          {options.colleges.length > 1 ? (
            <SelectFilter label="College" value={list.filters.collegeId} onChange={(v) => list.setFilter("collegeId", v)} options={options.colleges} />
          ) : null}
          <SelectFilter label="Level" value={list.filters.level} onChange={(v) => list.setFilter("level", v)} options={[{ value: "UG", label: "UG" }, { value: "PG", label: "PG" }]} />
          <SelectFilter
            label="Assessment"
            value={list.filters.status}
            onChange={(v) => list.setFilter("status", v)}
            options={[
              { value: "SUBMITTED", label: "Submitted" },
              { value: "AUTO_SUBMITTED", label: "Auto-submitted" },
              { value: "IN_PROGRESS", label: "In progress" },
              { value: "NOT_STARTED", label: "Not started" },
            ]}
          />
        </FilterBar>

        <div className="legend" aria-label="Colour key">
          <span className="legend__item"><span className="legend__swatch legend__swatch--green" aria-hidden="true" />Top {summary?.topN ?? 10} (rank {summary?.topN ?? 10} or better, ties included)</span>
          <span className="legend__item"><span className="legend__swatch legend__swatch--yellow" aria-hidden="true" />Other ranked students</span>
          <span className="legend__item">No colour: assessment not finished, so not ranked</span>
          {summary ? <span className="legend__item"><strong>{summary.ranked}</strong> ranked</span> : null}
        </div>

        {list.phase === "error" && list.error?.status === 403 ? (
          <div className="tablewrap tablewrap--empty">
            <p className="state__title">No results are available to you yet</p>
            <p className="state__text">Your account has not been given any college. Ask the Super Admin to assign your college.</p>
          </div>
        ) : null}

        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.applicationId}
          rowClassName={rowClass}
          phase={list.phase === "error" && list.error?.status === 403 ? "ready" : list.phase}
          error={list.error}
          onRetry={list.reload}
          caption="Results and ranking"
          emptyTitle={filtered ? "No results match these filters" : "No results yet"}
          emptyText={filtered ? "Try different filters or clear them." : "Results appear here once students submit their assessments."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {selected ? <Detail applicationId={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}
