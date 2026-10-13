import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  BriefcaseBusiness,
  GraduationCap,
  RefreshCw,
  UsersRound,
} from "lucide-react";

import { dashboardStatsRequest } from "../api/dashboard.api.js";
import ErrorState from "../components/feedback/ErrorState.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import { usePermissions } from "../hooks/usePermissions.js";
import { getErrorMessage, isAbortError } from "../utils/errors.js";
import RankingPanel from "./dashboard/RankingPanel.jsx";

const METRICS = [
  { key: "totalUsers", label: "Active users", icon: UsersRound, tone: "green" },
  { key: "totalColleges", label: "Active colleges", icon: Building2, tone: "blue" },
  { key: "totalDrives", label: "Active drives", icon: BriefcaseBusiness, tone: "amber" },
  { key: "totalCandidates", label: "Active candidates", icon: GraduationCap, tone: "red" },
];

const numberFormat = new Intl.NumberFormat();

function isValidStats(data) {
  return METRICS.every(({ key }) => Number.isFinite(data?.[key]));
}

export default function Dashboard() {
  const { hasPermission } = usePermissions();
  const [state, setState] = useState({ phase: "loading", stats: null, error: null, loadedAt: null });
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (signal) => {
    setState((current) => ({ ...current, phase: "loading", error: null }));

    try {
      const response = await dashboardStatsRequest(signal);

      if (!isValidStats(response?.data)) {
        throw new Error("The server returned unexpected dashboard data.");
      }

      setState({ phase: "ready", stats: response.data, error: null, loadedAt: new Date() });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setState((current) => ({ ...current, phase: "error", error }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal);

    return () => controller.abort();
  }, [load, reloadKey]);

  const { phase, stats, error, loadedAt } = state;

  return (
    <div className="dashboard">
      <div className="page__head">
        <div>
          <p className="page__eyebrow">Workspace overview</p>
          <h1 className="page__title">Dashboard</h1>
          <p className="page__sub">A real-time snapshot of your recruitment activity.</p>
        </div>

        <button
          type="button"
          className="btn btn--outline dashboard__refresh"
          onClick={() => setReloadKey((value) => value + 1)}
          disabled={phase === "loading"}
        >
          <RefreshCw size={16} aria-hidden="true" className={phase === "loading" ? "is-spinning" : undefined} />
          <span>{phase === "loading" ? "Refreshing" : "Refresh data"}</span>
        </button>
      </div>

      {phase === "loading" && !stats ? <LoadingState label="Loading dashboard…" /> : null}

      {phase === "error" ? (
        <ErrorState
          title="Couldn't load the dashboard"
          message={getErrorMessage(error)}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : null}

      {stats && phase !== "error" ? (
        <section className="metrics" aria-label="Platform totals" aria-busy={phase === "loading"}>
          {METRICS.map(({ key, label, icon: Icon, tone }) => (
            <article className="metric-card" key={key}>
              <div className={`metric-card__icon metric-card__icon--${tone}`}>
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="metric-card__body">
                <p className="metric-card__label">{label}</p>
                <p className="metric-card__value">{numberFormat.format(stats[key])}</p>
              </div>
            </article>
          ))}
          {loadedAt ? (
            <p className="metrics__updated">
              <span className="metrics__live-dot" aria-hidden="true" />
              Last updated {loadedAt.toLocaleTimeString()}
            </p>
          ) : null}
        </section>
      ) : null}

      {hasPermission("results.view") ? <RankingPanel /> : null}
    </div>
  );
}
