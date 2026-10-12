import { ApiError } from "../../services/api.js";

// Shared by the Candidates list and the candidate detail page.
//
// Backend (candidates.schema.ts): name 2-150, email valid and <=255,
// phone 7-20 (optional), collegeId (optional; must be an ACTIVE college),
// resumeUrl a URL <=1000 (optional), isActive. The API has no way to clear
// phone, collegeId or resumeUrl once set (no null accepted).

export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function collegeLabel(college) {
  return `${college.name} (${college.city})`;
}

// Active colleges, plus the candidate's current college even if it has since
// been deactivated, so the select can still show it.
export function buildCollegeOptions(colleges, current) {
  const options = colleges
    .filter((college) => college.isActive)
    .map((college) => ({ value: college.id, label: collegeLabel(college) }));

  if (
    current?.college &&
    !options.some((option) => option.value === current.college.id)
  ) {
    options.unshift({
      value: current.college.id,
      label: `${collegeLabel(current.college)} – current`,
    });
  }

  return options;
}

// `currentResumeUrl` is the stored link when editing: a link is only checked
// when it differs from the stored one (the API cannot clear a resume link).
export function getCandidateFields({
  isEdit,
  collegeOptions,
  currentResumeUrl,
}) {
  const cannotRemove = isEdit ? "Can be changed but not removed." : undefined;

  return [
    {
      name: "name",
      label: "Full name",
      required: true,
      minLength: 2,
      maxLength: 150,
      autoComplete: "off",
    },
    {
      name: "email",
      label: "Email",
      type: "email",
      required: true,
      maxLength: 255,
      autoComplete: "off",
    },
    {
      name: "phone",
      label: "Phone",
      type: "tel",
      minLength: 7,
      maxLength: 20,
      inputMode: "tel",
      width: "half",
      hint: cannotRemove,
    },
    {
      name: "collegeId",
      label: "College",
      type: "select",
      options: collegeOptions,
      placeholder: "No college",
      width: "half",
      hint: isEdit
        ? "Only active colleges can be chosen. Can be changed but not removed."
        : "Only active colleges can be chosen.",
    },
    {
      name: "resumeUrl",
      label: "Resume link",
      type: "url",
      maxLength: 1000,
      placeholder: "https://",
      validate: (value) =>
        value === currentResumeUrl || isHttpUrl(value)
          ? ""
          : "Enter a link starting with http:// or https://",
      hint: cannotRemove,
    },
  ];
}

export function candidateInitialValues(candidate) {
  return candidate
    ? {
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        collegeId: candidate.collegeId,
        resumeUrl: candidate.resumeUrl,
      }
    : undefined;
}

const OPTIONAL_KEYS = ["phone", "collegeId", "resumeUrl"];

export function toCreatePayload(values) {
  const payload = { ...values };

  OPTIONAL_KEYS.forEach((key) => {
    if (!payload[key]) {
      delete payload[key];
    }
  });

  return payload;
}

// Only the fields that changed. Cleared optional fields are ignored because
// the API cannot clear them.
export function toUpdatePayload(values, candidate) {
  const changes = {};

  ["name", "email"].forEach((key) => {
    if (values[key] !== candidate[key]) {
      changes[key] = values[key];
    }
  });

  OPTIONAL_KEYS.forEach((key) => {
    if (values[key] && values[key] !== (candidate[key] ?? "")) {
      changes[key] = values[key];
    }
  });

  return changes;
}

// A missing/inactive college on create is reported as a 404; show it beside
// the College field.
export function toFieldError(error) {
  if (error?.code === "COLLEGE_NOT_FOUND") {
    return new ApiError(error.message, {
      status: error.status,
      code: error.code,
      details: { fieldErrors: { collegeId: [error.message] } },
    });
  }

  return error;
}
