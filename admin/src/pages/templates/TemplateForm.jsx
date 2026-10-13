import { templatesApi } from "../../api/modules.api.js";
import { ClipboardList, Gauge, ListChecks } from "lucide-react";
import { CheckboxField, IconText, SelectField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { TEST_LEVELS, TOPICS, ruleFor } from "../../utils/assessment.js";

const PROPOSED_UG = { oop: [10, 1], html: [10, 1], css: [10, 1], javascript: [15, 2] };
const PROPOSED_PG = { oop: [15, 1], html: [15, 1], css: [15, 1], javascript: [30, 1] };

function rowsFrom(template) {
  return TOPICS.map((t) => {
    const s = template?.sections.find((x) => x.key === t.value);

    return { key: t.value, count: s ? String(s.questionCount) : "0", marks: s ? String(s.marksPerQuestion) : "1" };
  });
}

function totalsOf(rows) {
  const questions = rows.reduce((n, r) => n + (Number(r.count) || 0), 0);
  const marks = rows.reduce((n, r) => n + (Number(r.count) || 0) * (Number(r.marks) || 0), 0);

  return { questions, marks };
}

export default function TemplateForm({ template, onClose, onSaved }) {
  const editing = Boolean(template);

  const form = useForm({
    initialValues: {
      name: template?.name ?? "",
      level: template?.level ?? "UG",
      durationMinutes: String(ruleFor(template?.level ?? "UG").minutes),
      negativeMarking: String(template?.negativeMarking ?? 0),
      easyPct: String(template?.easyPct ?? 60),
      mediumPct: String(template?.mediumPct ?? 40),
      hardPct: String(template?.hardPct ?? 0),
      isActive: template?.isActive ?? true,
      rows: rowsFrom(template),
    },
    validate(values) {
      const errors = {};
      const minutes = Number(values.durationMinutes);
      const pct = [values.easyPct, values.mediumPct, values.hardPct].map(Number);
      const rule = ruleFor(values.level);
      const totals = totalsOf(values.rows);

      if (values.name.trim().length < 2) errors.name = "Enter a name (at least 2 characters).";
      if (minutes !== rule.minutes) errors.durationMinutes = `${values.level} assessments are fixed at ${rule.minutes} minutes.`;
      if (!(Number(values.negativeMarking) >= 0)) errors.negativeMarking = "Cannot be negative.";
      if (pct.some((n) => !Number.isInteger(n) || n < 0) || pct.reduce((a, b) => a + b, 0) !== 100) errors.difficulty = "Easy, medium and hard percentages must be whole numbers that total 100.";
      if (totals.questions !== rule.questions) errors.sections = `${values.level} must have exactly ${rule.questions} questions (currently ${totals.questions}).`;
      else if (rule.marks !== null && totals.marks !== rule.marks) errors.sections = `${values.level} must total exactly ${rule.marks} marks (currently ${totals.marks}).`;
      else if (!Number.isInteger(totals.marks) || totals.marks <= 0) errors.sections = "Section marks must add up to a whole number.";

      values.rows.forEach((r, i) => {
        if (Number(r.count) > 0 && !(Number(r.marks) > 0)) errors[`sections.${i}.marksPerQuestion`] = "Marks per question must be above 0.";
      });

      return errors;
    },
    async onSubmit(values) {
      const body = {
        name: values.name.trim(),
        level: values.level,
        durationMinutes: Number(values.durationMinutes),
        negativeMarking: Number(values.negativeMarking),
        easyPct: Number(values.easyPct),
        mediumPct: Number(values.mediumPct),
        hardPct: Number(values.hardPct),
        isActive: values.isActive,
        sections: values.rows
          .filter((r) => Number(r.count) > 0)
          .map((r) => ({ key: r.key, questionCount: Number(r.count), marksPerQuestion: Number(r.marks) })),
      };

      if (editing) {
        await templatesApi.update(template.id, body);
        onSaved("Template updated");
      } else {
        await templatesApi.create(body);
        onSaved("Template created");
      }
    },
  });

  const { values, setValue, errors } = form;
  const totals = totalsOf(values.rows);
  const rule = ruleFor(values.level);
  const ruleText = rule.marks !== null ? `${rule.questions} questions · ${rule.marks} marks · ${rule.minutes} minutes` : `${rule.questions} questions · ${rule.minutes} minutes · total marks set by you`;

  // The duration follows the level; it is shown but cannot be edited.
  function setLevel(name, value) {
    setValue(name, value);
    setValue("durationMinutes", String(ruleFor(value).minutes));
  }

  function setRow(index, field, value) {
    setValue("rows", values.rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function loadProposal() {
    const proposal = values.level === "UG" ? PROPOSED_UG : PROPOSED_PG;

    setValue("rows", TOPICS.map((t) => ({ key: t.value, count: String(proposal[t.value][0]), marks: String(proposal[t.value][1]) })));
  }

  return (
    <FormPanel title={editing ? "Edit template" : "New test template"} subtitle={editing ? template.name : undefined} form={form} onClose={onClose} submitLabel={editing ? "Save changes" : "Create template"}>
      <TextField label="Name" name="name" icon={ClipboardList} value={values.name} onChange={setValue} error={errors.name} required maxLength={100} />

      <div className="grid2">
        <SelectField label="Level" name="level" value={values.level} onChange={setLevel} options={TEST_LEVELS} hint={`Required: ${ruleText}.`} />
        <TextField label="Duration (minutes)" name="durationMinutes" value={values.durationMinutes} onChange={setValue} error={errors.durationMinutes} type="number" readOnly hint={`Fixed by level: UG 60 minutes, PG 75 minutes.`} />
      </div>

      <fieldset className="field">
        <legend><IconText icon={ListChecks}>Questions and marks by topic</IconText></legend>
        {values.rows.map((r, i) => (
          <div className="grid2" key={r.key}>
            <TextField label={`${TOPICS[i].label}: questions`} name={`count-${r.key}`} value={r.count} onChange={(_, v) => setRow(i, "count", v)} type="number" min={0} max={200} />
            <TextField label="Marks per question" name={`marks-${r.key}`} value={r.marks} onChange={(_, v) => setRow(i, "marks", v)} error={errors[`sections.${i}.marksPerQuestion`]} type="number" min={0} step="0.5" />
          </div>
        ))}
        <p className={errors.sections ? "field__error" : "field__hint"}>
          {errors.sections ?? `Total: ${totals.questions} questions · ${totals.marks} marks.`}
        </p>
        <button type="button" className="btn btn--ghost btn--sm" onClick={loadProposal}>
          Fill with the proposed {values.level} split (not yet approved)
        </button>
      </fieldset>

      <fieldset className="field">
        <legend><IconText icon={Gauge}>Difficulty mix (%)</IconText></legend>
        <div className="grid2">
          <TextField label="Easy" name="easyPct" value={values.easyPct} onChange={setValue} type="number" min={0} max={100} />
          <TextField label="Medium" name="mediumPct" value={values.mediumPct} onChange={setValue} type="number" min={0} max={100} />
          <TextField label="Hard" name="hardPct" value={values.hardPct} onChange={setValue} type="number" min={0} max={100} />
        </div>
        {errors.difficulty ? <p className="field__error">{errors.difficulty}</p> : <p className="field__hint">Must total 100. Use 0 for hard while the bank has only easy and medium questions.</p>}
      </fieldset>

      <TextField label="Marks deducted per wrong answer" name="negativeMarking" value={values.negativeMarking} onChange={setValue} error={errors.negativeMarking} type="number" min={0} step="0.25" hint="0 means no negative marking. A student's total never goes below 0." />
      <CheckboxField label="Active" name="isActive" checked={values.isActive} onChange={setValue} />
    </FormPanel>
  );
}
