import { useCallback, useEffect, useRef, useState } from "react";

import { getReports } from "../../services/reports.service.js";
import { INTERVIEW_STATUSES } from "./reportConfig.js";

const RESULT_SAMPLE = 100;

// Summary figures for the selected college / drive / date range.
//
// The API has no aggregate endpoint, so every number comes from a report
// list's own `pagination.total`:
//   candidates     GET /reports?type=CANDIDATES            (total)
//   interviews     GET /reports?type=INTERVIEWS&status=X   (total per status)
//   results        GET /reports?type=RESULTS&limit=100     (total + first 100
//                  rows, used for the average and the score distribution)
// Totals are exact. Score figures are exact only when results.total <= 100;
// otherwise they describe the first 100 results and `partial` is true.
export function useReportSummary({ filters, enabled }) {
  const [state, setState] = useState({
    data: null,
    loading: enabled,
    error: null,
  });
  const requestRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);

  const base = {
    collegeId: filters.driveId ? "" : filters.collegeId,
    driveId: filters.driveId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };
  const baseKey = JSON.stringify(base);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const requestId = ++requestRef.current;

    setState((current) => ({ ...current, loading: true, error: null }));

    Promise.all([
      getReports({ ...base, type: "CANDIDATES", limit: 1 }),
      ...INTERVIEW_STATUSES.map((status) =>
        getReports({ ...base, type: "INTERVIEWS", status, limit: 1 }),
      ),
      getReports({ ...base, type: "RESULTS", limit: RESULT_SAMPLE }),
    ])
      .then(([candidates, scheduled, completed, cancelled, results]) => {
        if (requestId !== requestRef.current) {
          return;
        }

        setState({
          loading: false,
          error: null,
          data: {
            candidates: candidates.pagination.total,
            interviews: {
              SCHEDULED: scheduled.pagination.total,
              COMPLETED: completed.pagination.total,
              CANCELLED: cancelled.pagination.total,
            },
            results: {
              total: results.pagination.total,
              items: results.items,
              partial: results.pagination.total > results.items.length,
            },
          },
        });
      })
      .catch((error) => {
        if (requestId === requestRef.current) {
          setState({ data: null, loading: false, error });
        }
      });

    return () => {
      requestRef.current += 1;
    };
    // baseKey captures the filters; reloadToken re-runs on Retry.
  }, [baseKey, enabled, reloadToken]);

  const reload = useCallback(
    () => setReloadToken((current) => current + 1),
    [],
  );

  return { ...state, reload };
}
