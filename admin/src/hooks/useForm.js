import { useCallback, useRef, useState } from "react";
import { getErrorMessage, getFieldErrors } from "../utils/errors.js";

export function useForm({ initialValues, validate, onSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const initialRef = useRef(initialValues);

  const dirty = JSON.stringify(values) !== JSON.stringify(initialRef.current);

  const setValue = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event?.preventDefault();

      if (submittingRef.current) {
        return;
      }

      const found = validate ? validate(values) : {};

      setErrors(found);
      setFormError("");

      if (Object.keys(found).length > 0) {
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);

      try {
        await onSubmit(values);
      } catch (error) {
        const serverErrors = getFieldErrors(error);

        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
        } else {
          setFormError(getErrorMessage(error));
        }
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [validate, onSubmit, values],
  );

  return { values, setValue, errors, formError, submitting, dirty, handleSubmit };
}
