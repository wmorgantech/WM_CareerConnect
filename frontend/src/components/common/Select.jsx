import { useId } from "react";

// Labeled native select. Pass <option> elements as children.
export default function Select({
  label,
  id,
  error,
  hint,
  required,
  children,
  className = "",
  ...props
}) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const messageId = `${selectId}-message`;
  const hasMessage = Boolean(error || hint);

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={selectId}
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
      <select
        id={selectId}
        aria-describedby={hasMessage ? messageId : undefined}
        aria-invalid={error ? true : undefined}
        required={required}
        className={`h-11 w-full rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
          error
            ? "border-[#D32F2F] focus:border-[#D32F2F] focus:ring-[#D32F2F]/15"
            : "border-gray-300 focus:border-[#1B3A1E] focus:ring-[#1B3A1E]/10"
        }`}
        {...props}
      >
        {children}
      </select>
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
