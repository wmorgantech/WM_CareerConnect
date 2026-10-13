import { studentsApi } from "../../api/modules.api.js";
import { SelectField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { EMAIL_PATTERN } from "../../utils/forms.js";

const QUALIFICATIONS = ["BCA", "B.Sc CS", "B.Sc IT", "B.E/B.Tech", "MCA", "M.Sc CS", "M.Sc IT", "Other"].map((q) => ({ value: q, label: q }));
const MOBILE = /^[6-9]\d{9}$/;

export default function StudentForm({ drive, onClose, onSaved }) {
  const levels = [
    ...(drive.levelAllowed !== "PG" ? [{ value: "UG", label: "UG" }] : []),
    ...(drive.levelAllowed !== "UG" ? [{ value: "PG", label: "PG" }] : []),
  ];

  const form = useForm({
    initialValues: {
      name: "",
      email: "",
      mobile: "",
      level: levels[0].value,
      qualification: "",
      department: "",
      city: "",
      passingYear: "",
    },
    validate(values) {
      const errors = {};
      const digits = values.mobile.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");

      if (values.name.trim().length < 2) errors.name = "Enter the student's full name.";
      if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address.";
      if (!MOBILE.test(digits)) errors.mobile = "Enter a valid 10-digit mobile number.";
      if (values.passingYear && !/^\d{4}$/.test(values.passingYear)) errors.passingYear = "Enter a 4-digit year.";

      return errors;
    },
    async onSubmit(values) {
      await studentsApi.register({
        driveId: drive.id,
        name: values.name.trim(),
        email: values.email.trim(),
        mobile: values.mobile.trim(),
        level: values.level,
        ...(values.qualification ? { qualification: values.qualification } : {}),
        ...(values.department.trim() ? { department: values.department.trim() } : {}),
        ...(values.city.trim() ? { city: values.city.trim() } : {}),
        ...(values.passingYear ? { passingYear: Number(values.passingYear) } : {}),
      });
      onSaved("Student registered");
    },
  });

  const { values, setValue, errors } = form;

  return (
    <FormPanel title="Register a student" subtitle={drive.title} form={form} onClose={onClose} submitLabel="Register student">
      <TextField label="Full name" name="name" value={values.name} onChange={setValue} error={errors.name} required maxLength={150} autoFocus />
      <TextField label="Email" name="email" value={values.email} onChange={setValue} error={errors.email} required type="email" />
      <TextField label="Mobile number" name="mobile" value={values.mobile} onChange={setValue} error={errors.mobile} required type="tel" hint="10-digit Indian number." />
      <div className="grid2">
        <SelectField label="Level" name="level" value={values.level} onChange={setValue} options={levels} error={errors.level} required />
        <SelectField label="Qualification" name="qualification" value={values.qualification} onChange={setValue} options={QUALIFICATIONS} placeholder="Select…" error={errors.qualification} />
      </div>
      <TextField label="Department" name="department" value={values.department} onChange={setValue} error={errors.department} maxLength={150} />
      <div className="grid2">
        <TextField label="City" name="city" value={values.city} onChange={setValue} error={errors.city} maxLength={100} />
        <TextField label="Passing year" name="passingYear" value={values.passingYear} onChange={setValue} error={errors.passingYear} inputMode="numeric" maxLength={4} />
      </div>
    </FormPanel>
  );
}
