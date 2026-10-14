import { TriangleAlert } from "lucide-react";
import SidePanel from "./SidePanel.jsx";

export default function FormPanel({ title, subtitle, form, onClose, submitLabel = "Save", children }) {
  return (
    <SidePanel
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      dirty={form.dirty}
      busy={form.submitting}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn btn--outline" onClick={requestClose} disabled={form.submitting}>
            Cancel
          </button>
          <button type="submit" form="panel-form" className="btn btn--primary" disabled={form.submitting}>
            {form.submitting ? "Saving…" : submitLabel}
          </button>
        </>
      )}
    >
      <form id="panel-form" className="stack" onSubmit={form.handleSubmit} noValidate>
        {form.formError ? (
          <p className="notice notice--error" role="alert">
            <TriangleAlert size={16} aria-hidden="true" />
            <span>{form.formError}</span>
          </p>
        ) : null}
        {form.formIssues?.length > 0 ? (
          <ul className="checklist" role="alert">
            {form.formIssues.map((issue, index) => (
              <li key={`${issue.level ?? "drive"}-${issue.code ?? index}-${issue.message}`}>
                {issue.level ? `${issue.level}: ` : ""}
                <strong>{issue.code}: </strong>
                {issue.message}
              </li>
            ))}
          </ul>
        ) : null}
        {children}
      </form>
    </SidePanel>
  );
}
