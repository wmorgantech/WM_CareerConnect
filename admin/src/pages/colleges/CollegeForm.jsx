import { collegesApi } from "../../api/modules.api.js";
import { CheckboxField, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { useForm } from "../../hooks/useForm.js";
import { CANNOT_CLEAR, EMAIL_PATTERN, changedPayload, clearedKeys, compactPayload } from "../../utils/forms.js";

const TEXT_KEYS = ["name", "city", "contactPerson", "phone", "email"];

export default function CollegeForm({ college, onClose, onSaved }) {
  const editing = Boolean(college);

  const form = useForm({
    initialValues: {
      name: college?.name ?? "",
      city: college?.city ?? "",
      contactPerson: college?.contactPerson ?? "",
      phone: college?.phone ?? "",
      email: college?.email ?? "",
      isActive: college?.isActive ?? true,
    },
    validate(values) {
      const errors = {};
      const name = values.name.trim();
      const city = values.city.trim();

      if (name.length < 2) errors.name = "Enter the college name (at least 2 characters).";
      else if (name.length > 200) errors.name = "College name must not exceed 200 characters.";

      if (city.length < 2) errors.city = "Enter the city (at least 2 characters).";
      else if (city.length > 100) errors.city = "City must not exceed 100 characters.";

      if (values.contactPerson.length > 100) errors.contactPerson = "Contact person must not exceed 100 characters.";
      if (values.phone.length > 20) errors.phone = "Phone number must not exceed 20 characters.";
      if (values.email.trim() && !EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address.";

      if (editing) {
        clearedKeys(college, values, TEXT_KEYS).forEach((key) => {
          errors[key] = errors[key] ?? CANNOT_CLEAR;
        });
      }

      return errors;
    },
    async onSubmit(values) {
      if (editing) {
        const body = changedPayload(college, values, TEXT_KEYS);

        if (values.isActive !== college.isActive) body.isActive = values.isActive;

        if (Object.keys(body).length > 0) {
          await collegesApi.update(college.id, body);
        }

        onSaved("College updated");
      } else {
        await collegesApi.create({ ...compactPayload(values, TEXT_KEYS), isActive: values.isActive });
        onSaved("College added");
      }
    },
  });

  const { values, setValue, errors } = form;

  return (
    <FormPanel title={editing ? "Edit college" : "Add college"} subtitle={editing ? college.name : undefined} form={form} onClose={onClose} submitLabel={editing ? "Save changes" : "Add college"}>
      <TextField label="College name" name="name" value={values.name} onChange={setValue} error={errors.name} required maxLength={200} />
      <TextField label="City" name="city" value={values.city} onChange={setValue} error={errors.city} required maxLength={100} />
      <TextField label="Contact person" name="contactPerson" value={values.contactPerson} onChange={setValue} error={errors.contactPerson} maxLength={100} />
      <TextField label="Phone" name="phone" value={values.phone} onChange={setValue} error={errors.phone} maxLength={20} type="tel" />
      <TextField label="Email" name="email" value={values.email} onChange={setValue} error={errors.email} type="email" />
      <CheckboxField label="Active" name="isActive" checked={values.isActive} onChange={setValue} hint="Inactive colleges can't be chosen for new drives or candidates." />
    </FormPanel>
  );
}
