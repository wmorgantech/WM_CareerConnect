import { useId } from "react";

// Labeled multi-line input with the same error/hint behavior as Input.
export default function Textarea({
  label,
  id,
  error,
  hint,
  required,
  rows = 4,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const messageId = `${textareaId}-message`;
  const hasMessage = Boolean(error || hint);

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={textareaId}
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
      <textarea
        id={textareaId}
        rows={rows}
        aria-describedby={hasMessage ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        required={required}
        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
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
