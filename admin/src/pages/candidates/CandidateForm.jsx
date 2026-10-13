import { candidatesApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { CheckboxField, SelectField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { getErrorMessage } from "../../utils/errors.js";
import { CANNOT_CLEAR, EMAIL_PATTERN, changedPayload, clearedKeys, compactPayload } from "../../utils/forms.js";
import { isHttpUrl } from "../../utils/format.js";

const TEXT_KEYS = ["name", "email", "phone", "resumeUrl"];

export default function CandidateForm({ candidate, colleges, onClose, onSaved }) {
  const editing = Boolean(candidate);

  const form = useForm({
    initialValues: {
      name: candidate?.name ?? "",
      email: candidate?.email ?? "",
      phone: candidate?.phone ?? "",
      collegeId: candidate?.collegeId ?? "",
      resumeUrl: candidate?.resumeUrl ?? "",
      isActive: candidate?.isActive ?? true,
    },
    validate(values) {
      const errors = {};
      const name = values.name.trim();
      const phone = values.phone.trim();
      const resumeUrl = values.resumeUrl.trim();

      if (name.length < 2) errors.name = "Enter the name (at least 2 characters).";
      else if (name.length > 150) errors.name = "Name must not exceed 150 characters.";

      if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address.";

      if (phone && (phone.length < 7 || phone.length > 20)) errors.phone = "Phone must be 7 to 20 characters.";

if (resumeUrl && !isHttpUrl(resumeUrl)) errors.resumeUrl = "Enter a link starting with http:// or https://.";
      else if (resumeUrl.length > 1000) errors.resumeUrl = "Link must not exceed 1000 characters.";

      if (editing) {
        clearedKeys(candidate, values, TEXT_KEYS).forEach((key) => {
          errors[key] = errors[key] ?? CANNOT_CLEAR;
        });

        if (candidate.collegeId && !values.collegeId) errors.collegeId = CANNOT_CLEAR;
      }

      return errors;
    },
    async onSubmit(values) {
      if (editing) {
        const body = changedPayload(candidate, values, TEXT_KEYS);

        if (values.collegeId && values.collegeId !== (candidate.collegeId ?? "")) body.collegeId = values.collegeId;
        if (values.isActive !== candidate.isActive) body.isActive = values.isActive;

        if (Object.keys(body).length > 0) {
          await candidatesApi.update(candidate.id, body);
        }

        onSaved("Candidate updated");
      } else {
        await candidatesApi.create({
          ...compactPayload(values, [...TEXT_KEYS, "collegeId"]),
          isActive: values.isActive,
        });
        onSaved("Candidate added");
      }
    },
  });

  const { values, setValue, errors } = form;
  const options = colleges.items.map((c) => ({ value: c.id, label: `${c.name} — ${c.city}` }));

  if (candidate?.college && !options.some((o) => o.value === candidate.collegeId)) {
    options.unshift({ value: candidate.collegeId, label: `${candidate.college.name} — ${candidate.college.city}` });
  }

  return (
    <FormPanel title={editing ? "Edit candidate" : "Add candidate"} subtitle={editing ? candidate.email : undefined} form={form} onClose={onClose} submitLabel={editing ? "Save changes" : "Add candidate"}>
      <TextField label="Full name" name="name" value={values.name} onChange={setValue} error={errors.name} required maxLength={150} />
      <TextField label="Email" name="email" value={values.email} onChange={setValue} error={errors.email} required type="email" />
      <TextField label="Phone" name="phone" value={values.phone} onChange={setValue} error={errors.phone} type="tel" maxLength={20} />

      {colleges.phase === "error" ? (
        <ErrorState title="Couldn't load colleges" message={getErrorMessage(colleges.error)} onRetry={colleges.retry} />
      ) : (
        <SelectField
          label="College"
          name="collegeId"
          value={values.collegeId}
          onChange={setValue}
          options={options}
          error={errors.collegeId}
          placeholder={colleges.phase === "loading" ? "Loading colleges…" : "No college"}
          disabled={colleges.phase === "loading"}
          hint={editing && candidate.collegeId ? "A college can be changed but not removed." : undefined}
        />
      )}

      <TextField label="Resume link" name="resumeUrl" value={values.resumeUrl} onChange={setValue} error={errors.resumeUrl} type="url" placeholder="https://" maxLength={1000} />
      <CheckboxField label="Active" name="isActive" checked={values.isActive} onChange={setValue} />
    </FormPanel>
  );
}
