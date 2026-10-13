import assert from "node:assert/strict";
import { test } from "node:test";
import { createCsv, escapeCsvValue } from "../src/lib/csv.js";
import { isHttpUrl } from "../src/lib/url.js";
import {
  createCandidateSchema,
  updateCandidateSchema,
} from "../src/modules/candidates/candidates.schema.js";
import {
  createInterviewSchema,
  updateInterviewSchema,
} from "../src/modules/interviews/interviews.schema.js";
import { updateSettingsSchema } from "../src/modules/settings/settings.schema.js";
import {
  assertAccountChangeAllowed,
  UserSafetyError,
  type AccountChange,
} from "../src/modules/users/user-safety.js";

test("CSV: formula-like text is neutralised with a leading apostrophe", () => {
  for (const dangerous of [
    "=1+1",
    "+SUM(A1)",
    "-2+3",
    "@SUM(A1)",
    "\t=1+1",
    "\r=1+1",
    " =1+1",
    "  \t@cmd",
    '=HYPERLINK("http://evil","x")',
  ]) {
    const cell = escapeCsvValue(dangerous);

    assert.ok(
      cell.startsWith(`"'`),
      `not neutralised: ${JSON.stringify(dangerous)} -> ${cell}`,
    );
  }
});

test("CSV: legitimate values are preserved and always quoted", () => {
  assert.equal(escapeCsvValue("Asha Rao"), '"Asha Rao"');
  assert.equal(escapeCsvValue("a=b"), '"a=b"');
  assert.equal(escapeCsvValue("x - y"), '"x - y"');
  assert.equal(escapeCsvValue("name@example.com"), '"name@example.com"');
  assert.equal(escapeCsvValue(""), '""');
  assert.equal(escapeCsvValue(null), "");
  assert.equal(escapeCsvValue(undefined), "");
  assert.equal(escapeCsvValue(80), '"80"');
  assert.equal(escapeCsvValue(-5), '"-5"');
  assert.equal(
    escapeCsvValue(new Date("2026-10-12T05:00:00.000Z")),
    '"2026-10-12T05:00:00.000Z"',
  );
});

test("CSV: commas, quotes and newlines stay valid", () => {
  assert.equal(escapeCsvValue('He said "hi", ok'), '"He said ""hi"", ok"');
  assert.equal(escapeCsvValue("line1\nline2"), '"line1\nline2"');
  assert.equal(escapeCsvValue('="x",1'), `"'=""x"",1"`);
});

test("CSV: a whole exported file neutralises every dangerous cell, header and rows", () => {
  const csv = createCsv(
    ["Name", "=Header"],
    [
      ["=1+1 Formula", "ok"],
      ["+91 98765 43210", "@x"],
      ["Plain", 3],
    ],
  );

  assert.equal(
    csv,
    [
      `"Name","'=Header"`,
      `"'=1+1 Formula","ok"`,
      `"'+91 98765 43210","'@x"`,
      `"Plain","3"`,
    ].join("\r\n"),
  );
});

const rejected = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "ftp://example.com/cv.pdf",
  "vbscript:msgbox(1)",
  "mailto:a@b.com",
  "//example.com/cv.pdf",
  "/relative/cv.pdf",
  "example.com/cv.pdf",
  "http:example.com",
  "http://",
  "https:///cv.pdf",
  "not a url",
  "",
];

const accepted = [
  "http://example.com/cv.pdf",
  "https://example.com/cv.pdf?x=1#top",
  "https://meet.example.com/abc-defg-hij",
  "HTTPS://Example.com",
  "http://localhost:3000/x",
  "  https://example.com/trimmed  ",
];

test("isHttpUrl accepts only absolute http/https URLs", () => {
  for (const value of rejected) {
    assert.equal(isHttpUrl(value), false, value);
  }
  for (const value of accepted.map((v) => v.trim())) {
    assert.equal(isHttpUrl(value), true, value);
  }
});

const candidateBase = { name: "Asha Rao", email: "asha@example.com" };
const interviewBase = {
  candidateId: "11111111-1111-4111-8111-111111111111",
  interviewerId: "22222222-2222-4222-8222-222222222222",
  scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
};

const fields: [string, (value: string) => boolean][] = [
  [
    "candidate create resumeUrl",
    (v) => createCandidateSchema.safeParse({ ...candidateBase, resumeUrl: v }).success,
  ],
  [
    "candidate update resumeUrl",
    (v) => updateCandidateSchema.safeParse({ resumeUrl: v }).success,
  ],
  [
    "interview create meetingLink",
    (v) => createInterviewSchema.safeParse({ ...interviewBase, meetingLink: v }).success,
  ],
  [
    "interview update meetingLink",
    (v) => updateInterviewSchema.safeParse({ meetingLink: v }).success,
  ],
  [
    "settings logoUrl",
    (v) => updateSettingsSchema.safeParse({ logoUrl: v }).success,
  ],
];

test("every backend URL field rejects unsafe or malformed values", () => {
  for (const [name, check] of fields) {
    for (const value of rejected) {
      assert.equal(check(value), false, `${name} accepted ${JSON.stringify(value)}`);
    }
  }
});

test("every backend URL field accepts valid http/https URLs", () => {
  for (const [name, check] of fields) {
    for (const value of accepted) {
      assert.equal(check(value), true, `${name} rejected ${JSON.stringify(value)}`);
    }
  }
});

test("URL fields stay optional and keep the 1000-character limit", () => {
  assert.equal(createCandidateSchema.safeParse(candidateBase).success, true);
  assert.equal(updateCandidateSchema.safeParse({}).success, true);
  assert.equal(updateSettingsSchema.safeParse({}).success, true);

  const long = "https://example.com/" + "a".repeat(990);
  assert.equal(long.length > 1000, true);
  assert.equal(updateCandidateSchema.safeParse({ resumeUrl: long }).success, false);
  assert.equal(
    updateCandidateSchema.safeParse({ resumeUrl: long.slice(0, 1000) }).success,
    true,
  );
});

test("the URL is trimmed before it is stored", () => {
  const parsed = updateCandidateSchema.parse({ resumeUrl: "  https://example.com/cv.pdf  " });
  assert.equal(parsed.resumeUrl, "https://example.com/cv.pdf");
});

const SA_ROLE = "role-super-admin";

function fakeDb(activeSuperAdminIds: string[], roleExists = true) {
  let call = 0;
  const calls = { count: 0 };
  const db = {
    $queryRaw: async () => {
      calls.count += 1;
      call += 1;
      if (call === 1) return roleExists ? [{ id: SA_ROLE }] : [];
      return activeSuperAdminIds.map((id) => ({ id }));
    },
  };
  return { db: db as never, calls };
}

async function outcome(
  admins: string[],
  actorId: string | undefined,
  targetId: string,
  change: AccountChange,
) {
  const { db } = fakeDb(admins);
  try {
    await assertAccountChangeAllowed(db, { actorId, targetId, change });
    return "allowed";
  } catch (error) {
    assert.ok(error instanceof UserSafetyError);
    return `${error.statusCode} ${error.code}`;
  }
}

test("a Super Admin cannot deactivate or delete their own account", async () => {
  assert.equal(
    await outcome(["a", "b"], "a", "a", { kind: "DEACTIVATE" }),
    "403 CANNOT_MODIFY_OWN_ACCOUNT",
  );
  assert.equal(
    await outcome(["a", "b"], "a", "a", { kind: "DELETE" }),
    "403 CANNOT_MODIFY_OWN_ACCOUNT",
  );
});

test("a Super Admin cannot remove their own Super Admin role", async () => {
  assert.equal(
    await outcome(["a", "b"], "a", "a", { kind: "SET_ROLES", roleIds: ["other"] }),
    "403 CANNOT_MODIFY_OWN_ACCOUNT",
  );
});

test("the last active Super Admin cannot be deactivated, deleted or demoted", async () => {
  assert.equal(
    await outcome(["a"], "x", "a", { kind: "DEACTIVATE" }),
    "409 LAST_SUPER_ADMIN_PROTECTED",
  );
  assert.equal(
    await outcome(["a"], "x", "a", { kind: "DELETE" }),
    "409 LAST_SUPER_ADMIN_PROTECTED",
  );
  assert.equal(
    await outcome(["a"], "x", "a", { kind: "SET_ROLES", roleIds: ["other"] }),
    "409 LAST_SUPER_ADMIN_PROTECTED",
  );
});

test("another Super Admin may still be deactivated, deleted or demoted when one remains", async () => {
  assert.equal(await outcome(["a", "b"], "a", "b", { kind: "DEACTIVATE" }), "allowed");
  assert.equal(await outcome(["a", "b"], "a", "b", { kind: "DELETE" }), "allowed");
  assert.equal(
    await outcome(["a", "b"], "a", "b", { kind: "SET_ROLES", roleIds: ["other"] }),
    "allowed",
  );
});

test("ordinary users and role edits that keep Super Admin are unaffected", async () => {
  assert.equal(await outcome(["a"], "a", "u1", { kind: "DEACTIVATE" }), "allowed");
  assert.equal(await outcome(["a"], "a", "u1", { kind: "DELETE" }), "allowed");
  assert.equal(
    await outcome(["a"], "x", "a", { kind: "SET_ROLES", roleIds: [SA_ROLE, "other"] }),
    "allowed",
  );
  assert.equal(
    await outcome(["a"], "a", "a", { kind: "SET_ROLES", roleIds: [SA_ROLE] }),
    "allowed",
  );
});

test("an inactive last Super Admin record does not count as protected", async () => {

  assert.equal(await outcome(["b"], "b", "a", { kind: "DELETE" }), "allowed");
});

test("the guard takes the role lock before reading the Super Admin list", async () => {
  const { db, calls } = fakeDb(["a", "b"]);
  await assertAccountChangeAllowed(db, {
    actorId: "a",
    targetId: "b",
    change: { kind: "DEACTIVATE" },
  });
  assert.equal(calls.count, 2);
});
