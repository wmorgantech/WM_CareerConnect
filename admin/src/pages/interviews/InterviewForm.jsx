import { interviewsApi } from "../../api/modules.api.js";
import { UserRound } from "lucide-react";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { IconText, SelectField, TextAreaField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { getErrorMessage } from "../../utils/errors.js";
import { CANNOT_CLEAR } from "../../utils/forms.js";
import { fromIstDateTimeInput, isHttpUrl, toIstDateTimeInput } from "../../utils/format.js";
import ApplicationLinkField from "./ApplicationLinkField.jsx";
import CandidatePicker from "./CandidatePicker.jsx";
import { INTERVIEW_STATUS_OPTIONS } from "./interviewMeta.js";

export default function InterviewForm({ interview, interviewers, onClose, onSaved }) {
  const editing = Boolean(interview);

  const form = useForm({
    initialValues: {
      candidate: interview ? { id: interview.candidateId, name: interview.candidate.name, email: interview.candidate.email } : null,
      applicationId: "",
      interviewerId: interview?.interviewerId ?? "",
      scheduledAt: toIstDateTimeInput(interview?.scheduledAt),

      durationMinutes: String(interview?.durationMinutes ?? 30),
      meetingLink: interview?.meetingLink ?? "",
      notes: interview?.notes ?? "",
      status: interview?.status ?? "SCHEDULED",
    },
    validate(values) {
      const errors = {};
      const when = fromIstDateTimeInput(values.scheduledAt);
      const minutes = Number(values.durationMinutes);
      const link = values.meetingLink.trim();

      if (!editing && !values.candidate) errors.candidate = "Choose a candidate.";
      if (!values.interviewerId) errors.interviewerId = "Choose an interviewer.";

      if (!when) errors.scheduledAt = "Enter the date and time (IST).";
      else if (!editing && new Date(when).getTime() <= Date.now()) errors.scheduledAt = "The interview must be in the future.";

      if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) errors.durationMinutes = "Duration must be 15 to 480 minutes.";

      if (link && !isHttpUrl(link)) errors.meetingLink = "Enter a link starting with http:// or https://.";
      else if (link.length > 1000) errors.meetingLink = "Link must not exceed 1000 characters.";
      else if (editing && interview.meetingLink && !link) errors.meetingLink = CANNOT_CLEAR;

      if (values.notes.length > 2000) errors.notes = "Notes must not exceed 2000 characters.";

      return errors;
    },
    async onSubmit(values) {
      const scheduledAt = fromIstDateTimeInput(values.scheduledAt);
      const durationMinutes = Number(values.durationMinutes);
      const link = values.meetingLink.trim();

      if (editing) {
        const body = {};

        if (values.interviewerId !== interview.interviewerId) body.interviewerId = values.interviewerId;
        if (values.scheduledAt !== toIstDateTimeInput(interview.scheduledAt)) body.scheduledAt = scheduledAt;
        if (durationMinutes !== interview.durationMinutes) body.durationMinutes = durationMinutes;
        if (link && link !== (interview.meetingLink ?? "")) body.meetingLink = link;
        if (values.notes.trim() !== (interview.notes ?? "")) body.notes = values.notes.trim();
        if (values.status !== interview.status) body.status = values.status;

        if (Object.keys(body).length > 0) {
          await interviewsApi.update(interview.id, body);
        }

        onSaved("Interview updated");
      } else {
        await interviewsApi.create({
          candidateId: values.candidate.id,
          interviewerId: values.interviewerId,
          scheduledAt,
          durationMinutes,
          ...(values.applicationId ? { applicationId: values.applicationId } : {}),
          ...(link ? { meetingLink: link } : {}),
          ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        });
        onSaved("Interview scheduled");
      }
    },
  });

  const { values, setValue, errors } = form;
  const options = interviewers.items.map((i) => ({ value: i.id, label: `${i.name} (${i.email})` }));

  if (editing && !options.some((o) => o.value === interview.interviewerId)) {
    options.unshift({ value: interview.interviewerId, label: "Current interviewer (no longer eligible)" });
  }

  return (
    <FormPanel
      title={editing ? "Edit interview" : "Schedule interview"}
      subtitle={editing ? interview.candidate.name : undefined}
      form={form}
      onClose={onClose}
      submitLabel={editing ? "Save changes" : "Schedule"}
    >
      {editing ? (
        <div className="field">
          <span className="field__label"><IconText icon={UserRound}>Candidate</IconText></span>
          <div className="picked">
            <span>
              <strong>{interview.candidate.name}</strong>
              <span className="sub">{interview.candidate.email}</span>
            </span>
          </div>
        </div>
      ) : (
        <>
          <CandidatePicker
            value={values.candidate}
            onChange={(candidate) => {
              setValue("candidate", candidate);
              setValue("applicationId", "");
            }}
            error={errors.candidate}
          />
          {values.candidate ? <ApplicationLinkField candidateId={values.candidate.id} value={values.applicationId} onChange={(v) => setValue("applicationId", v)} /> : null}
        </>
      )}

      {interviewers.phase === "error" ? (
        <ErrorState title="Couldn't load interviewers" message={getErrorMessage(interviewers.error)} onRetry={interviewers.retry} />
      ) : (
        <SelectField
          label="Interviewer"
          name="interviewerId"
          value={values.interviewerId}
          onChange={setValue}
          options={options}
          error={errors.interviewerId}
          required
          placeholder={interviewers.phase === "loading" ? "Loading interviewers…" : "Choose an interviewer"}
          disabled={interviewers.phase === "loading"}
        />
      )}

      <TextField label="Date and time (IST)" name="scheduledAt" value={values.scheduledAt} onChange={setValue} error={errors.scheduledAt} required type="datetime-local" />
      <TextField label="Duration (minutes)" name="durationMinutes" value={values.durationMinutes} onChange={setValue} error={errors.durationMinutes} required type="number" min={15} max={480} step={5} />
      <TextField label="Meeting link" name="meetingLink" value={values.meetingLink} onChange={setValue} error={errors.meetingLink} type="url" placeholder="https://" maxLength={1000} />
      <TextAreaField label="Notes" name="notes" value={values.notes} onChange={setValue} error={errors.notes} maxLength={2000} />

      {editing ? (
        <SelectField label="Status" name="status" value={values.status} onChange={setValue} options={INTERVIEW_STATUS_OPTIONS} error={errors.status} hint="Feedback can be submitted only after an interview is marked Completed." />
      ) : null}
    </FormPanel>
  );
}
