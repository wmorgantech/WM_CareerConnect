import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  MessageSquareText,
} from "lucide-react";

import EmptyState from "../../components/common/EmptyState.jsx";
import Loader from "../../components/common/Loader.jsx";
import PageHeader from "../../components/layout/PageHeader.jsx";
import {
  ErrorPanel,
  StatCard,
} from "../../components/dashboard/DashboardParts.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { getInterviewerOverview } from "../../services/dashboard.service.js";

const LIST_SIZE = 5;
const PAGE_LIMIT = 100;

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

// Shows "n" for an exact count and "n+" when only the first page
// of results was inspected.
function formatCount(count, partial) {
  return partial ? `${count}+` : count;
}

function InterviewList({ title, icon: Icon, items, emptyText, renderMeta }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
        <Icon size={18} className="text-[#1B3A1E]" aria-hidden="true" />
        {title}
      </h2>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{emptyText}</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100">
          {items.map((interview) => (
            <li
              key={interview.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-gray-900">
                {interview.candidate?.name || "Unnamed candidate"}
              </span>

              <span className="text-gray-500">
                {renderMeta(interview)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Interviewer overview. Data comes from GET /interviews, which the backend
// scopes to the signed-in interviewer's own interviews.
export default function InterviewerDashboard() {
  const { hasAnyPermission } = usePermissions();

  const canViewInterviews = hasAnyPermission([
    "interviews.feedback",
    "interviews.schedule",
  ]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(canViewInterviews);
  const [error, setError] = useState(null);

  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;

    setLoading(true);
    setError(null);

    try {
      const overview = await getInterviewerOverview();

      if (currentRequest === requestId.current) {
        setData(overview);
      }
    } catch (err) {
      if (currentRequest === requestId.current) {
        setData(null);
        setError(err);
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (canViewInterviews) {
      load();
    }

    return () => {
      // Ignore results from requests started before unmount.
      requestId.current += 1;
    };
  }, [canViewInterviews, load]);

  let content;

  if (!canViewInterviews) {
    content = (
      <ErrorPanel error={{ status: 403 }} />
    );
  } else if (loading) {
    content = <Loader label="Loading your interviews..." />;
  } else if (error) {
    content = <ErrorPanel error={error} onRetry={load} />;
  } else if (data) {
    const now = Date.now();

    const upcoming = data.scheduled.items.filter(
      (interview) => new Date(interview.scheduledAt).getTime() >= now,
    );

    const awaitingFeedback = data.completed.items.filter(
      (interview) => !interview.feedbackSubmittedAt,
    );

    const completedPartial =
      data.completed.total !== null &&
      data.completed.total > data.completed.items.length;

    const hasNothing =
      data.scheduled.total === 0 && data.completed.total === 0;

    content = (
      <>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Scheduled interviews"
            icon={CalendarClock}
            value={data.scheduled.total}
            loading={false}
            footnote="Assigned to you"
          />

          <StatCard
            label="Awaiting feedback"
            icon={MessageSquareText}
            value={formatCount(awaitingFeedback.length, completedPartial)}
            loading={false}
            footnote={
              completedPartial
                ? `Based on your first ${PAGE_LIMIT} completed interviews`
                : "Completed, feedback not yet submitted"
            }
          />

          <StatCard
            label="Completed interviews"
            icon={CheckCircle2}
            value={data.completed.total}
            loading={false}
            footnote="Assigned to you"
          />
        </div>

        {hasNothing ? (
          <div className="mt-6">
            <EmptyState
              title="No interviews assigned yet"
              description="Interviews scheduled for you will appear here."
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <InterviewList
              title="Upcoming interviews"
              icon={CalendarClock}
              items={upcoming.slice(0, LIST_SIZE)}
              emptyText="No upcoming interviews."
              renderMeta={(interview) => (
                <>
                  {formatDateTime(interview.scheduledAt)}
                  {isHttpUrl(interview.meetingLink) && (
                    <>
                      {" · "}
                      <a
                        href={interview.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-green-800 hover:underline"
                      >
                        Join
                      </a>
                    </>
                  )}
                </>
              )}
            />

            <InterviewList
              title="Awaiting your feedback"
              icon={MessageSquareText}
              items={awaitingFeedback.slice(0, LIST_SIZE)}
              emptyText="No feedback is pending."
              renderMeta={(interview) =>
                `Interviewed ${formatDateTime(interview.scheduledAt)}`
              }
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title="Interviewer Dashboard"
        description="Your assigned interviews and pending feedback."
      />

      {content}
    </div>
  );
}
