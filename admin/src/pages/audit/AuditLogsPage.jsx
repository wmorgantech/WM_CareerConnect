import { useState } from "react";
import { Eye } from "lucide-react";

import { auditApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { DateFilter, FilterBar, TextFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import SidePanel from "../../components/ui/SidePanel.jsx";
import StatusBadge from "../../components/ui/StatusBadge.jsx";
import { useListQuery } from "../../hooks/useListQuery.js";
import { formatDateTime, shortId } from "../../utils/format.js";

const fetchLogs = (params, signal) => auditApi.list(params, signal);
const INITIAL = { userId: "", action: "", entity: "", entityId: "", fromDate: "", toDate: "" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KNOWN_ACTIONS = [
  "LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT",
  "USER_CREATED", "USER_UPDATED", "USER_DEACTIVATED", "USER_REACTIVATED", "USER_DELETED",
  "COLLEGE_CREATED", "COLLEGE_UPDATED", "COLLEGE_DEACTIVATED", "COLLEGE_REACTIVATED", "COLLEGE_DELETED",
  "DRIVE_CREATED", "DRIVE_UPDATED", "DRIVE_DEACTIVATED", "DRIVE_REACTIVATED", "DRIVE_DELETED",
  "CANDIDATE_CREATED", "CANDIDATE_UPDATED", "CANDIDATE_DEACTIVATED", "CANDIDATE_REACTIVATED", "CANDIDATE_DELETED",
  "INTERVIEW_CREATED", "INTERVIEW_UPDATED", "INTERVIEW_CANCELLED", "INTERVIEW_FEEDBACK_SUBMITTED", "INTERVIEW_FEEDBACK_UNLOCKED",
  "SETTINGS_CREATED", "SETTINGS_UPDATED", "REPORT_EXPORTED",
];
const KNOWN_ENTITIES = ["Auth", "User", "College", "Drive", "Candidate", "Interview", "Setting", "Report"];

const SENSITIVE_KEY = /password|token|secret|hash|credential|cookie|authorization/i;

function tone(action) {
  const last = String(action ?? "").split("_").pop();

  if (["CREATED", "REACTIVATED", "SUCCEEDED"].includes(last)) return "success";
  if (last === "DELETED") return "danger";
  if (["DEACTIVATED", "FAILED", "CANCELLED"].includes(last)) return "warn";
  if (["UPDATED", "UNLOCKED", "SUBMITTED", "EXPORTED"].includes(last)) return "info";

  return "neutral";
}

const label = (action) => {
  const text = String(action ?? "").toLowerCase().replace(/_/g, " ");

  return text.charAt(0).toUpperCase() + text.slice(1);
};

function parseDetails(details) {
  if (!details) return null;

  try {
    const parsed = JSON.parse(details);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        rows: Object.entries(parsed).map(([key, value]) => ({
          key,
          value: SENSITIVE_KEY.test(key)
            ? "••••••"
            : value === null || value === undefined
              ? "—"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value),
        })),
      };
    }
  } catch {
    return { text: String(details) };
  }

  return { text: String(details) };
}

export default function AuditLogsPage() {
  const list = useListQuery(fetchLogs, INITIAL);
  const [selected, setSelected] = useState(null);

  const filtered = Object.values(list.filters).some((value) => value !== "");
  const badUser = list.filters.userId && !UUID.test(list.filters.userId.trim());
  const badRange = list.filters.fromDate && list.filters.toDate && list.filters.fromDate > list.filters.toDate;

  const columns = [
    { key: "when", header: "When (IST)", render: (l) => formatDateTime(l.createdAt) },
    { key: "action", header: "Action", render: (l) => <StatusBadge tone={tone(l.action)}>{label(l.action)}</StatusBadge> },
    {
      key: "entity",
      header: "Record",
      render: (l) => (
        <>
          {l.entity || "—"}
          {l.entityId ? <span className="sub" title={l.entityId}>{shortId(l.entityId)}</span> : null}
        </>
      ),
    },
    { key: "user", header: "By", render: (l) => (l.userId ? <span title={l.userId}>{shortId(l.userId)}</span> : "—") },
    { key: "ip", header: "IP address", render: (l) => l.ipAddress || "—" },
    {
      key: "actions",
      header: "Details",
      align: "right",
      render: (l) => (
        <ActionIcon icon={Eye} label={`View ${label(l.action)} details`} onClick={() => setSelected(l)} />
      ),
    },
  ];

  const details = selected ? parseDetails(selected.details) : null;

  return (
    <div>
      <PageHeader title="Audit log" description="A record of sign-ins and changes made in the system, newest first." />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <TextFilter label="Action" value={list.filters.action} onChange={(v) => list.setFilter("action", v)} listId="audit-actions" placeholder="e.g. DRIVE_CREATED" />
          <TextFilter label="Record type" value={list.filters.entity} onChange={(v) => list.setFilter("entity", v)} listId="audit-entities" placeholder="e.g. Drive" />
          <TextFilter label="Record ID" value={list.filters.entityId} onChange={(v) => list.setFilter("entityId", v)} />
          <TextFilter label="User ID" value={list.filters.userId} onChange={(v) => list.setFilter("userId", v.trim())} placeholder="UUID" />
          <DateFilter label="From" value={list.filters.fromDate} onChange={(v) => list.setFilter("fromDate", v)} />
          <DateFilter label="To" value={list.filters.toDate} onChange={(v) => list.setFilter("toDate", v)} />
        </FilterBar>

        <datalist id="audit-actions">
          {KNOWN_ACTIONS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <datalist id="audit-entities">
          {KNOWN_ENTITIES.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>

        {badUser ? <p className="notice notice--error" role="alert">User ID must be a valid UUID.</p> : null}
        {badRange ? <p className="notice notice--error" role="alert">The “From” date can't be after the “To” date.</p> : null}

        <DataTable
          columns={columns}
          rows={badUser || badRange ? [] : list.items}
          phase={badUser || badRange ? "ready" : list.phase}
          error={list.error}
          onRetry={list.reload}
          caption="Audit log"
          emptyTitle={filtered ? "No entries match these filters" : "No audit entries yet"}
          emptyText={filtered ? "Try different filters or clear them." : undefined}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {selected ? (
        <SidePanel open title={label(selected.action)} subtitle={formatDateTime(selected.createdAt) + " IST"} onClose={() => setSelected(null)}>
          <dl className="detail">
            <div><dt>Record type</dt><dd>{selected.entity || "—"}</dd></div>
            <div><dt>Record ID</dt><dd className="mono">{selected.entityId || "—"}</dd></div>
            <div><dt>User ID</dt><dd className="mono">{selected.userId || "— (no signed-in user)"}</dd></div>
            <div><dt>IP address</dt><dd>{selected.ipAddress || "—"}</dd></div>
            <div><dt>Browser</dt><dd className="pre">{selected.userAgent || "—"}</dd></div>
          </dl>

          <section className="detail__section">
            <h3>Details</h3>
            {!details ? <p className="muted">No extra details.</p> : null}
            {details?.rows ? (
              <dl className="detail">
                {details.rows.map((row) => (
                  <div key={row.key}>
                    <dt>{row.key}</dt>
                    <dd className="pre">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {details?.text ? <p className="pre">{details.text}</p> : null}
          </section>
        </SidePanel>
      ) : null}
    </div>
  );
}
