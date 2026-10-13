import { useEffect, useState } from "react";
import { Eye, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { questionsApi } from "../../api/modules.api.js";
import ActionIcon from "../../components/ui/ActionIcon.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/ui/Filters.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import StatusBadge, { ActiveBadge } from "../../components/ui/StatusBadge.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useListQuery } from "../../hooks/useListQuery.js";
import { DIFFICULTIES, QUESTION_LEVELS, TOPICS, difficultyLabel, levelLabel, topicLabel } from "../../utils/assessment.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import ImportPanel from "./ImportPanel.jsx";
import QuestionForm from "./QuestionForm.jsx";

const fetchQuestions = (params, signal) => questionsApi.list(params, signal);
const INITIAL = { search: "", level: "", section: "", difficulty: "", isActive: "" };

function Coverage({ reloadKey }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    questionsApi
      .summary(controller.signal)
      .then(setSummary)
      .catch((e) => !isAbortError(e) && setError(e));

    return () => controller.abort();
  }, [reloadKey]);

  if (error) return <p className="panel__note">Couldn't load bank coverage: {getErrorMessage(error)}</p>;
  if (!summary) return null;

  const count = (level, topic) => summary[level]?.[topic]?.total ?? 0;

  return (
    <section className="panel" aria-label="Bank coverage">
      <table className="table">
        <caption className="sr-only">Active questions by topic and level</caption>
        <thead>
          <tr>
            <th scope="col">Topic</th>
            <th scope="col" className="is-right">UG only</th>
            <th scope="col" className="is-right">PG only</th>
            <th scope="col" className="is-right">UG and PG</th>
          </tr>
        </thead>
        <tbody>
          {TOPICS.map((t) => (
            <tr key={t.value}>
              <td data-label="Topic">{t.label}</td>
              <td data-label="UG only" className="is-right">{count("UG", t.value)}</td>
              <td data-label="PG only" className="is-right">{count("PG", t.value)}</td>
              <td data-label="UG and PG" className="is-right">{count("BOTH", t.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel__foot">Active questions. A UG paper draws from UG and “UG and PG” questions; a PG paper from PG and “UG and PG”.</p>
    </section>
  );
}

export default function QuestionsPage() {
  const toast = useToast();
  const list = useListQuery(fetchQuestions, INITIAL);
  const [panel, setPanel] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [coverageKey, setCoverageKey] = useState(0);
  const [importing, setImporting] = useState(false);

  const filtered = Object.values(list.filters).some((value) => value !== "");

  const columns = [
    {
      key: "text",
      header: "Question",
      render: (q) => (
        <>
          <strong>{q.text.length > 110 ? `${q.text.slice(0, 110)}…` : q.text}</strong>
          <span className="sub">
            {topicLabel(q.section)}
            {q.topic ? ` · ${q.topic}` : ""}
            {q.codeSnippet ? " · has code" : ""}
          </span>
        </>
      ),
    },
    { key: "level", header: "Level", render: (q) => levelLabel(q.level) },
    { key: "difficulty", header: "Difficulty", render: (q) => difficultyLabel(q.difficulty) },
    {
      key: "status",
      header: "Status",
      render: (q) => (
        <>
          <ActiveBadge active={q.isActive} /> {q.usedInAttempts ? <StatusBadge tone="info">Used</StatusBadge> : null}
        </>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (q) => (
        <div className="rowactions">
          <ActionIcon
            icon={q.usedInAttempts ? Eye : Pencil}
            label={`${q.usedInAttempts ? "View" : "Edit"} question`}
            onClick={() => setPanel({ question: q })}
          />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm({ kind: "toggle", question: q })}>
            {q.isActive ? "Deactivate" : "Activate"}
          </button>
          <ActionIcon
            icon={Trash2}
            label="Delete question"
            onClick={() => setConfirm({ kind: "delete", question: q })}
            disabled={q.usedInAttempts}
            title={q.usedInAttempts ? "Used in an assessment: deactivate it instead" : undefined}
            danger
          />
        </div>
      ),
    },
  ];

  async function runConfirmed() {
    const { kind, question } = confirm;

    if (kind === "toggle") {
      await questionsApi.setStatus(question.id, !question.isActive);
      toast.success(question.isActive ? "Question deactivated" : "Question activated");
    } else {
      await questionsApi.remove(question.id);
      toast.success("Question deleted");
    }

    setConfirm(null);
    setCoverageKey((k) => k + 1);
    list.reload();
  }

  return (
    <div>
      <PageHeader
        title="Question bank"
        description="Single-answer multiple-choice questions for OOPs, HTML, CSS and JavaScript. Each has four different options and one correct answer."
        actions={
          <>
            <button type="button" className="btn btn--outline" onClick={() => setImporting(true)}>
              <Upload size={15} aria-hidden="true" />
              Import CSV
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setPanel({ question: null })}>
              <Plus size={16} aria-hidden="true" />
              Add question
            </button>
          </>
        }
      />

      <Coverage reloadKey={coverageKey} />

      <section className="panel">
        <FilterBar onReset={list.resetFilters} canReset={filtered}>
          <SearchFilter value={list.filters.search} onChange={(v) => list.setFilter("search", v)} placeholder="Search question text…" />
          <SelectFilter label="Level" value={list.filters.level} onChange={(v) => list.setFilter("level", v)} options={QUESTION_LEVELS} />
          <SelectFilter label="Topic area" value={list.filters.section} onChange={(v) => list.setFilter("section", v)} options={TOPICS} />
          <SelectFilter label="Difficulty" value={list.filters.difficulty} onChange={(v) => list.setFilter("difficulty", v)} options={DIFFICULTIES} />
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
          caption="Questions"
          emptyTitle={filtered ? "No questions match these filters" : "The question bank is empty"}
          emptyText={filtered ? "Try different filters or clear them." : "Add the reviewed questions to get started."}
        />

        <Pagination pagination={list.pagination} page={list.page} onPage={list.setPage} disabled={list.phase === "loading"} />
      </section>

      {importing ? (
        <ImportPanel
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            setCoverageKey((k) => k + 1);
            list.reload();
          }}
        />
      ) : null}

      {panel ? (
        <QuestionForm
          question={panel.question}
          onClose={() => setPanel(null)}
          onSaved={(message) => {
            setPanel(null);
            toast.success(message);
            setCoverageKey((k) => k + 1);
            list.reload();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === "delete" ? "Delete question?" : confirm?.question.isActive ? "Deactivate question?" : "Activate question?"}
        message={
          confirm?.kind === "delete"
            ? "The question will be removed from the bank. This is only possible while no assessment has used it."
            : confirm?.question.isActive
              ? "It will no longer be picked for new assessments. Assessments already started keep their paper."
              : "It can be picked for new assessments again."
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete" : confirm?.question.isActive ? "Deactivate" : "Activate"}
        tone={confirm?.kind === "delete" || confirm?.question.isActive ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
      />
    </div>
  );
}
