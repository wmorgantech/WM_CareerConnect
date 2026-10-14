export function getFormIssues(error) {
  if (!Array.isArray(error?.details?.issues)) return [];

  return error.details.issues.filter(
    (issue) =>
      issue &&
      typeof issue.code === "string" &&
      typeof issue.message === "string" &&
      issue.message.length > 0,
  );
}
