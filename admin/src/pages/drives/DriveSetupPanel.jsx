import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ClipboardList, RefreshCw, Trash2 } from "lucide-react";
import { IconText } from "../../components/ui/Field.jsx";

import { driveConfigApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import { formatDateTime, fromIstDateTimeInput, toIstDateTimeInput } from "../../utils/format.js";

const LEVELS = [
  { value: "BOTH", label: "UG and PG" },
  { value: "UG", label: "UG only" },
  { value: "PG", label: "PG only" },
];

const levelsOf = (levelAllowed) => (levelAllowed === "UG" ? ["UG"] : levelAllowed === "PG" ? ["PG"] : ["UG", "PG"]);

export default function DriveSetupPanel({ drive, onClose, onChanged }) {
  const toast = useToast();
  const [state, setState] = useState({ phase: "loading", config: null, error: null });
  const [templates, setTemplates] = useState([]);
  const [coordinators, setCoordinators] = useState([]);
  const [problem, setProblem] = useState(null);
  const [windowForm, setWindowForm] = useState({ start: "", end: "" });
  const [busy, setBusy] = useState(false);
  const [pickCoordinator, setPickCoordinator] = useState("");

  const apply = useCallback((config) => {
    setState({ phase: "ready", config, error: null });
    setWindowForm({ start: toIstDateTimeInput(config.testStartsAt), end: toIstDateTimeInput(config.testEndsAt) });
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      driveConfigApi.get(drive.id, controller.signal),
      driveConfigApi.templateOptions(controller.signal).catch(() => []),
      driveConfigApi.coordinatorCandidates(controller.signal).catch(() => []),
    ])
      .then(([config, list, people]) => {
        apply(config);
        setTemplates(list);
        setCoordinators(people);
      })
      .catch((error) => !isAbortError(error) && setState({ phase: "error", config: null, error }));

    return () => controller.abort();
  }, [drive.id, apply]);

  async function run(action, success) {
    setBusy(true);
    setProblem(null);

    try {
      apply(await action());
      onChanged?.();

      if (success) toast.success(success);
    } catch (error) {
      setProblem({ message: getErrorMessage(error), issues: error?.details?.issues ?? [] });
    } finally {
      setBusy(false);
    }
  }

  const config = state.config;

  return (
    <SidePanel open title="Assessment setup" subtitle={drive.title} onClose={onClose} busy={busy} footer={<button type="button" className="btn btn--outline" onClick={onClose} disabled={busy}>Close</button>}>
      {state.phase === "loading" ? <LoadingState label="Loading setup…" /> : null}
      {state.phase === "error" ? <ErrorState title="Couldn't load the setup" message={getErrorMessage(state.error)} /> : null}

      {config ? (
        <div className="stack">
          {problem ? (
            <div className="notice notice--error" role="alert">
              <span>
                {problem.message}
                {problem.issues.length > 0 ? (
                  <ul className="checklist">
                    {problem.issues.map((i) => (
                      <li key={`${i.code}-${i.message}`}>{i.message}</li>
                    ))}
                  </ul>
                ) : null}
              </span>
            </div>
          ) : null}

          <section className="detail__section">
            <h3>Readiness</h3>
            {config.readiness.ready ? (
              <p className="notice notice--info"><span>Every allowed level has an active template that the question bank can fill.</span></p>
            ) : (
              <ul className="checklist">
                {config.readiness.issues.map((i) => (
                  <li key={`${i.code}-${i.message}`}>{i.message}</li>
                ))}
              </ul>
            )}
            <p className="panel__note">The drive must also be published (Edit the drive) before registration can open.</p>
          </section>

          <section className="detail__section">
            <h3>Levels</h3>
            <label className="filter">
              <span className="filter__label">Students allowed</span>
              <select value={config.levelAllowed} disabled={busy} onChange={(e) => run(() => driveConfigApi.update(drive.id, { levelAllowed: e.target.value }), "Levels updated")}>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="detail__section">
            <h3>Test templates</h3>
            {levelsOf(config.levelAllowed).map((level) => {
              const slot = config.templates.find((t) => t.level === level);
              const options = templates.filter((t) => t.level === level);

              return (
                <div className="field" key={level}>
                  <label htmlFor={`tpl-${level}`}><IconText icon={ClipboardList}>{level} template</IconText></label>
                  <div className="field__control">
                    <select
                      id={`tpl-${level}`}
                      value={slot?.templateId ?? ""}
                      disabled={busy || options.length === 0}
                      onChange={(e) => e.target.value && run(() => driveConfigApi.setTemplate(drive.id, level, e.target.value), `${level} template assigned`)}
                    >
                      {slot ? null : <option value="">Not assigned</option>}
                      {options.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.questionCount} questions, {t.durationMinutes} min)</option>
                      ))}
                    </select>
                    {slot ? (
                      <button type="button" className="btn btn--ghost btn--sm btn--danger-text" disabled={busy} onClick={() => run(() => driveConfigApi.removeTemplate(drive.id, level), `${level} template removed`)}>
                        <Trash2 size={14} aria-hidden="true" />
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {slot ? <p className="field__hint">{slot.questionCount} questions · {slot.durationMinutes} minutes{slot.isActive ? "" : " · inactive"}</p> : null}
                </div>
              );
            })}
            {templates.length === 0 ? <p className="panel__note">No active templates yet. The Super Admin creates them under Test templates.</p> : null}
          </section>

          <section className="detail__section">
            <h3>Registration and test window</h3>
            <p>
              Registration is <StatusBadge tone={config.registrationOpen ? "success" : "neutral"}>{config.registrationOpen ? "open" : "closed"}</StatusBadge>{" "}
              <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => run(() => driveConfigApi.update(drive.id, { registrationOpen: !config.registrationOpen }), config.registrationOpen ? "Registration closed" : "Registration opened")}>
                {config.registrationOpen ? "Close registration" : "Open registration"}
              </button>
            </p>
            <div className="grid2">
              <label className="filter">
                <span className="filter__label"><IconText icon={CalendarClock}>Test opens (IST)</IconText></span>
                <input type="datetime-local" value={windowForm.start} onChange={(e) => setWindowForm((w) => ({ ...w, start: e.target.value }))} disabled={busy} />
              </label>
              <label className="filter">
                <span className="filter__label"><IconText icon={CalendarClock}>Test closes (IST)</IconText></span>
                <input type="datetime-local" value={windowForm.end} onChange={(e) => setWindowForm((w) => ({ ...w, end: e.target.value }))} disabled={busy} />
              </label>
            </div>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    driveConfigApi.update(drive.id, {
                      testStartsAt: windowForm.start ? fromIstDateTimeInput(windowForm.start) : null,
                      testEndsAt: windowForm.end ? fromIstDateTimeInput(windowForm.end) : null,
                    }),
                  "Test window saved",
                )
              }
            >
              Save test window
            </button>
            {config.testStartsAt || config.testEndsAt ? (
              <p className="panel__note">Currently {config.testStartsAt ? formatDateTime(config.testStartsAt) : "no start"} to {config.testEndsAt ? formatDateTime(config.testEndsAt) : "no end"}. Leave a field empty for no limit.</p>
            ) : null}
          </section>

          <section className="detail__section">
            <h3>Access code</h3>
            <p>
              {config.accessCode ? <strong className="rank">{config.accessCode}</strong> : "No code yet"}{" "}
              <button type="button" className="btn btn--outline btn--sm" disabled={busy} onClick={() => run(() => driveConfigApi.update(drive.id, { regenerateAccessCode: true }), "New access code created")}>
                <RefreshCw size={14} aria-hidden="true" />
                {config.accessCode ? "Regenerate" : "Create code"}
              </button>
            </p>
          </section>

          <section className="detail__section">
            <h3>Campus coordinators</h3>
            {config.coordinators.length === 0 ? <p className="panel__note">No coordinator is assigned. Coordinators see only the drives assigned to them.</p> : null}
            <ul className="checklist">
              {config.coordinators.map((c) => (
                <li key={c.userId}>
                  {c.name} <span className="sub">{c.email}</span>{" "}
                  <button type="button" className="btn btn--ghost btn--sm btn--danger-text" disabled={busy} onClick={() => run(() => driveConfigApi.unassignCoordinator(drive.id, c.userId), "Coordinator removed")}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="field__control">
              <select value={pickCoordinator} onChange={(e) => setPickCoordinator(e.target.value)} disabled={busy} aria-label="Coordinator to assign">
                <option value="">Choose a coordinator…</option>
                {coordinators.filter((p) => !config.coordinators.some((c) => c.userId === p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                ))}
              </select>
              <button type="button" className="btn btn--primary btn--sm" disabled={busy || !pickCoordinator} onClick={() => { const id = pickCoordinator; setPickCoordinator(""); run(() => driveConfigApi.assignCoordinator(drive.id, id), "Coordinator assigned"); }}>
                Assign
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </SidePanel>
  );
}
