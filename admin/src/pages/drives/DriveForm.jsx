import { drivesApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import { CheckboxField, SelectField, TextAreaField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { getErrorMessage } from "../../utils/errors.js";
import { CANNOT_CLEAR, changedPayload, clearedKeys, compactPayload } from "../../utils/forms.js";
import { fromIstDateInput, toIstDateInput } from "../../utils/format.js";

export const DRIVE_STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const TEXT_KEYS = ["title", "description"];

export default function DriveForm({ drive, colleges, onClose, onSaved }) {
  const editing = Boolean(drive);

  const form = useForm({
    initialValues: {
      title: drive?.title ?? "",
      description: drive?.description ?? "",
      collegeId: drive?.collegeId ?? "",
      status: drive?.status ?? "DRAFT",
      startDate: toIstDateInput(drive?.startDate),
      endDate: toIstDateInput(drive?.endDate),
      isActive: drive?.isActive ?? true,
    },
    validate(values) {
      const errors = {};
      const title = values.title.trim();

      if (title.length < 2) errors.title = "Enter a title (at least 2 characters).";
      else if (title.length > 200) errors.title = "Title must not exceed 200 characters.";

      if (values.description.length > 2000) errors.description = "Description must not exceed 2000 characters.";
      if (!values.collegeId) errors.collegeId = "Choose a college.";

      if (values.startDate && !fromIstDateInput(values.startDate)) errors.startDate = "Enter a valid date.";
      if (values.endDate && !fromIstDateInput(values.endDate)) errors.endDate = "Enter a valid date.";

      if (values.startDate && values.endDate && values.endDate < values.startDate) {
        errors.endDate = "End date can't be before the start date.";
      }

      if (editing) {
        clearedKeys(drive, values, TEXT_KEYS).forEach((key) => {
          errors[key] = errors[key] ?? CANNOT_CLEAR;
        });

        if (drive.startDate && !values.startDate) errors.startDate = CANNOT_CLEAR;
        if (drive.endDate && !values.endDate) errors.endDate = CANNOT_CLEAR;
      }

      return errors;
    },
    async onSubmit(values) {
      const startDate = values.startDate ? fromIstDateInput(values.startDate) : undefined;
      const endDate = values.endDate ? fromIstDateInput(values.endDate) : undefined;

      if (editing) {
        const body = changedPayload(drive, values, TEXT_KEYS);

        if (values.collegeId !== drive.collegeId) body.collegeId = values.collegeId;
        if (values.status !== drive.status) body.status = values.status;
        if (values.isActive !== drive.isActive) body.isActive = values.isActive;
        if (startDate && values.startDate !== toIstDateInput(drive.startDate)) body.startDate = startDate;
        if (endDate && values.endDate !== toIstDateInput(drive.endDate)) body.endDate = endDate;

        if (Object.keys(body).length > 0) {
          await drivesApi.update(drive.id, body);
        }

        onSaved("Drive updated");
      } else {
        await drivesApi.create({
          ...compactPayload(values, TEXT_KEYS),
          collegeId: values.collegeId,
          status: values.status,
          isActive: values.isActive,
          ...(startDate ? { startDate } : {}),
          ...(endDate ? { endDate } : {}),
        });
        onSaved("Drive added");
      }
    },
  });

  const { values, setValue, errors } = form;

const options = colleges.items.map((c) => ({ value: c.id, label: `${c.name} — ${c.city}` }));

  if (drive?.college && !options.some((o) => o.value === drive.collegeId)) {
    options.unshift({ value: drive.collegeId, label: `${drive.college.name} — ${drive.college.city}` });
  }

  return (
    <FormPanel title={editing ? "Edit drive" : "Add drive"} subtitle={editing ? drive.title : undefined} form={form} onClose={onClose} submitLabel={editing ? "Save changes" : "Add drive"}>
      <TextField label="Title" name="title" value={values.title} onChange={setValue} error={errors.title} required maxLength={200} />

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
          required
          placeholder={colleges.phase === "loading" ? "Loading colleges…" : "Choose a college"}
          disabled={colleges.phase === "loading"}
        />
      )}

      <SelectField label="Stage" name="status" value={values.status} onChange={setValue} options={DRIVE_STATUS_OPTIONS} error={errors.status} />

      {form.formErrorCode === "DRIVE_NOT_READY" ? (
        <p className="notice notice--warn" role="status">
          Publishing was rejected before this save was applied. Your edits are still in this form; set Stage
          to Draft and save them, resolve the listed issues in Assessment setup, then publish.
        </p>
      ) : null}

      <div className="row2">
        <TextField label="Start date" name="startDate" value={values.startDate} onChange={setValue} error={errors.startDate} type="date" />
        <TextField label="End date" name="endDate" value={values.endDate} onChange={setValue} error={errors.endDate} type="date" />
      </div>

      <TextAreaField label="Description" name="description" value={values.description} onChange={setValue} error={errors.description} maxLength={2000} />
      <CheckboxField label="Active" name="isActive" checked={values.isActive} onChange={setValue} />
    </FormPanel>
  );
}
