import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";

import Button from "../../components/common/Button.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import FormModal from "../../components/common/FormModal.jsx";
import Loader from "../../components/common/Loader.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import { ErrorPanel } from "../../components/dashboard/DashboardParts.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import { useToast } from "../../hooks/useToast.js";
import candidatesService from "../../services/candidates.service.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime } from "../../utils/formatters.js";
import {
  buildCollegeOptions,
  candidateInitialValues,
  getCandidateFields,
  isHttpUrl,
  toFieldError,
  toUpdatePayload,
} from "./candidateForm.js";
import { useColleges } from "./useColleges.js";

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-gray-900">{children}</dd>
    </div>
  );
}

const NONE = <span className="text-gray-400">—</span>;

// GET /candidates/:id (candidates.manage). Shows the stored record only; the
// API exposes no application, test or interview data for a candidate.
export default function CandidateDetails() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const colleges = useColleges();

  const [state, setState] = useState({
    candidate: null,
    loading: true,
    error: null,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [activeOpen, setActiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const candidate = await candidatesService.get(candidateId);

      setState({ candidate, loading: false, error: null });
    } catch (error) {
      setState({ candidate: null, loading: false, error });
    }
  }, [candidateId]);

  useEffect(() => {
    load();
  }, [load]);

  const { candidate, loading, error } = state;

  const backLink = (
    <Link
      className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm font-medium text-[#1B3A1E] hover:underline"
      to="/admin/candidates"
    >
      <ArrowLeft aria-hidden="true" size={16} />
      Back to candidates
    </Link>
  );

  if (loading && !candidate) {
    return (
      <div>
        {backLink}
        <Loader label="Loading candidate..." />
      </div>
    );
  }

  // The API answers 404 for an unknown id and 400 for a malformed one.
  if (error && (error.status === 404 || error.status === 400)) {
    return (
      <div>
        {backLink}
        <EmptyState
          description="This candidate does not exist or has been deleted."
          title="Candidate not found"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {backLink}
        <ErrorPanel error={error} onRetry={load} />
      </div>
    );
  }

  async function handleSave(values) {
    const changes = toUpdatePayload(values, candidate);

    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await candidatesService.update(candidate.id, changes);
    } catch (saveError) {
      throw toFieldError(saveError);
    }

    toast.success("Candidate updated");
    load();
  }

  async function handleToggleActive() {
    const next = !candidate.isActive;

    await candidatesService.update(candidate.id, { isActive: next });
    toast.success(next ? "Candidate activated" : "Candidate deactivated");
    load();
  }

  async function handleDelete() {
    await candidatesService.remove(candidate.id);
    toast.success("Candidate deleted");
    navigate("/admin/candidates", { replace: true });
  }

  const collegesUnavailable = colleges.loading || Boolean(colleges.error);

  const actions = (
    <>
      <Button
        disabled={collegesUnavailable}
        onClick={() => setEditOpen(true)}
        variant="secondary"
      >
        <Pencil aria-hidden="true" size={16} />
        Edit
      </Button>

      {candidate.isActive ? (
        <Button onClick={() => setActiveOpen(true)} variant="secondary">
          <PowerOff aria-hidden="true" size={16} />
          Deactivate
        </Button>
      ) : (
        <Button
          onClick={() =>
            handleToggleActive().catch((toggleError) =>
              toast.error(getErrorMessage(toggleError)),
            )
          }
          variant="secondary"
        >
          <Power aria-hidden="true" size={16} />
          Activate
        </Button>
      )}

      <Button onClick={() => setDeleteOpen(true)} variant="danger">
        <Trash2 aria-hidden="true" size={16} />
        Delete
      </Button>
    </>
  );

  return (
    <div>
      {backLink}

      <PageHeader
        actions={actions}
        description={candidate.email}
        title={candidate.name}
      />

      {colleges.error && (
        <ErrorPanel error={colleges.error} onRetry={colleges.reload} />
      )}

      <section
        aria-label="Candidate details"
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <dl className="grid gap-5 sm:grid-cols-2">
          <Field label="Status">
            <StatusBadge status={candidate.isActive ? "ACTIVE" : "INACTIVE"} />
          </Field>

          <Field label="Email">
            <a
              className="text-[#1B3A1E] hover:underline"
              href={`mailto:${candidate.email}`}
            >
              {candidate.email}
            </a>
          </Field>

          <Field label="Phone">
            {candidate.phone ? (
              <a
                className="text-[#1B3A1E] hover:underline"
                href={`tel:${candidate.phone}`}
              >
                {candidate.phone}
              </a>
            ) : (
              NONE
            )}
          </Field>

          <Field label="College">
            {candidate.college ? (
              <>
                {candidate.college.name}
                <span className="text-gray-500">
                  {" "}
                  · {candidate.college.city}
                </span>
              </>
            ) : (
              NONE
            )}
          </Field>

          <Field label="Resume link">
            {candidate.resumeUrl ? (
              isHttpUrl(candidate.resumeUrl) ? (
                <a
                  className="inline-flex items-center gap-1 text-[#1B3A1E] hover:underline"
                  href={candidate.resumeUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open resume
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ) : (
                <span className="text-gray-500">
                  Not shown (only http and https links are opened)
                </span>
              )
            ) : (
              NONE
            )}
          </Field>

          <Field label="Added">{formatDateTime(candidate.createdAt)}</Field>

          <Field label="Last updated">
            {formatDateTime(candidate.updatedAt)}
          </Field>
        </dl>
      </section>

      <FormModal
        fields={getCandidateFields({
          isEdit: true,
          collegeOptions: buildCollegeOptions(colleges.items, candidate),
          currentResumeUrl: candidate.resumeUrl ?? undefined,
        })}
        initialValues={candidateInitialValues(candidate)}
        key={candidate.updatedAt}
        omitEmpty={false}
        onClose={() => setEditOpen(false)}
        onSubmit={handleSave}
        open={editOpen}
        submitLabel="Save changes"
        title="Edit candidate"
      />

      <ConfirmDialog
        confirmLabel="Deactivate"
        message={`${candidate.name} will be marked inactive and excluded from active candidate counts and from new interviews. The record is kept and you can activate it again.`}
        onCancel={() => setActiveOpen(false)}
        onConfirm={handleToggleActive}
        open={activeOpen}
        title="Deactivate candidate"
        tone="primary"
      />

      <ConfirmDialog
        confirmLabel="Delete"
        message={`Delete ${candidate.name} (${candidate.email})? The record is removed from the list and cannot be restored from this screen.`}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        open={deleteOpen}
        title="Delete candidate"
      />
    </div>
  );
}
