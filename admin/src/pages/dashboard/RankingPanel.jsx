import { useEffect, useState } from "react";
import { AlertCircle, Award, RefreshCw } from "lucide-react";

import { resultsApi } from "../../api/modules.api.js";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { attemptStatusLabel, formatScore } from "../../utils/assessment.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";

const rowClass = (r) => (r.highlight === "GREEN" ? "row--green" : r.highlight === "YELLOW" ? "row--yellow" : undefined);

export default function RankingPanel() {
  const [drives, setDrives] = useState([]);
  const [driveId, setDriveId] = useState("");
  const [level, setLevel] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState({ phase: "loading", rows: [], total: 0, topN: 10, error: null });

  useEffect(() => {
    const controller = new AbortController();

    resultsApi
      .list({ limit: 500 }, controller.signal)
      .then(({ items }) => {
        const unique = [...new Map(items.map((result) => [result.drive.id, result.drive.title]))]
          .map(([id, title]) => ({ id, title }));

        setDrives(unique);
        setDriveId((current) => unique.some((drive) => drive.id === current) ? current : unique[0]?.id ?? "");

        if (unique.length === 0) {
          setState({ phase: "ready", rows: [], total: 0, topN: 10, error: null });
        }
      })
      .catch((error) => !isAbortError(error) && setState((s) => ({ ...s, phase: "error", error })));

    return () => controller.abort();
  }, [retryKey]);

  useEffect(() => {
    if (!driveId) return undefined;

    const controller = new AbortController();

    setState((s) => ({ ...s, phase: "loading", error: null }));
    resultsApi
      .ranking({ driveId, level, limit: 100 }, controller.signal)
      .then((r) => setState({ phase: "ready", rows: r.data, total: r.totalRanked, topN: r.topN, error: null }))
      .catch((error) => !isAbortError(error) && setState((s) => ({ ...s, phase: "error", error })));

    return () => controller.abort();
  }, [driveId, level, retryKey]);

  return (
    <section className="ranking panel" aria-label="Student ranking">
      <div className="ranking__head">
        <div className="ranking__title">
          <span className="ranking__icon"><Award size={19} aria-hidden="true" /></span>
          <div>
            <h2>Student ranking</h2>
            <p>Assessment performance by drive</p>
          </div>
        </div>
        <div className="ranking__filters">
          <label className="filter">
            <span className="filter__label">Drive</span>
            <select value={driveId} onChange={(e) => setDriveId(e.target.value)} disabled={drives.length === 0}>
              {drives.length === 0 ? <option value="">No active drives</option> : null}
              {drives.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>
          <label className="filter">
            <span className="filter__label">Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">UG and PG</option>
              <option value="UG">UG</option>
              <option value="PG">PG</option>
            </select>
          </label>
        </div>
      </div>

      <div className="ranking__legend">
        <span className="legend__item"><span className="legend__swatch legend__swatch--green" aria-hidden="true" />Top {state.topN} performers</span>
        <span className="legend__item"><span className="legend__swatch legend__swatch--yellow" aria-hidden="true" />Other ranked students</span>
      </div>

      {state.phase === "error" ? (
        <div className="ranking__error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Ranking data is unavailable</strong>
            <p>{getErrorMessage(state.error)}</p>
          </div>
          <button type="button" className="btn btn--outline btn--sm" onClick={() => setRetryKey((value) => value + 1)}>
            <RefreshCw size={14} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {state.phase !== "error" && state.rows.length === 0 ? (
        <div className="tablewrap tablewrap--empty">
          <span className="ranking__empty-icon"><Award size={24} aria-hidden="true" /></span>
          <p className="state__title">{state.phase === "loading" ? "Loading ranking…" : "No ranked students yet"}</p>
          {state.phase === "ready" ? <p className="state__text">Students will appear here after submitting their assessments.</p> : null}
        </div>
      ) : null}

      {state.rows.length > 0 ? (
        <div className="tablewrap" aria-busy={state.phase === "loading"}>
          <table className="table">
            <caption className="sr-only">Ranked students</caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Student</th>
                <th scope="col">College</th>
                <th scope="col">Level</th>
                <th scope="col">Score</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.applicationId} className={rowClass(r)}>
                  <td data-label="Rank"><span className="rank">{r.rank}</span></td>
                  <td data-label="Student"><strong>{r.name}</strong><span className="sub">{r.applicationNo}</span></td>
                  <td data-label="College">{r.college.name ?? "—"}</td>
                  <td data-label="Level">{r.level}</td>
                  <td data-label="Score">{formatScore(r.score)} <span className="sub">of {r.maxScore}</span></td>
                  <td data-label="Status">
                    <StatusBadge tone="success">{attemptStatusLabel(r.attemptStatus)}</StatusBadge>
                    {r.flaggedForReview ? <StatusBadge tone="warn">Review</StatusBadge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
