import { useEffect, useId, useState } from "react";

import { Link2 } from "lucide-react";

import { studentsApi } from "../../api/modules.api.js";
import { IconText } from "../../components/ui/Field.jsx";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";

const STATUS_LABEL = {
  REGISTERED: "Registered",
  TEST_IN_PROGRESS: "Test in progress",
  TEST_SUBMITTED: "Test submitted",
  SHORTLISTED: "Shortlisted",
  INTERVIEW_SCHEDULED: "Interview scheduled",
  INTERVIEW_COMPLETED: "Interview completed",
  SELECTED: "Selected",
  ON_HOLD: "On hold",
  REJECTED: "Rejected",
};

export default function ApplicationLinkField({ candidateId, value, onChange }) {
  const id = useId();
  const [state, setState] = useState({ phase: "loading", apps: [], error: null });

  useEffect(() => {
    const controller = new AbortController();

    setState({ phase: "loading", apps: [], error: null });

    Promise.all([studentsApi.list({ candidateId, limit: 50 }, controller.signal), studentsApi.myDrives(controller.signal).catch(() => [])])
      .then(([{ items }, drives]) => {
        const titles = new Map(drives.map((d) => [d.id, d.title]));

        setState({ phase: "ready", apps: items.map((a) => ({ ...a, driveTitle: titles.get(a.driveId) ?? "Drive" })), error: null });
      })
      .catch((error) => !isAbortError(error) && setState({ phase: "error", apps: [], error }));

    return () => controller.abort();
  }, [candidateId]);

  if (state.phase === "loading") return <p className="panel__note">Checking this person's applications…</p>;

  if (state.phase === "error") {
    return <p className="panel__note">Applications could not be loaded ({getErrorMessage(state.error)}). The interview can still be scheduled without a link.</p>;
  }

  if (state.apps.length === 0) {
    return <p className="panel__note">This candidate has no student application, so the interview will not be linked to one.</p>;
  }

  const linkable = state.apps.filter((a) => a.status === "SHORTLISTED");

  return (
    <div className="field">
      <label htmlFor={id}><IconText icon={Link2}>Application (optional)</IconText></label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Do not link to an application</option>
        {state.apps.map((a) => (
          <option key={a.id} value={a.id} disabled={a.status !== "SHORTLISTED"}>
            {a.applicationNo} · {a.driveTitle} · {a.level} · {STATUS_LABEL[a.status] ?? a.status}
          </option>
        ))}
      </select>
      <p className="field__hint">
        {linkable.length === 0
          ? "None of this person's applications is shortlisted yet, so none can be linked."
          : "Linking moves the application to “Interview scheduled”. Only shortlisted applications can be linked."}
      </p>
    </div>
  );
}
