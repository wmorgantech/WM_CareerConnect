import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { templatesApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge, { ActiveBadge } from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { topicLabel } from "../../utils/assessment.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import TemplateForm from "./TemplateForm.jsx";

function CapacityPanel({ template, onClose }) {
  const [state, setState] = useState({ phase: "loading", data: null, error: null });

  useEffect(() => {
    const controller = new AbortController();

    templatesApi
      .capacity(template.id, controller.signal)
      .then((data) => setState({ phase: "ready", data, error: null }))
      .catch((error) => !isAbortError(error) && setState({ phase: "error", data: null, error }));

    return () => controller.abort();
  }, [template.id]);

  return (
    <SidePanel open title="Question bank check" subtitle={template.name} onClose={onClose} footer={<button type="button" className="btn btn--outline" onClick={onClose}>Close</button>}>
      {state.phase === "loading" ? <LoadingState label="Checking the bank…" /> : null}
      {state.phase === "error" ? <ErrorState title="Couldn't check the bank" message={getErrorMessage(state.error)} /> : null}
      {state.data ? (
        <div className="stack">
          <p className={state.data.ok ? "notice notice--info" : "notice notice--error"} role="status">
            <span>{state.data.ok ? "The bank has enough active questions for this template." : "The bank cannot fill this template yet. A student could not start the assessment."}</span>
          </p>
          <table className="table">
            <caption className="sr-only">Questions needed and available per topic</caption>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col" className="is-right">Needed</th>
                <th scope="col" className="is-right">Available</th>
                <th scope="col" className="is-right">Short by</th>
              </tr>
            </thead>
            <tbody>
              {state.data.sections.map((s) => (
                <tr key={s.key}>
                  <td data-label="Topic">{topicLabel(s.key)}</td>
                  <td data-label="Needed" className="is-right">{s.required}</td>
                  <td data-label="Available" className="is-right">{s.available}</td>
                  <td data-label="Short by" className="is-right">{s.shortage > 0 ? <StatusBadge tone="danger">{s.shortage}</StatusBadge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.data.warnings.length > 0 ? (
            <ul className="checklist">
              {state.data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </SidePanel>
  );
}

export default function TemplatesPage() {
  const toast = useToast();
  const [state, setState] = useState({ phase: "loading", items: [], error: null });
  const [panel, setPanel] = useState(null);
  const [capacity, setCapacity] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, phase: "loading", error: null }));

    try {
      setState({ phase: "ready", items: await templatesApi.list(signal), error: null });
    } catch (error) {
      if (!isAbortError(error)) setState((s) => ({ ...s, phase: "error", error }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    load(controller.signal);

    return () => controller.abort();
  }, [load]);

  async function runConfirmed() {
    const { kind, template } = confirm;

    if (kind === "toggle") {
      await templatesApi.setStatus(template.id, !template.isActive);
      toast.success(template.isActive ? "Template deactivated" : "Template activated");
    } else {
      await templatesApi.remove(template.id);
      toast.success("Template deleted");
    }

    setConfirm(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Test templates"
        description="How many questions, how many marks per question and how long each assessment takes. UG: 45 questions, 60 marks, 60 minutes. PG: 75 questions, 75 minutes. The time is fixed by level."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setPanel({ template: null })}>
            <Plus size={16} aria-hidden="true" />
            New template
          </button>
        }
      />

      {state.phase === "loading" && state.items.length === 0 ? <LoadingState label="Loading templates…" /> : null}
      {state.phase === "error" ? <ErrorState title="Couldn't load templates" message={getErrorMessage(state.error)} onRetry={() => load()} /> : null}

      {state.phase === "ready" && state.items.length === 0 ? (
        <section className="panel">
          <div className="tablewrap tablewrap--empty">
            <p className="state__title">No templates yet</p>
            <p className="state__text">Create a UG and a PG template, then assign them to a drive.</p>
          </div>
        </section>
      ) : null}

      {state.items.length > 0 ? (
        <section className="panel">
          <div className="tablewrap">
            <table className="table">
              <caption className="sr-only">Test templates</caption>
              <thead>
                <tr>
                  <th scope="col">Template</th>
                  <th scope="col">Questions</th>
                  <th scope="col">Marks</th>
                  <th scope="col">Time</th>
                  <th scope="col">Topics</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="is-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Template">
                      <strong>{t.name}</strong>
                      <span className="sub">{t.level}</span>
                    </td>
                    <td data-label="Questions">{t.questionCount}</td>
                    <td data-label="Marks">{t.totalMarks}</td>
                    <td data-label="Time">{t.durationMinutes} min</td>
                    <td data-label="Topics">
                      {t.sections.map((s) => (
                        <span className="sub" key={s.key}>
                          {topicLabel(s.key)}: {s.questionCount} × {s.marksPerQuestion}
                        </span>
                      ))}
                    </td>
                    <td data-label="Status"><ActiveBadge active={t.isActive} /></td>
                    <td data-label="Actions" className="is-right">
                      <div className="rowactions">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCapacity(t)}>Check bank</button>
                        <ActionIcon icon={Pencil} label={`Edit ${t.name}`} onClick={() => setPanel({ template: t })} />
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm({ kind: "toggle", template: t })}>{t.isActive ? "Deactivate" : "Activate"}</button>
                        <ActionIcon icon={Trash2} label={`Delete ${t.name}`} onClick={() => setConfirm({ kind: "delete", template: t })} danger />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {panel ? (
        <TemplateForm
          template={panel.template}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            toast.success(message);
            load();
          }}
        />
      ) : null}

      {capacity ? <CapacityPanel template={capacity} onClose={() => setCapacity(null)} /> : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === "delete" ? "Delete template?" : confirm?.template.isActive ? "Deactivate template?" : "Activate template?"}
        message={
          confirm?.kind === "delete"
            ? "Only a template that was never assigned to a drive or used can be deleted."
            : confirm?.template.isActive
              ? "A template used by a published drive can't be deactivated; remove it from the drive first."
              : "It can be assigned to drives again."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : confirm?.template.isActive ? "Deactivate" : "Activate"}
        tone={confirm?.kind === "delete" || confirm?.template.isActive ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
