import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { drivesApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge, { ActiveBadge } from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useColleges } from "../../hooks/useColleges.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import { formatDate } from "../../utils/format.js";
import DriveForm, { DRIVE_STATUS_OPTIONS } from "./DriveForm.jsx";
import DriveSetupPanel from "./DriveSetupPanel.jsx";

const fetchDrives = (params, signal) => drivesApi.list(params, signal);
const INITIAL = { search: "", collegeId: "", status: "", isActive: "" };
const STATUS_TONE = { DRAFT: "neutral", PUBLISHED: "success", CLOSED: "warn", CANCELLED: "danger" };
const STATUS_LABEL = Object.fromEntries(DRIVE_STATUS_OPTIONS.map((o) => [o.value, o.label]));

export default function DrivesPage() {
  const toast = useToast();
  const list = useListQuery(fetchDrives, INITIAL);
  const colleges = useColleges();
  const [panel, setPanel] = useState(null);
  const [setup, setSetup] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const filtered = Object.values(list.filters).some((value) => value !== "");

  const columns = [
    {
      key: "title",
      header: "Drive",
      render: (d) => (
        <>
          <strong>{d.title}</strong>
          <span className="sub">{d.college ? `${d.college.name}, ${d.college.city}` : "—"}</span>
        </>
      ),
    },
    { key: "status", header: "Stage", render: (d) => <StatusBadge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status] ?? d.status}</StatusBadge> },
    {
      key: "dates",
      header: "Dates (IST)",
      render: (d) => (d.startDate || d.endDate ? `${formatDate(d.startDate)} – ${formatDate(d.endDate)}` : "—"),
    },
    { key: "active", header: "Status", render: (d) => <ActiveBadge active={d.isActive} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (d) => (
        <div className="rowactions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSetup(d)}>
            Assessment setup
          </button>
          <ActionIcon icon={Pencil} label={`Edit ${d.title}`} onClick={() => setPanel({ drive: d })} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm({ kind: "toggle", drive: d })}>
            {d.isActive ? "Deactivate" : "Reactivate"}
          </button>
          <ActionIcon icon={Trash2} label={`Delete ${d.title}`} onClick={() => setConfirm({ kind: "delete", drive: d })} danger />
        </div>
      ),
    },
  ];

  async function runConfirmed() {
    const { kind, drive } = confirm;

    if (kind === "toggle") {
      await drivesApi.update(drive.id, { isActive: !drive.isActive });
      toast.success(drive.isActive ? "Drive deactivated" : "Drive reactivated");
    } else {
      await drivesApi.remove(drive.id);
      toast.success("Drive deleted");
    }

    setConfirm(null);
    list.reload();
  }

  return (
    <div>
      <PageHeader
        title="Drives"
        description="Recruitment drives held at partner colleges."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setPanel({ drive: null })}>
            <Plus size={16} aria-hidden="true" />
            Add drive
          </button>
        }
      />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search drives…" />
          <SelectFilter
            label="College"
            value={list.filters.collegeId}
            onChange={(v) => list.setFilter("collegeId", v)}
            options={colleges.items.map((c) => ({ value: c.id, label: c.name }))}
          />
          <SelectFilter label="Stage" value={list.filters.status} onChange={(v) => list.setFilter("status", v)} options={DRIVE_STATUS_OPTIONS} />
          <SelectFilter
            label="Status"
            value={list.filters.isActive}
            onChange={(v) => list.setFilter("isActive", v)}
            options={[
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
          />
        </FilterBar>

        <DataTable
          columns={columns}
          rows={list.items}
          phase={list.phase}
          error={list.error}
          onRetry={list.reload}
          caption="Drives"
          emptyTitle={filtered ? "No drives match these filters" : "No drives yet"}
          emptyText={filtered ? "Try different filters or clear them." : "Add a drive for a college to get started."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {setup ? <DriveSetupPanel drive={setup} onClose={() => setSetup(null)} onChanged={list.reload} /> : null}

      {panel ? (
        <DriveForm
          drive={panel.drive}
          colleges={colleges}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            toast.success(message);
            list.reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === "delete" ? "Delete drive?" : confirm?.drive.isActive ? "Deactivate drive?" : "Reactivate drive?"}
        message={
          confirm?.kind === "delete"
            ? `“${confirm?.drive.title}” will be removed from the system.`
            : confirm?.drive.isActive
              ? `“${confirm?.drive.title}” will be marked inactive.`
              : `“${confirm?.drive.title}” will become active again.`
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : confirm?.drive.isActive ? "Deactivate" : "Reactivate"}
        tone={confirm?.kind === "delete" || confirm?.drive.isActive ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
