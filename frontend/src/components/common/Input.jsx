import { useId } from "react";

// Labeled text input. `error` shows a message under the field and marks it
// invalid for assistive technology; `hint` shows helper text.
export default function Input({
  label,
  error,
  hint,
  id,
  required,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const messageId = `${inputId}-message`;
  const hasMessage = Boolean(error || hint);

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-2 block text-sm font-medium text-gray-700"
        >
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-[#D32F2F]">
              *
            </span>
          )}
        </label>
      )}
      <input
        id={inputId}
        aria-describedby={hasMessage ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        required={required}
        className={`h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
          error
            ? "border-[#D32F2F] focus:border-[#D32F2F] focus:ring-[#D32F2F]/15"
            : "border-gray-300 focus:border-[#1B3A1E] focus:ring-[#1B3A1E]/10"
        }`}
        {...props}
      />
      {hasMessage && (
        <p
          id={messageId}
          className={`mt-1 text-xs ${error ? "text-[#D32F2F]" : "text-gray-500"}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
