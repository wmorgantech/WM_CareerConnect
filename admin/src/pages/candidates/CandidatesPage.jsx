import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { candidatesApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { ActiveBadge } from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useColleges } from "../../hooks/useColleges.js";
import { useListQuery } from "../../hooks/useListQuery.js";
import CandidateDetail from "./CandidateDetail.jsx";
import CandidateForm from "./CandidateForm.jsx";

const fetchCandidates = (params, signal) => candidatesApi.list(params, signal);
const INITIAL = { search: "", collegeId: "", isActive: "" };

export default function CandidatesPage() {
  const toast = useToast();
  const list = useListQuery(fetchCandidates, INITIAL);
  const colleges = useColleges();
  const [panel, setPanel] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const filtered = Object.values(list.filters).some((value) => value !== "");

  const columns = [
    {
      key: "name",
      header: "Candidate",
      render: (c) => (
        <>
          <button type="button" className="linkbtn" onClick={() => setPanel({ kind: "detail", candidate: c })}>
            {c.name}
          </button>
          <span className="sub">{c.email}</span>
        </>
      ),
    },
    { key: "phone", header: "Phone", render: (c) => c.phone || "—" },
    { key: "college", header: "College", render: (c) => (c.college ? c.college.name : "—") },
    { key: "status", header: "Status", render: (c) => <ActiveBadge active={c.isActive} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (c) => (
        <div className="rowactions">
          <ActionIcon icon={Pencil} label={`Edit ${c.name}`} onClick={() => setPanel({ kind: "form", candidate: c })} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm({ kind: "toggle", candidate: c })}>
            {c.isActive ? "Deactivate" : "Reactivate"}
          </button>
          <ActionIcon icon={Trash2} label={`Delete ${c.name}`} onClick={() => setConfirm({ kind: "delete", candidate: c })} danger />
        </div>
      ),
    },
  ];

  async function runConfirmed() {
    const { kind, candidate } = confirm;

    if (kind === "toggle") {
      await candidatesApi.update(candidate.id, { isActive: !candidate.isActive });
      toast.success(candidate.isActive ? "Candidate deactivated" : "Candidate reactivated");
    } else {
      await candidatesApi.remove(candidate.id);
      toast.success("Candidate deleted");
    }

    setConfirm(null);
    list.reload();
  }

  const active = confirm?.candidate.isActive;

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="Contact records for people in the recruitment pipeline. Students who register for a drive, sit the assessment and are shortlisted are managed on the Students page; interviews are scheduled on the Interviews page and can be linked to a shortlisted application."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => setPanel({ kind: "form", candidate: null })}>
            <Plus size={16} aria-hidden="true" />
            Add candidate
          </button>
        }
      />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search name, email or phone…" />
          <SelectFilter
            label="College"
            value={list.filters.collegeId}
            onChange={(v) => list.setFilter("collegeId", v)}
            options={colleges.items.map((c) => ({ value: c.id, label: c.name }))}
          />
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
          caption="Candidates"
          emptyTitle={filtered ? "No candidates match these filters" : "No candidates yet"}
          emptyText={filtered ? "Try different filters or clear them." : "Add the first candidate to get started."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {panel?.kind === "form" ? (
        <CandidateForm
          candidate={panel.candidate}
          colleges={colleges}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            toast.success(message);
            list.reload();
          }}
        />
      ) : null}

      {panel?.kind === "detail" ? (
        <CandidateDetail
          candidate={panel.candidate}
          onClose={() => setPanel(null)}
          onEdit={() => setPanel({ kind: "form", candidate: panel.candidate })}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === "delete" ? "Delete candidate?" : active ? "Deactivate candidate?" : "Reactivate candidate?"}
        message={
          confirm?.kind === "delete"
            ? `${confirm?.candidate.name} will be removed from the system.`
            : active
              ? `${confirm?.candidate.name} will be marked inactive and can't be scheduled for interviews.`
              : `${confirm?.candidate.name} will become active again.`
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : active ? "Deactivate" : "Reactivate"}
        tone={confirm?.kind === "delete" || active ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
