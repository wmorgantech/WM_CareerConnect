import { ApiError } from "../../services/api.js";
import { formatDateTime } from "../../utils/formatters.js";
import { fromOffsetInputValue } from "../../utils/formValidation.js";

// Backend (interviews.schema.ts / interviews.service.ts):
//   schedule:  candidateId, interviewerId (uuid), scheduledAt (must be in the
//              future when creating), durationMinutes (integer 15-480, must
//              be sent as a number), meetingLink (URL, optional), notes
//              (<=2000, optional)
//   update:    interviewerId, scheduledAt, durationMinutes, meetingLink,
//              notes, status (SCHEDULED | COMPLETED | CANCELLED). The
//              candidate cannot be changed. Any status may be set.
//   delete:    only sets the status to CANCELLED.
//   feedback:  assigned interviewer only, interview must be COMPLETED,
//              score integer 0-100, feedback 1-5000 characters. Submitting
//              locks it; only a Super Admin can unlock it.

// Interview times are entered, stored and shown in IST (UTC+5:30), the
// product's display time zone, regardless of the browser's time zone.
export const IST_OFFSET_MINUTES = 330;

export const INTERVIEW_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"];

export const STATUS_OPTIONS = INTERVIEW_STATUSES.map((status) => ({
  value: status,
  label: status.charAt(0) + status.slice(1).toLowerCase(),
}));

export function formatIst(value) {
  const text = formatDateTime(value);

  return text === "—" ? text : `${text} IST`;
}

export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

// "pending"   completed, no feedback yet
// "locked"    feedback submitted and locked
// "unlocked"  feedback submitted, unlocked by a Super Admin for correction
// null        feedback does not apply (not completed)
export function getFeedbackState(interview) {
  if (interview.status !== "COMPLETED") {
    return null;
  }

  if (!interview.feedbackSubmittedAt) {
    return "pending";
  }

  return interview.feedbackLockedAt ? "locked" : "unlocked";
}

export function getInterviewerName(interview, interviewersById, currentUser) {
  if (currentUser && interview.interviewerId === currentUser.id) {
    return currentUser.name;
  }

  return (
    interviewersById.get(interview.interviewerId)?.name ??
    "Unavailable interviewer"
  );
}

// Create-only: the API rejects a time that is not in the future.
export function validateSchedule(values) {
  if (!values.scheduledAt) {
    return {};
  }

  const when = fromOffsetInputValue(values.scheduledAt, IST_OFFSET_MINUTES);

  if (!Number.isNaN(when.getTime()) && when.getTime() <= Date.now()) {
    return { scheduledAt: "Interview time must be in the future (IST)" };
  }

  return {};
}

export function buildInterviewerOptions(interviewers, current) {
  const options = interviewers.map((interviewer) => ({
    value: interviewer.id,
    label: `${interviewer.name} (${interviewer.email})`,
  }));

  if (
    current?.interviewerId &&
    !options.some((option) => option.value === current.interviewerId)
  ) {
    options.unshift({
      value: current.interviewerId,
      label: "Unavailable interviewer – current",
    });
  }

  return options;
}

// `currentMeetingLink` is the stored link when editing. A link is only
// checked when it differs from the stored one, so an interview that already
// has an unusual link can still be edited (the API cannot clear a link).
export function getScheduleFields({
  isEdit,
  interviewerOptions,
  renderCandidate,
  currentMeetingLink,
}) {
  return [
    ...(isEdit
      ? []
      : [
          {
            name: "candidateId",
            label: "Candidate",
            type: "custom",
            required: true,
            render: renderCandidate,
          },
        ]),
    {
      name: "interviewerId",
      label: "Interviewer",
      type: "select",
      required: true,
      options: interviewerOptions,
      placeholder: "Select an interviewer",
    },
    {
      name: "scheduledAt",
      label: "Date and time (IST)",
      type: "datetime-local",
      required: true,
      utcOffsetMinutes: IST_OFFSET_MINUTES,
      width: "half",
      hint: "India Standard Time (UTC+5:30), whatever your computer's time zone.",
    },
    {
      name: "durationMinutes",
      label: "Duration (minutes)",
      type: "number",
      required: true,
      min: 15,
      max: 480,
      width: "half",
      validate: (value) =>
        Number.isInteger(Number(value)) ? "" : "Duration must be a whole number",
    },
    ...(isEdit
      ? [
          {
            name: "status",
            label: "Status",
            type: "select",
            required: true,
            options: STATUS_OPTIONS,
            placeholder: "Select a status",
            hint: "Feedback can only be submitted once an interview is Completed.",
          },
        ]
      : []),
    {
      name: "meetingLink",
      label: "Meeting link",
      type: "url",
      maxLength: 1000,
      placeholder: "https://",
      validate: (value) =>
        value === currentMeetingLink || isHttpUrl(value)
          ? ""
          : "Enter a link starting with http:// or https://",
      hint: isEdit ? "Can be changed but not removed." : undefined,
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      maxLength: 2000,
      rows: 3,
    },
  ];
}

export function scheduleInitialValues(interview) {
  return interview
    ? {
        interviewerId: interview.interviewerId,
        scheduledAt: interview.scheduledAt,
        durationMinutes: interview.durationMinutes,
        status: interview.status,
        meetingLink: interview.meetingLink,
        notes: interview.notes,
      }
    : { durationMinutes: 60 };
}

export function toCreatePayload(values) {
  const payload = { ...values };

  ["meetingLink", "notes"].forEach((key) => {
    if (!payload[key]) {
      delete payload[key];
    }
  });

  return payload;
}

// Only the fields that changed. An emptied meeting link is ignored (the API
// cannot clear it); emptied notes are sent as "".
export function toUpdatePayload(values, interview) {
  const changes = {};

  if (values.interviewerId !== interview.interviewerId) {
    changes.interviewerId = values.interviewerId;
  }

  if (
    new Date(values.scheduledAt).getTime() !==
    new Date(interview.scheduledAt).getTime()
  ) {
    changes.scheduledAt = values.scheduledAt;
  }

  if (values.durationMinutes !== interview.durationMinutes) {
    changes.durationMinutes = values.durationMinutes;
  }

  if (values.status !== interview.status) {
    changes.status = values.status;
  }

  if (values.meetingLink && values.meetingLink !== (interview.meetingLink ?? "")) {
    changes.meetingLink = values.meetingLink;
  }

  if ((values.notes ?? "") !== (interview.notes ?? "")) {
    changes.notes = values.notes ?? "";
  }

  return changes;
}

// Missing candidate / interviewer 404s belong to their fields.
export function toFieldError(error) {
  const field = {
    CANDIDATE_NOT_FOUND: "candidateId",
    INTERVIEWER_NOT_FOUND: "interviewerId",
  }[error?.code];

  if (!field) {
    return error;
  }

  return new ApiError(error.message, {
    status: error.status,
    code: error.code,
    details: { fieldErrors: { [field]: [error.message] } },
  });
}

export const FEEDBACK_FIELDS = [
  {
    name: "score",
    label: "Score (0–100)",
    type: "number",
    required: true,
    min: 0,
    max: 100,
    width: "half",
    validate: (value) =>
      Number.isInteger(Number(value)) ? "" : "Score must be a whole number",
  },
  {
    name: "feedback",
    label: "Feedback",
    type: "textarea",
    required: true,
    maxLength: 5000,
    rows: 6,
    hint: "Submitting locks the feedback. Only a Super Admin can unlock it.",
  },
];
