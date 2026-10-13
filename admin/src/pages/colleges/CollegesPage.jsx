import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { collegesApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter, TextFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { ActiveBadge } from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useListQuery } from "../../hooks/useListQuery.js";
import CollegeForm from "./CollegeForm.jsx";

const fetchColleges = (params, signal) => collegesApi.list(params, signal);
const INITIAL = { search: "", city: "", isActive: "" };

export default function CollegesPage() {
  const toast = useToast();
  const list = useListQuery(fetchColleges, INITIAL);
  const [panel, setPanel] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const filtered = Object.values(list.filters).some((value) => value !== "");

  const columns = [
    {
      key: "name",
      header: "College",
      render: (c) => (
        <>
          <strong>{c.name}</strong>
          <span className="sub">{c.city}</span>
        </>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (c) =>
        c.contactPerson || c.phone || c.email ? (
          <>
            {c.contactPerson ? <span>{c.contactPerson}</span> : null}
            {c.phone ? <span className="sub">{c.phone}</span> : null}
            {c.email ? <span className="sub">{c.email}</span> : null}
          </>
        ) : (
          "—"
        ),
    },
    { key: "status", header: "Status", render: (c) => <ActiveBadge active={c.isActive} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <div className="rowactions">
          <ActionIcon icon={Pencil} label={`Edit ${c.name}`} onClick={() => setPanel({ college: c })} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm({ kind: "toggle", college: c })}>
            {c.isActive ? "Deactivate" : "Reactivate"}
          </button>
          <ActionIcon icon={Trash2} label={`Delete ${c.name}`} onClick={() => setConfirm({ kind: "delete", college: c })} danger />
        </div>
      ),
    },
  ];

  async function runConfirmed() {
    const { kind, college } = confirm;

    if (kind === "toggle") {
      await collegesApi.update(college.id, { isActive: !college.isActive });
      toast.success(college.isActive ? "College deactivated" : "College reactivated");
    } else {
      await collegesApi.remove(college.id);
      toast.success("College deleted");
    }

    setConfirm(null);
    list.reload();
  }

  return (
    <div>
      <PageHeader
        title="Colleges"
        description="Partner colleges that recruitment drives and candidates belong to."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setPanel({ college: null })}>
            <Plus size={16} aria-hidden="true" />
            Add college
          </button>
        }
      />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name, city, contact…" />
          <TextFilter label="City" value={list.filters.city} onChange={(v) => list.setFilter("city", v)} />
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
          caption="Colleges"
          emptyTitle={filtered ? "No colleges match these filters" : "No colleges yet"}
          emptyText={filtered ? "Try different filters or clear them." : "Add the first college to get started."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {panel ? (
        <CollegeForm
          college={panel.college}
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
        title={confirm?.kind === "delete" ? "Delete college?" : confirm?.college.isActive ? "Deactivate college?" : "Reactivate college?"}
        message={
          confirm?.kind === "delete"
            ? `“${confirm?.college.name}” will be removed from the system.`
            : confirm?.college.isActive
              ? `“${confirm?.college.name}” will be marked inactive and can't be chosen for new drives or candidates.`
              : `“${confirm?.college.name}” will become active again.`
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : confirm?.college.isActive ? "Deactivate" : "Reactivate"}
        tone={confirm?.kind === "delete" || confirm?.college.isActive ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
