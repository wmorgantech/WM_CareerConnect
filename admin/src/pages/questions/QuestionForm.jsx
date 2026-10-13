import { questionsApi } from "../../api/modules.api.js";
import { ListChecks } from "lucide-react";
import { CheckboxField, IconText, SelectField, TextAreaField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { DIFFICULTIES, QUESTION_LEVELS, TOPICS } from "../../utils/assessment.js";

const LETTERS = ["A", "B", "C", "D"];

export default function QuestionForm({ question, onClose, onSaved }) {
  const editing = Boolean(question);
  const locked = Boolean(question?.usedInAttempts);

  const form = useForm({
    initialValues: {
      level: question?.level ?? "BOTH",
      section: question?.section ?? "oop",
      difficulty: question?.difficulty ?? "EASY",
      topic: question?.topic ?? "",
      text: question?.text ?? "",
      codeSnippet: question?.codeSnippet ?? "",
      explanation: question?.explanation ?? "",
      options: question ? question.options.map((o) => o.text) : ["", "", "", ""],
      correctIndex: question ? question.correctIndex : -1,
      isActive: question?.isActive ?? true,
    },
    validate(values) {
      const errors = {};

      if (!values.text.trim()) errors.text = "Enter the question.";
      else if (values.text.length > 2000) errors.text = "The question must not exceed 2000 characters.";

      const seen = new Set();

      values.options.forEach((option, index) => {
        const key = option.trim().replace(/\s+/g, " ").toLowerCase();

        if (!key) errors[`options.${index}`] = "Enter this option.";
        else if (seen.has(key)) errors[`options.${index}`] = "Options must all be different.";
        else if (option.length > 500) errors[`options.${index}`] = "Must not exceed 500 characters.";

        seen.add(key);
      });

      if (values.correctIndex < 0 || values.correctIndex > 3) errors.correctIndex = "Choose the one correct option.";

      return errors;
    },
    async onSubmit(values) {
      const body = {
        level: values.level,
        section: values.section,
        difficulty: values.difficulty,
        topic: values.topic.trim() || null,
        codeSnippet: values.codeSnippet.trim() || null,
        explanation: values.explanation.trim() || null,
        isActive: values.isActive,
        ...(locked
          ? {}
          : { text: values.text.trim(), options: values.options.map((o) => o.trim()), correctIndex: values.correctIndex }),
      };

      if (editing) {
        await questionsApi.update(question.id, body);
        onSaved("Question updated");
      } else {
        await questionsApi.create({ ...body, topic: body.topic ?? undefined, codeSnippet: body.codeSnippet ?? undefined, explanation: body.explanation ?? undefined });
        onSaved("Question added");
      }
    },
  });

  const { values, setValue, errors } = form;

  function setOption(index, text) {
    setValue("options", values.options.map((o, i) => (i === index ? text : o)));
  }

  return (
    <FormPanel title={editing ? "Edit question" : "Add question"} subtitle={editing ? `${question.section.toUpperCase()} · ${question.difficulty.toLowerCase()}` : undefined} form={form} onClose={onClose} submitLabel={editing ? "Save changes" : "Add question"}>
      {locked ? (
        <p className="notice notice--warn" role="status">
          <span>
            This question has been used in an assessment, so its wording, options and correct answer are locked. To change them, deactivate it and add a new
            question.
          </span>
        </p>
      ) : null}

      <div className="grid2">
        <SelectField label="Level" name="level" value={values.level} onChange={setValue} options={QUESTION_LEVELS} error={errors.level} />
        <SelectField label="Topic area" name="section" value={values.section} onChange={setValue} options={TOPICS} error={errors.section} />
      </div>

      <div className="grid2">
        <SelectField label="Difficulty" name="difficulty" value={values.difficulty} onChange={setValue} options={DIFFICULTIES} error={errors.difficulty} hint="The event bank uses easy and medium questions." />
        <TextField label="Sub-topic (optional)" name="topic" value={values.topic} onChange={setValue} error={errors.topic} maxLength={100} />
      </div>

      <TextAreaField label="Question" name="text" value={values.text} onChange={setValue} error={errors.text} required rows={3} maxLength={2000} disabled={locked} />
      <TextAreaField label="Code snippet (optional)" name="codeSnippet" value={values.codeSnippet} onChange={setValue} error={errors.codeSnippet} rows={4} maxLength={4000} disabled={locked} hint="Shown in a code block, for output-prediction questions." spellCheck={false} />

      <fieldset className="field" disabled={locked}>
        <legend><IconText icon={ListChecks}>Options — choose the correct one</IconText></legend>
        {values.options.map((option, index) => (
          <div className="optionrow" key={LETTERS[index]}>
            <input type="radio" name="correct" checked={values.correctIndex === index} onChange={() => setValue("correctIndex", index)} aria-label={`Option ${LETTERS[index]} is correct`} />
            <TextField label={`Option ${LETTERS[index]}`} name={`option-${index}`} value={option} onChange={(_, text) => setOption(index, text)} error={errors[`options.${index}`]} maxLength={500} />
          </div>
        ))}
        {errors.correctIndex ? <p className="field__error">{errors.correctIndex}</p> : null}
      </fieldset>

      <TextAreaField label="Explanation (staff only)" name="explanation" value={values.explanation} onChange={setValue} error={errors.explanation} rows={2} maxLength={2000} hint="Never shown to students." />
      <CheckboxField label="Active" name="isActive" checked={values.isActive} onChange={setValue} hint="Only active questions can be picked for an assessment." />
    </FormPanel>
  );
}
