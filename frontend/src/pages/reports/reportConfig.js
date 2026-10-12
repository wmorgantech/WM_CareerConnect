// Backend (reports.schema.ts / reports.service.ts), all under /reports:
//   GET /reports         reports.view    paginated rows for one report type
//   GET /reports/export  reports.export  CSV of the FIRST 100 matching rows
//                                        (page and limit are ignored)
//
// type      CANDIDATES | INTERVIEWS | RESULTS
// Filters   collegeId; driveId (a UUID; the API filters by the DRIVE'S
//           COLLEGE because candidates are not linked to drives, and it
//           overrides collegeId); fromDate / toDate (YYYY-MM-DD, fromDate
//           must not be after toDate); status (INTERVIEWS only).
// Each type applies the date range to a different field (below).
export const REPORT_TYPES = [
  {
    value: "CANDIDATES",
    label: "Candidates",
    description: "Active candidates and their colleges.",
    dateField: "Added",
    supportsStatus: false,
  },
  {
    value: "INTERVIEWS",
    label: "Interviews",
    description: "All interviews with their status.",
    dateField: "Interview date",
    supportsStatus: true,
  },
  {
    value: "RESULTS",
    label: "Results",
    description: "Completed interviews that have feedback.",
    dateField: "Feedback submitted",
    supportsStatus: false,
  },
];

export const INTERVIEW_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"];

export const EXPORT_ROW_LIMIT = 100;

export const EMPTY_FILTERS = {
  type: "CANDIDATES",
  collegeId: "",
  driveId: "",
  status: "",
  fromDate: "",
  toDate: "",
};

export function getReportType(value) {
  return REPORT_TYPES.find((type) => type.value === value) ?? REPORT_TYPES[0];
}

// Returns a message when the date range is invalid, otherwise "".
export function validateDateRange(filters) {
  if (
    filters.fromDate &&
    filters.toDate &&
    filters.fromDate > filters.toDate
  ) {
    return "“From” date must be on or before the “To” date.";
  }

  return "";
}

// The query for the report rows and the export: only the filters that apply
// to the chosen report type.
export function toReportParams(filters) {
  const params = {
    type: filters.type,
    collegeId: filters.driveId ? "" : filters.collegeId,
    driveId: filters.driveId,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  };

  if (getReportType(filters.type).supportsStatus) {
    params.status = filters.status;
  }

  return params;
}

// Score distribution of completed-interview results, in fixed 20-point bins.
export const SCORE_BINS = [
  { label: "0–19", min: 0, max: 19 },
  { label: "20–39", min: 20, max: 39 },
  { label: "40–59", min: 40, max: 59 },
  { label: "60–79", min: 60, max: 79 },
  { label: "80–100", min: 80, max: 100 },
];

export function summarizeScores(results) {
  const scores = results
    .map((result) => result.score)
    .filter((score) => Number.isFinite(score));

  return {
    count: scores.length,
    average:
      scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : null,
    bins: SCORE_BINS.map((bin) => ({
      label: bin.label,
      value: scores.filter((score) => score >= bin.min && score <= bin.max)
        .length,
    })),
  };
}
