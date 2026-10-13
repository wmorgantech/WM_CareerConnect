import { useCallback, useEffect, useMemo, useState } from "react";

import { resultsApi, studentsApi } from "../../api/modules.api.js";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { SelectField, TextField, TextAreaField } from "../../components/ui/Field.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import { formatScore } from "../../utils/assessment.js";
import { getErrorMessage } from "../../utils/errors.js";

const fetchRows = (params, signal) => resultsApi.list(params, signal);
const INITIAL = { driveId: "", level: "", search: "" };

const STATUS = {
  REGISTERED: ["Registered", "neutral"],
  TEST_IN_PROGRESS: ["Test in progress", "info"],
  TEST_SUBMITTED: ["Awaiting decision", "warn"],
  SHORTLISTED: ["Shortlisted", "success"],
  INTERVIEW_SCHEDULED: ["Interview scheduled", "info"],
  INTERVIEW_COMPLETED: ["Interview completed", "info"],
  SELECTED: ["Selected", "success"],
  ON_HOLD: ["On hold", "warn"],
  REJECTED: ["Rejected", "danger"],
};

const ACTION_LABEL = { SHORTLISTED: "Shortlist", REJECTED: "Reject" };

export default function DecisionsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const can = useCallback(
    (permission) => (user?.permissions ?? []).includes(permission),
    [user],
  );
  const list = useListQuery(fetchRows, INITIAL, { limit: 25 });
  const [drives, setDrives] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    studentsApi
      .myDrives(controller.signal)
      .then(setDrives)
      .catch(() => {});

    return () => controller.abort();
  }, []);

  const driveOptions = drives.map((d) => ({ value: d.id, label: d.title }));
  const filtered = Object.values(list.filters).some((v) => v !== "");

  const columns = useMemo(
    () => [
      { key: "student", header: "Student", render: (r) => (<><strong>{r.name}</strong><span className="sub">{r.applicationNo}</span></>) },
      { key: "drive", header: "Drive", render: (r) => (<><span>{r.drive.title}</span><span className="sub">{r.level}</span></>) },
      { key: "score", header: "Score", render: (r) => (r.percentage === null ? "—" : <><strong>{formatScore(r.percentage)}%</strong><span className="sub">{formatScore(r.score)} / {r.maxScore}</span></>) },
      {
        key: "status",
        header: "Status",
        render: (r) => {
          const [label, tone] = STATUS[r.applicationStatus] ?? [r.applicationStatus, "neutral"];

          return <StatusBadge tone={tone}>{label}</StatusBadge>;
        },
      },
      {
        key: "actions",
        header: "Decision",
        align: "right",
        render: (r) =>
          r.applicationStatus === "TEST_SUBMITTED" ? (
            <div className="rowactions">
              {can("candidates.shortlist") ? (
                <button type="button" className="btn btn--outline btn--sm" onClick={() => open(r, "SHORTLISTED")}>Shortlist</button>
              ) : null}
              {can("candidates.reject") ? (
                <button type="button" className="btn btn--danger btn--sm" onClick={() => open(r, "REJECTED")}>Reject</button>
              ) : null}
            </div>
          ) : (
            <span className="sub">No decision needed</span>
          ),
      },
    ],
    [can],
  );

  function open(row, status) {
    setNote("");
    setConfirm({ row, status });
  }

  async function decide() {
    const { row, status } = confirm;

    try {
      await studentsApi.setStatus(row.applicationId, { status, ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(`${row.name} ${status === "SHORTLISTED" ? "shortlisted" : "rejected"}.`);
      setConfirm(null);
      list.reload();
    } catch (error) {

      throw new Error(error?.code === "APPLICATION_CHANGED" ? "Someone else changed this application. Close this and reload the list." : getErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Shortlisting"
        description="Decide who moves forward after the assessment. Students whose assessment is submitted are waiting for a decision; each decision is recorded in the audit log."
      />

      {can("candidates.shortlist") || can("candidates.reject") ? <BulkPanel drives={driveOptions} can={can} onApplied={list.reload} /> : null}

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name or application no…" />
          <SelectFilter label="Drive" value={list.filters.driveId} onChange={(v) => list.setFilter("driveId", v)} options={driveOptions} />
          <SelectFilter label="Level" value={list.filters.level} onChange={(v) => list.setFilter("level", v)} options={[{ value: "UG", label: "UG" }, { value: "PG", label: "PG" }]} />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={list.items}
          rowKey={(r) => r.applicationId}
          phase={list.phase}
          error={list.error}
          onRetry={list.reload}
          caption="Students and decisions"
          emptyTitle={filtered ? "No students match these filters" : "No students yet"}
          emptyText={filtered ? "Try different filters or clear them." : "Students appear here once they register for a drive."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm?.status === "REJECTED" ? "danger" : "primary"}
        title={confirm ? `${ACTION_LABEL[confirm.status]} ${confirm.row.name}?` : ""}
        message={
          confirm ? (
            <>
              <span>
                {confirm.row.applicationNo} · {confirm.row.drive.title}
                {confirm.row.percentage === null ? "" : ` · ${formatScore(confirm.row.percentage)}%`}. The student is not told by this action.
              </span>
              <TextAreaField label="Note (optional)" name="note" value={note} onChange={(_, v) => setNote(v)} rows={2} maxLength={500} />
            </>
          ) : null
        }
        confirmLabel={confirm ? ACTION_LABEL[confirm.status] : "Confirm"}
        onConfirm={decide}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function BulkPanel({ drives, can, onApplied }) {
  const toast = useToast();
  const actions = [
    ...(can("candidates.shortlist") ? [{ value: "SHORTLIST", label: "Shortlist at or above the percentage" }] : []),
    ...(can("candidates.reject") ? [{ value: "REJECT", label: "Reject below the percentage" }] : []),
  ];
  const [form, setForm] = useState({ driveId: "", level: "", action: actions[0]?.value ?? "", percentage: "" });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const percentage = Number(form.percentage);
  const valid = form.driveId && form.action && form.percentage !== "" && Number.isFinite(percentage) && percentage >= 0 && percentage <= 100;

  function change(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
    setPreview(null);
    setError("");
  }

  const body = (previewOnly) => ({
    driveId: form.driveId,
    ...(form.level ? { level: form.level } : {}),
    action: form.action,
    percentage,
    preview: previewOnly,
  });

  async function runPreview() {
    setBusy(true);
    setError("");

    try {
      setPreview(await studentsApi.bulkStatus(body(true)));
    } catch (e) {
      setPreview(null);
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    try {
      const result = await studentsApi.bulkStatus(body(false));

      toast.success(`${result.applied} student${result.applied === 1 ? "" : "s"} updated${result.skipped ? `, ${result.skipped} skipped (changed meanwhile)` : ""}.`);
      setConfirming(false);
      setPreview(null);
      onApplied();
    } catch (e) {
      throw new Error(getErrorMessage(e));
    }
  }

  return (
    <section className="panel bulk">
      <h2 className="panel__title">Decide many at once</h2>
      <p className="bulk__note">Applies only to students whose assessment is submitted and still awaiting a decision. Preview first; nothing changes until you confirm.</p>

      <div className="bulkform">
        <SelectField label="Drive" name="driveId" value={form.driveId} onChange={change} options={drives} placeholder="Choose a drive" required />
        <SelectField label="Level" name="level" value={form.level} onChange={change} options={[{ value: "UG", label: "UG" }, { value: "PG", label: "PG" }]} placeholder="UG and PG" />
        <SelectField label="Action" name="action" value={form.action} onChange={change} options={actions} required />
        <TextField label="Percentage (0–100)" name="percentage" type="number" min="0" max="100" step="0.01" value={form.percentage} onChange={change} required />
      </div>

      {error ? <p className="field__error" role="alert">{error}</p> : null}

      <div className="bulkform__foot">
        <button type="button" className="btn btn--outline" onClick={runPreview} disabled={!valid || busy}>
          {busy ? "Checking…" : "Preview"}
        </button>
      </div>

      {preview ? (
        <div className="stack">
          <p className="notice notice--info">
            <span>
              {preview.count === 0
                ? "No students match this selection."
                : `${preview.count} student${preview.count === 1 ? "" : "s"} would be ${preview.target === "SHORTLISTED" ? "shortlisted" : "rejected"}.`}
            </span>
          </p>
          {preview.count > 0 ? (
            <>
              <div className="tablewrap">
                <table className="table">
                  <caption className="sr-only">Students this action would change</caption>
                  <thead>
                    <tr><th scope="col">Student</th><th scope="col">Level</th><th scope="col" className="is-right">Score</th></tr>
                  </thead>
                  <tbody>
                    {preview.students.map((s) => (
                      <tr key={s.id}>
                        <td data-label="Student"><strong>{s.name}</strong><span className="sub">{s.applicationNo}</span></td>
                        <td data-label="Level">{s.level}</td>
                        <td data-label="Score" className="is-right">{formatScore(s.percentage)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bulkform__foot">
                <button type="button" className={form.action === "REJECT" ? "btn btn--danger" : "btn btn--primary"} onClick={() => setConfirming(true)}>
                  {form.action === "REJECT" ? "Reject" : "Shortlist"} {preview.count}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        tone={form.action === "REJECT" ? "danger" : "primary"}
        title={`${form.action === "REJECT" ? "Reject" : "Shortlist"} ${preview?.count ?? 0} students?`}
        message={`This ${form.action === "REJECT" ? `rejects everyone below ${percentage}%` : `shortlists everyone at or above ${percentage}%`} in the chosen drive${form.level ? ` (${form.level})` : ""}. Each change is recorded in the audit log.`}
        confirmLabel={form.action === "REJECT" ? "Reject them" : "Shortlist them"}
        onConfirm={apply}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
