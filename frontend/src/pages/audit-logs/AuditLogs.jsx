import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, ShieldCheck } from "lucide-react";

import Button from "../../components/common/Button.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import FilterBar from "../../components/common/FilterBar.jsx";
import Input from "../../components/common/Input.jsx";
import Modal from "../../components/common/Modal.jsx";
import Pagination from "../../components/common/Pagination.jsx";
import Select from "../../components/common/Select.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { useResourceList } from "../../hooks/useResourceList.js";
import { getAuditLogs } from "../../services/auditLogs.service.js";
import usersService from "../../services/users.service.js";
import { formatIst } from "../interviews/interviewHelpers.js";
import { validateDateRange } from "../reports/reportConfig.js";
import {
  actionLabel,
  actionTone,
  EMPTY_FILTERS,
  isUuid,
  KNOWN_ACTIONS,
  KNOWN_ENTITIES,
  parseDetails,
  shortId,
} from "./auditHelpers.js";

const NONE = <span className="text-gray-400">—</span>;
const KEYS_TO_COMPARE = ["action", "entity", "entityId", "userId"];
const USER_LIMIT = 100;
const EMPTY_PAGE = {
  items: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

// The API returns only a user id for the actor. Holders of `users.manage`
// can resolve ids to names (first 100 users); everyone else sees the id.
function useUserLookup(enabled) {
  const [state, setState] = useState({
    items: [],
    loading: enabled,
    error: null,
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const { items } = await usersService.list({ limit: USER_LIMIT });

      setState({ items, loading: false, error: null });
    } catch (error) {
      setState({ items: [], loading: false, error });
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      load();
    }
  }, [enabled, load]);

  const byId = useMemo(
    () => new Map(state.items.map((user) => [user.id, user])),
    [state.items],
  );

  return {
    ...state,
    byId,
    available: enabled && !state.loading && !state.error,
  };
}

function Actor({ userId, byId }) {
  if (!userId) {
    return <span className="text-gray-500">System / unknown</span>;
  }

  const user = byId.get(userId);

  if (user) {
    return (
      <div className="min-w-[8rem]">
        <p className="font-medium text-gray-900">{user.name}</p>
        <p className="break-all text-xs text-gray-500">{user.email}</p>
      </div>
    );
  }

  return (
    <span className="font-mono text-xs text-gray-600" title={userId}>
      {shortId(userId)}
    </span>
  );
}

function Entity({ entity, entityId }) {
  if (!entity && !entityId) {
    return NONE;
  }

  return (
    <div className="min-w-[7rem]">
      <p className="text-gray-900">{entity ?? "—"}</p>
      {entityId && (
        <p
          className="font-mono text-xs text-gray-500"
          title={entityId}
        >
          {shortId(entityId)}
        </p>
      )}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function EntryDialog({ entry, byId, onClose }) {
  const details = parseDetails(entry.details);

  return (
    <Modal
      footer={
        <Button onClick={onClose} variant="secondary">
          Close
        </Button>
      }
      onClose={onClose}
      size="lg"
      title="Audit entry"
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <DetailRow label="When (IST)">{formatIst(entry.createdAt)}</DetailRow>

        <DetailRow label="Action">
          <StatusBadge tone={actionTone(entry.action)}>
            {actionLabel(entry.action)}
          </StatusBadge>
          <span className="mt-1 block font-mono text-xs text-gray-500">
            {entry.action ?? "—"}
          </span>
        </DetailRow>

        <DetailRow label="Actor">
          <Actor byId={byId} userId={entry.userId} />
          {entry.userId && (
            <span className="mt-1 block break-all font-mono text-xs text-gray-500">
              {entry.userId}
            </span>
          )}
        </DetailRow>

        <DetailRow label="Entity">
          {entry.entity ?? NONE}
          {entry.entityId && (
            <span className="mt-1 block break-all font-mono text-xs text-gray-500">
              {entry.entityId}
            </span>
          )}
        </DetailRow>

        <DetailRow label="IP address">{entry.ipAddress ?? NONE}</DetailRow>

        <DetailRow label="Entry ID">
          <span className="break-all font-mono text-xs">{entry.id}</span>
        </DetailRow>

        <div className="sm:col-span-2">
          <DetailRow label="Browser / device">
            {entry.userAgent ? (
              <span className="break-all text-xs">{entry.userAgent}</span>
            ) : (
              NONE
            )}
          </DetailRow>
        </div>

        <div className="sm:col-span-2">
          <DetailRow label="Details">
            {!details && NONE}

            {details?.kind === "object" &&
              (details.entries.length > 0 ? (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {details.entries.map(({ key, value }) => (
                    <li
                      className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr]"
                      key={key}
                    >
                      <span className="text-xs font-medium text-gray-500">
                        {key}
                      </span>
                      <span className="break-words font-mono text-xs">
                        {value}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                NONE
              ))}

            {details?.kind === "text" && (
              <span className="whitespace-pre-wrap break-words font-mono text-xs">
                {details.text}
              </span>
            )}
          </DetailRow>
        </div>
      </dl>
    </Modal>
  );
}

// Read-only list of recorded activity. There are no create, edit or delete
// actions on this page.
export default function AuditLogs() {
  const { hasPermission } = usePermissions();
  const users = useUserLookup(hasPermission("users.manage"));

  // Free-text filters are typed into `draft` and applied (debounced) to the
  // list; selects and dates apply immediately.
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);

  const list = useResourceList(
    (params) =>
      validateDateRange(params)
        ? Promise.resolve(EMPTY_PAGE)
        : getAuditLogs(params),
    { initialFilters: EMPTY_FILTERS },
  );

  const filters = list.filters;
  const setFilters = list.setFilters;

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => {
        const next = {
          ...current,
          action: draft.action.trim(),
          entity: draft.entity.trim(),
          entityId: draft.entityId.trim(),
        };

        // Without a user list, the actor is typed as an id; only a complete,
        // valid id (or empty) is applied.
        if (!users.available && (draft.userId === "" || isUuid(draft.userId))) {
          next.userId = draft.userId.trim();
        }

        return KEYS_TO_COMPARE.every((key) => next[key] === current[key])
          ? current
          : next;
      });
    }, 350);

    return () => clearTimeout(timer);
  }, [draft, setFilters, users.available]);

  const dateError = validateDateRange(filters);
  const userIdError =
    !users.available && draft.userId && !isUuid(draft.userId.trim())
      ? "Enter a complete user ID (UUID)."
      : undefined;

  function setDraftValue(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetAll() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  }

  const hasActiveFilters = Object.values(draft).some((v) => v !== "") ||
    Object.values(filters).some((v) => v !== "");

  const columns = [
    {
      key: "createdAt",
      label: "When (IST)",
      render: (entry) => (
        <span className="whitespace-nowrap text-gray-900">
          {formatIst(entry.createdAt)}
        </span>
      ),
    },
    {
      key: "action",
      label: "Action",
      render: (entry) => (
        <StatusBadge tone={actionTone(entry.action)}>
          {actionLabel(entry.action)}
        </StatusBadge>
      ),
    },
    {
      key: "actor",
      label: "Actor",
      hideBelow: "sm",
      render: (entry) => <Actor byId={users.byId} userId={entry.userId} />,
    },
    {
      key: "entity",
      label: "Entity",
      hideBelow: "md",
      render: (entry) => (
        <Entity entity={entry.entity} entityId={entry.entityId} />
      ),
    },
    {
      key: "ipAddress",
      label: "IP address",
      hideBelow: "lg",
      render: (entry) =>
        entry.ipAddress ? (
          <span className="font-mono text-xs text-gray-600">
            {entry.ipAddress}
          </span>
        ) : (
          NONE
        ),
    },
    {
      key: "view",
      label: <span className="sr-only">View</span>,
      className: "w-1",
      render: (entry) => (
        <button
          aria-label={`View audit entry: ${actionLabel(entry.action)}, ${formatIst(entry.createdAt)}`}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-[#1B3A1E] outline-none hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-[#1B3A1E]/40"
          onClick={() => setSelected(entry)}
          title="View details"
          type="button"
        >
          <Eye size={18} />
        </button>
      ),
    },
  ];

  const total = list.pagination.total;

  return (
    <div>
      <PageHeader
        description="A read-only record of recorded workspace activity, newest first."
        title="Audit Logs"
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onReset={resetAll}>
        {users.available || users.loading ? (
          <Select
            disabled={users.loading}
            id="audit-user-filter"
            label="Actor"
            onChange={(event) => setFilters((c) => ({ ...c, userId: event.target.value }))}
            value={filters.userId}
          >
            <option value="">{users.loading ? "Loading users…" : "All users"}</option>
            {users.items.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </Select>
        ) : (
          <Input
            error={userIdError}
            hint={userIdError ? undefined : "Exact user ID"}
            id="audit-user-id"
            label="Actor (user ID)"
            maxLength={36}
            onChange={(event) => setDraftValue("userId", event.target.value)}
            value={draft.userId}
          />
        )}

        <Input
          hint="Exact match, e.g. USER_CREATED"
          id="audit-action-filter"
          label="Action"
          list="audit-action-options"
          maxLength={100}
          onChange={(event) => setDraftValue("action", event.target.value)}
          value={draft.action}
        />
        <datalist id="audit-action-options">
          {KNOWN_ACTIONS.map((action) => (
            <option key={action} value={action} />
          ))}
        </datalist>

        <Input
          hint="Exact match, e.g. College"
          id="audit-entity-filter"
          label="Entity"
          list="audit-entity-options"
          maxLength={100}
          onChange={(event) => setDraftValue("entity", event.target.value)}
          value={draft.entity}
        />
        <datalist id="audit-entity-options">
          {KNOWN_ENTITIES.map((entity) => (
            <option key={entity} value={entity} />
          ))}
        </datalist>

        <Input
          id="audit-entity-id-filter"
          label="Entity ID"
          maxLength={100}
          onChange={(event) => setDraftValue("entityId", event.target.value)}
          value={draft.entityId}
        />

        <Input
          error={dateError || undefined}
          id="audit-from-date"
          label="From"
          onChange={(event) =>
            setFilters((c) => ({ ...c, fromDate: event.target.value }))
          }
          type="date"
          value={filters.fromDate}
        />

        <Input
          id="audit-to-date"
          label="To"
          onChange={(event) =>
            setFilters((c) => ({ ...c, toDate: event.target.value }))
          }
          type="date"
          value={filters.toDate}
        />
      </FilterBar>

      {dateError ? (
        <div
          className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600"
          role="alert"
        >
          Fix the date range to see audit entries.
        </div>
      ) : (
        <>
          <DataTable
            caption="Audit log"
            columns={columns}
            emptyAction={
              hasActiveFilters ? (
                <Button onClick={resetAll} variant="secondary">
                  Reset filters
                </Button>
              ) : undefined
            }
            emptyDescription={
              hasActiveFilters
                ? "Try different filters or a wider date range."
                : "Activity is recorded here as users and colleges are changed."
            }
            emptyTitle={
              hasActiveFilters
                ? "No entries match your filters"
                : "No audit entries yet"
            }
            error={list.error}
            loading={list.loading}
            onRetry={list.reload}
            rows={list.items}
          />

          {!list.error && total > 0 && (
            <div className="mt-4">
              <Pagination
                disabled={list.loading}
                limit={list.limit}
                onLimitChange={list.setLimit}
                onPageChange={list.setPage}
                page={list.page}
                total={total}
                totalPages={list.pagination.totalPages}
              />
            </div>
          )}

          <p className="mt-4 flex items-start gap-2 text-xs text-gray-500">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#1B3A1E]"
              size={14}
            />
            Only some actions are recorded today (user and college changes, and
            feedback unlocks). Filters match exactly.
          </p>
        </>
      )}

      {selected && (
        <EntryDialog
          byId={users.byId}
          entry={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

