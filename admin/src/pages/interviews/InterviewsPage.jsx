import { useCallback, useState } from "react";
import { Eye, Pencil, Plus } from "lucide-react";

import { interviewsApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useInterviewers } from "../../hooks/useInterviewers.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import { usePermissions } from "../../hooks/usePermissions.js";
import { formatDateTime, shortId } from "../../utils/format.js";
import InterviewDetail, { feedbackState } from "./InterviewDetail.jsx";
import InterviewForm from "./InterviewForm.jsx";
import { INTERVIEW_STATUS_LABEL, INTERVIEW_STATUS_OPTIONS, INTERVIEW_STATUS_TONE } from "./interviewMeta.js";

const fetchInterviews = (params, signal) => interviewsApi.list(params, signal);
const INITIAL = { status: "", interviewerId: "" };
const FEEDBACK_LABEL = { NONE: "Not submitted", LOCKED: "Submitted · locked", UNLOCKED: "Unlocked" };
const FEEDBACK_TONE = { NONE: "neutral", LOCKED: "success", UNLOCKED: "warn" };

export default function InterviewsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canSchedule = hasPermission("interviews.schedule");
  const list = useListQuery(fetchInterviews, INITIAL);
  const interviewers = useInterviewers(canSchedule);
  const [panel, setPanel] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const filtered = Object.values(list.filters).some((value) => value !== "");

const nameFor = useCallback(
    (id) => interviewers.items.find((i) => i.id === id)?.name ?? (id === user?.id ? user.name : shortId(id)),
    [interviewers.items, user],
  );

  const columns = [
    {
      key: "candidate",
      header: "Candidate",
      render: (i) => (
        <>
          <button type="button" className="linkbtn" onClick={() => setPanel({ kind: "detail", interview: i })}>
            {i.candidate.name}
          </button>
          <span className="sub">{i.candidate.email}</span>
        </>
      ),
    },
    { key: "when", header: "When (IST)", render: (i) => formatDateTime(i.scheduledAt) },
    { key: "duration", header: "Duration", render: (i) => `${i.durationMinutes} min` },
    { key: "interviewer", header: "Interviewer", render: (i) => nameFor(i.interviewerId) },
    { key: "status", header: "Status", render: (i) => <StatusBadge tone={INTERVIEW_STATUS_TONE[i.status]}>{INTERVIEW_STATUS_LABEL[i.status]}</StatusBadge> },
    {
      key: "feedback",
      header: "Feedback",
      render: (i) => {
        const state = feedbackState(i);

        return <StatusBadge tone={FEEDBACK_TONE[state]}>{FEEDBACK_LABEL[state]}</StatusBadge>;
      },
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (i) => (
        <div className="rowactions">
          <ActionIcon icon={Eye} label={`View interview with ${i.candidate.name}`} onClick={() => setPanel({ kind: "detail", interview: i })} />
          {canSchedule ? (
            <>
              <ActionIcon icon={Pencil} label={`Edit interview with ${i.candidate.name}`} onClick={() => setPanel({ kind: "form", interview: i })} />
              <button
                type="button"
                className="btn btn--ghost btn--sm btn--danger-text"
                onClick={() => setConfirm({ interview: i })}
                disabled={i.status === "CANCELLED"}
              >
                Cancel
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  async function cancelInterview() {
    await interviewsApi.remove(confirm.interview.id);
    toast.success("Interview cancelled");
    setConfirm(null);
    list.reload();
  }

  return (
    <div>
      <PageHeader
        title="Interviews"
        description={canSchedule ? "Schedule interviews, track feedback and unlock corrections." : "Your assigned interviews and feedback."}
        actions={
          canSchedule ? (
            <button type="button" className="btn btn--primary" onClick={() => setPanel({ kind: "form", interview: null })}>
              <Plus size={16} aria-hidden="true" />
              Schedule interview
            </button>
          ) : null
        }
      />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SelectFilter label="Status" value={list.filters.status} onChange={(v) => list.setFilter("status", v)} options={INTERVIEW_STATUS_OPTIONS} />
          {canSchedule ? (
            <SelectFilter
              label="Interviewer"
              value={list.filters.interviewerId}
              onChange={(v) => list.setFilter("interviewerId", v)}
              options={interviewers.items.map((i) => ({ value: i.id, label: i.name }))}
            />
          ) : null}
        </FilterBar>

        <DataTable
          columns={columns}
          rows={list.items}
          phase={list.phase}
          error={list.error}
          onRetry={list.reload}
          caption="Interviews"
          emptyTitle={filtered ? "No interviews match these filters" : "No interviews yet"}
          emptyText={filtered ? "Try different filters or clear them." : canSchedule ? "Schedule the first interview to get started." : "Interviews assigned to you will appear here."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {panel?.kind === "form" ? (
        <InterviewForm
          interview={panel.interview}
          interviewers={interviewers}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            toast.success(message);
            list.reload();
          }}
        />
      ) : null}

      {panel?.kind === "detail" ? (
        <InterviewDetail
          key={panel.interview.id}
          interview={panel.interview}
          interviewerName={nameFor(panel.interview.interviewerId)}
          onClose={() => setPanel(null)}
          onEdit={(interview) => setPanel({ kind: "form", interview })}
          onChanged={list.reload}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Cancel interview?"
        message={confirm ? `The interview with ${confirm.interview.candidate.name} on ${formatDateTime(confirm.interview.scheduledAt)} IST will be marked Cancelled. It stays in the list for reference.` : ""}
        confirmLabel="Cancel interview"
        cancelLabel="Keep interview"
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={cancelInterview}
      />
    </div>
  );
}
