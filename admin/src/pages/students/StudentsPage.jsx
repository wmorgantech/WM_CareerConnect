import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck } from "lucide-react";

import { studentsApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import { attemptStatusLabel, formatRemaining } from "../../utils/assessment.js";
import { formatDateTime } from "../../utils/format.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import StudentForm from "./StudentForm.jsx";

const fetchStudents = (params, signal) => studentsApi.list(params, signal);
const INITIAL = { driveId: "", search: "", status: "" };
const REFRESH_MS = 15000;

const ATTEMPT_TONE = { NOT_STARTED: "neutral", IN_PROGRESS: "info", SUBMITTED: "success" };

function CredentialPanel({ credential, name, onClose }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(credential.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <SidePanel open title="Student credential" subtitle={name} onClose={onClose} footer={<button type="button" className="btn btn--primary" onClick={onClose}>Done</button>}>
      <div className="stack">
        <p className="notice notice--warn" role="status">
          <span>Give these to the student now. The password is shown only once and cannot be recovered; if it is lost, issue a new one.</span>
        </p>
        <div className="secret">
          <span className="sub">Login ID</span>
          <span className="secret__value">{credential.loginId}</span>
        </div>
        <div className="secret">
          <span className="sub">Temporary password</span>
          <span className="secret__value">{credential.temporaryPassword}</span>
          <button type="button" className="btn btn--outline btn--sm" onClick={copy}>
            <Copy size={14} aria-hidden="true" />
            {copied ? "Copied" : "Copy password"}
          </button>
        </div>
        <p className="panel__note">The student must choose a new password when they first sign in.</p>
      </div>
    </SidePanel>
  );
}

export default function StudentsPage() {
  const toast = useToast();
  const { hasPermission } = usePermissions();
  const canRegister = hasPermission("candidates.register");
  const list = useListQuery(fetchStudents, INITIAL, { limit: 25 });
  const reload = list.reload;
  const [drives, setDrives] = useState({ phase: "loading", items: [], error: null });
  const [panel, setPanel] = useState(false);
  const [credential, setCredential] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const loadDrives = useCallback(async (signal) => {
    try {
      setDrives({ phase: "ready", items: await studentsApi.myDrives(signal), error: null });
    } catch (error) {
      if (!isAbortError(error)) setDrives({ phase: "error", items: [], error });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    loadDrives(controller.signal);

    return () => controller.abort();
  }, [loadDrives]);

useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, REFRESH_MS);

    return () => clearInterval(timer);
  }, [reload]);

  const selected = useMemo(() => drives.items.find((d) => d.id === list.filters.driveId) ?? null, [drives.items, list.filters.driveId]);
  const filtered = list.filters.search !== "" || list.filters.status !== "" || list.filters.driveId !== "";

  async function verify(student) {
    try {
      await studentsApi.verify(student.id);
      toast.success(`${student.name} verified`);
      list.reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function issue() {
    const { student } = confirm;
    const issued = await studentsApi.issueCredential(student.id);

    setConfirm(null);
    setCredential({ ...issued, name: student.name });
    list.reload();
  }

  const columns = [
    {
      key: "student",
      header: "Student",
      render: (s) => (
        <>
          <strong>{s.name}</strong>
          <span className="sub">{s.applicationNo}</span>
          {s.selfRegistered ? <StatusBadge tone="info">Self-registered</StatusBadge> : null}
        </>
      ),
    },
    { key: "contact", header: "Contact", render: (s) => (<><span>{s.mobile}</span><span className="sub">{s.email}</span></>) },
    { key: "level", header: "Level", render: (s) => s.level },
    {
      key: "verified",
      header: "Identity",
      render: (s) => (s.verified ? <StatusBadge tone="success">Verified</StatusBadge> : <StatusBadge tone="warn">{s.selfRegistered ? "Not verified — cannot sign in yet" : "Not verified"}</StatusBadge>),
    },
    {
      key: "credential",
      header: "Credential",
      render: (s) => (s.credentialIssued ? <StatusBadge tone={s.mustChangePassword ? "warn" : "success"}>{s.mustChangePassword ? "Issued — not used" : s.selfRegistered ? "Chosen by student" : "In use"}</StatusBadge> : <StatusBadge>None</StatusBadge>),
    },
    {
      key: "progress",
      header: "Assessment",
      render: (s) => (
        <>
          <StatusBadge tone={ATTEMPT_TONE[s.attemptStatus]}>{attemptStatusLabel(s.attemptStatus)}</StatusBadge>
          {s.attemptStatus === "IN_PROGRESS" ? <span className="sub">{formatRemaining(s.remainingSeconds)} left</span> : null}
        </>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (s) =>
        canRegister ? (
          <div className="rowactions">
            {!s.verified ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => verify(s)}>
                <ShieldCheck size={14} aria-hidden="true" />
                Verify
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirm({ kind: "credential", student: s })}
              disabled={!s.verified || s.attemptStatus === "SUBMITTED"}
              title={!s.verified ? "Verify the student's identity first" : s.attemptStatus === "SUBMITTED" ? "Already submitted" : undefined}
            >
              <KeyRound size={14} aria-hidden="true" />
              {s.credentialIssued ? "Reset password" : "Issue credential"}
            </button>
          </div>
        ) : (
          "—"
        ),
    },
  ];

  const registrationOpen = selected?.status === "PUBLISHED" && selected?.registrationOpen;

  return (
    <div>
      <PageHeader
        title="Students"
        description="Register students, confirm their identity, give them their sign-in details and follow their progress. The list refreshes every 15 seconds."
        actions={
          <>
            <button type="button" className="btn btn--outline" onClick={() => { list.reload(); loadDrives(); }} disabled={list.phase === "loading"}>
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </button>
            {canRegister ? (
              <button type="button" className="btn btn--primary" onClick={() => setPanel(true)} disabled={!selected || !registrationOpen} title={!selected ? "Choose a drive first" : !registrationOpen ? "Registration is not open for this drive" : undefined}>
                <Plus size={16} aria-hidden="true" />
                Register student
              </button>
            ) : null}
          </>
        }
      />

      {drives.phase === "loading" ? <LoadingState label="Loading your drives…" /> : null}
      {drives.phase === "error" ? <ErrorState title="Couldn't load your drives" message={getErrorMessage(drives.error)} onRetry={() => loadDrives()} /> : null}

      {drives.phase === "ready" && drives.items.length === 0 ? (
        <section className="panel">
          <div className="tablewrap tablewrap--empty">
            <p className="state__title">No drives assigned to you</p>
            <p className="state__text">Ask the HR admin or Super Admin to assign you to a drive.</p>
          </div>
        </section>
      ) : null}

      {drives.items.length > 0 ? (
        <section className="panel">
          <FilterBar onReset={list.resetFilters} canReset={filtered}>
            <SelectFilter label="Drive" value={list.filters.driveId} onChange={(v) => list.setFilter("driveId", v)} options={drives.items.map((d) => ({ value: d.id, label: d.title }))} allLabel="All my drives" />
            <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name, mobile, application no…" />
            <SelectFilter
              label="Status"
              value={list.filters.status}
              onChange={(v) => list.setFilter("status", v)}
              options={[
                { value: "REGISTERED", label: "Registered" },
                { value: "TEST_IN_PROGRESS", label: "Test in progress" },
                { value: "TEST_SUBMITTED", label: "Test submitted" },
              ]}
            />
          </FilterBar>

          {selected ? (
            <p className="panel__note">
              {selected.college ?? "College"} · {selected.status === "PUBLISHED" ? "Published" : selected.status.toLowerCase()} · registration {selected.registrationOpen ? "open" : "closed"}
              {selected.testStartsAt ? ` · test ${formatDateTime(selected.testStartsAt)} to ${selected.testEndsAt ? formatDateTime(selected.testEndsAt) : "—"}` : ""}
              {selected.accessCode ? ` · access code ${selected.accessCode}` : ""}
            </p>
          ) : null}

          <DataTable
            columns={columns}
            rows={list.items}
            phase={list.phase}
            error={list.error}
            onRetry={list.reload}
            caption="Students"
            emptyTitle={filtered ? "No students match these filters" : "No students registered yet"}
            emptyText={filtered ? "Try different filters or clear them." : "Register the first student for a drive."}
          />

          <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
        </section>
      ) : null}

      {panel && selected ? (
        <StudentForm
          drive={selected}
          onClose={() => setPanel(false)}
          onSaved={(message) => {
            setPanel(false);
            toast.success(message);
            list.reload();
            loadDrives();
          }}
        />
      ) : null}

      {credential ? <CredentialPanel credential={credential} name={credential.name} onClose={() => setCredential(null)} /> : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.student.credentialIssued ? "Reset this student's password?" : "Issue a credential?"}
        message={
          confirm?.student.credentialIssued
            ? `${confirm?.student.name} will be signed out everywhere and the old password will stop working. A new temporary password will be shown once.`
            : `A temporary password will be created for ${confirm?.student.name}. It is shown once, and the student must change it at first sign-in.`
        }
        confirmLabel={confirm?.student.credentialIssued ? "Reset password" : "Issue credential"}
        tone="primary"
        onCancel={() => setConfirm(null)}
        onConfirm={issue}
      />
    </div>
  );
}
