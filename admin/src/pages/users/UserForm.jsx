import { useEffect, useState } from "react";
import { Building2, ShieldCheck } from "lucide-react";

import { collegesApi, listRoles, usersApi } from "../../api/modules.api.js";
import ErrorState from "../../components/feedback/ErrorState.jsx";
import LoadingState from "../../components/feedback/LoadingState.jsx";
import { IconText, TextField } from "../../components/ui/Field.jsx";
import FormPanel from "../../components/ui/FormPanel.jsx";
import { roleLabel } from "../../config/navigation.js";
import { useForm } from "../../hooks/useForm.js";
import { getErrorMessage, isAbortError } from "../../utils/errors.js";
import { EMAIL_PATTERN } from "../../utils/forms.js";

const COLLEGE_SCOPED = ["HOD", "STAFF"];

function isCollegeScoped(roleItems, selectedIds) {
  return roleItems.some((role) => selectedIds.includes(role.id) && COLLEGE_SCOPED.includes(role.name));
}

export default function UserForm({ user, onClose, onSaved }) {
  const editing = Boolean(user);
  const [roles, setRoles] = useState({ phase: "loading", items: [], error: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setRoles((current) => ({ ...current, phase: "loading", error: null }));

    listRoles(controller.signal)
      .then((items) => setRoles({ phase: "ready", items, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) setRoles({ phase: "error", items: [], error });
      });

    return () => controller.abort();
  }, [reloadKey]);

  const originalRoleIds = (user?.roles ?? []).map((role) => role.id);
  const [colleges, setColleges] = useState({ phase: "idle", items: [], error: null });
  const [collegeReload, setCollegeReload] = useState(0);

  const form = useForm({
    initialValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      roleIds: originalRoleIds,
      collegeIds: [],
    },
    validate(values) {
      const errors = {};
      const name = values.name.trim();

      if (name.length < 2) errors.name = "Enter the name (at least 2 characters).";
      else if (name.length > 100) errors.name = "Name must not exceed 100 characters.";

      if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address.";

      if (!editing && values.password.length < 8) errors.password = "Password must be at least 8 characters.";
      else if (values.password && values.password.length < 8) errors.password = "Password must be at least 8 characters.";
      else if (values.password.length > 100) errors.password = "Password must not exceed 100 characters.";

      if (values.roleIds.length === 0) errors.roleIds = "Choose at least one role.";

      return errors;
    },
    async onSubmit(values) {
      if (editing) {
        const body = {};
        const name = values.name.trim();
        const email = values.email.trim().toLowerCase();

        if (name !== user.name) body.name = name;
        if (email !== user.email) body.email = email;
        if (values.password) body.password = values.password;

        const same =
          values.roleIds.length === originalRoleIds.length &&
          values.roleIds.every((id) => originalRoleIds.includes(id));

        if (!same) body.roleIds = values.roleIds;

        if (Object.keys(body).length > 0) {
          await usersApi.update(user.id, body);
        }

        onSaved("User updated");
      } else {
        const scoped = isCollegeScoped(roles.items, values.roleIds);

        await usersApi.create({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          roleIds: values.roleIds,
          ...(scoped && values.collegeIds.length > 0 ? { collegeIds: values.collegeIds } : {}),
        });
        onSaved("User added");
      }
    },
  });

  const { values, setValue, errors } = form;
  const showColleges = !editing && isCollegeScoped(roles.items, values.roleIds);

  // The college list is fetched the first time a HOD or STAFF role is ticked.
  useEffect(() => {
    if (!showColleges) return undefined;

    const controller = new AbortController();

    setColleges((current) => ({ ...current, phase: "loading", error: null }));

    collegesApi
      .list({ limit: 100, isActive: "true" }, controller.signal)
      .then(({ items }) => setColleges({ phase: "ready", items, error: null }))
      .catch((error) => {
        if (!isAbortError(error)) setColleges({ phase: "error", items: [], error });
      });

    return () => controller.abort();
  }, [showColleges, collegeReload]);

  function toggleCollege(id) {
    setValue("collegeIds", values.collegeIds.includes(id) ? values.collegeIds.filter((c) => c !== id) : [...values.collegeIds, id]);
  }

  function toggleRole(id) {
    setValue("roleIds", values.roleIds.includes(id) ? values.roleIds.filter((r) => r !== id) : [...values.roleIds, id]);
  }

  return (
    <FormPanel title={editing ? "Edit user" : "Add user"} subtitle={editing ? user.email : undefined} form={form} onClose={onClose} submitLabel={editing ? "Save changes" : "Add user"}>
      <TextField label="Full name" name="name" value={values.name} onChange={setValue} error={errors.name} required maxLength={100} />
      <TextField label="Email" name="email" value={values.email} onChange={setValue} error={errors.email} required type="email" autoComplete="off" />
      <TextField
        label={editing ? "New password" : "Password"}
        name="password"
        value={values.password}
        onChange={setValue}
        error={errors.password}
        required={!editing}
        type="password"
        autoComplete="new-password"
        hint={editing ? "Leave blank to keep the current password." : "At least 8 characters."}
        maxLength={100}
      />

      <fieldset className="fieldset" aria-describedby={errors.roleIds ? "roles-error" : undefined}>
        <legend>
          <IconText icon={ShieldCheck}>
            Roles<span className="field__req" aria-hidden="true"> *</span>
          </IconText>
        </legend>

        {roles.phase === "loading" ? <LoadingState label="Loading roles…" /> : null}
        {roles.phase === "error" ? (
          <ErrorState title="Couldn't load roles" message={getErrorMessage(roles.error)} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : null}

        {roles.phase === "ready" ? (
          <div className="checklist">
            {roles.items.map((role) => (
              <label key={role.id} className="checklist__item">
                <input type="checkbox" checked={values.roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} />
                <span>
                  <strong>{roleLabel(role.name)}</strong>
                  {role.description ? <span className="sub">{role.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {errors.roleIds ? (
          <p className="field__error" id="roles-error">
            {errors.roleIds}
          </p>
        ) : null}
      </fieldset>

      {showColleges ? (
        <fieldset className="fieldset">
          <legend><IconText icon={Building2}>College access</IconText></legend>
          <p className="panel__note">This account sees assessment results only for the colleges ticked here. You can also change this later.</p>

          {colleges.phase === "loading" ? <LoadingState label="Loading colleges…" /> : null}
          {colleges.phase === "error" ? (
            <ErrorState title="Couldn't load colleges" message={getErrorMessage(colleges.error)} onRetry={() => setCollegeReload((k) => k + 1)} />
          ) : null}

          {colleges.phase === "ready" ? (
            <div className="checklist">
              {colleges.items.map((college) => (
                <label key={college.id} className="checklist__item">
                  <input type="checkbox" checked={values.collegeIds.includes(college.id)} onChange={() => toggleCollege(college.id)} />
                  <span>
                    <strong>{college.name}</strong>
                    {college.city ? <span className="sub">{college.city}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          {values.collegeIds.length === 0 && colleges.phase === "ready" ? (
            <p className="notice notice--warn"><span>No college selected: this account will see no results until one is assigned.</span></p>
          ) : null}
        </fieldset>
      ) : null}
    </FormPanel>
  );
}
