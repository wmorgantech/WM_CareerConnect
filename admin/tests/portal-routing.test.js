import assert from "node:assert/strict";
import test from "node:test";
import { hashRouteFor, portalRedirect } from "../src/config/navigation.js";

const hod = { roles: ["HOD"], permissions: ["results.view"] };
const staff = { roles: ["STAFF"], permissions: ["results.view"] };
const hr = { roles: ["HR_ADMIN"], permissions: ["reports.view", "results.view"] };

test("a HOD or Staff session that strays to an unprefixed URL is sent back into its own portal", () => {
  assert.equal(portalRedirect("/", "hod", hod), "/hod/results");
  assert.equal(portalRedirect("/placement", "hod", hod), "/hod/results");
  assert.equal(portalRedirect("/results", "staff", staff), "/staff/results");
  assert.equal(portalRedirect("/staff/results", "hod", hod), "/hod/results");
  assert.equal(portalRedirect("/hod/results", "staff", staff), "/staff/results");
});

test("a session inside its own portal is left alone", () => {
  assert.equal(portalRedirect("/hod/results", "hod", hod), null);
  assert.equal(portalRedirect("/hod/placement", "hod", hod), null);
  assert.equal(portalRedirect("/staff/placement", "staff", staff), null);
  assert.equal(portalRedirect("/dashboard", "admin", hr), null);
});

test("an admin-portal session cannot wander into the HOD or Staff URLs", () => {
  assert.equal(portalRedirect("/hod/results", "admin", hr), "/dashboard");
  assert.equal(portalRedirect("/staff/login", "admin", hr), "/dashboard");
});

test("nothing is redirected before the portal is known", () => {
  assert.equal(portalRedirect("/placement", null, null), null);
});

test("deep links without the hash are converted to the hash form", () => {
  assert.equal(hashRouteFor("/hod/login"), "/#/hod/login");
  assert.equal(hashRouteFor("/staff/login"), "/#/staff/login");
  assert.equal(hashRouteFor("/hod"), "/#/hod");
  assert.equal(hashRouteFor("/staff/results", "?driveId=1"), "/#/staff/results?driveId=1");
});

test("links that already have a hash, or are not portal links, are left alone", () => {
  assert.equal(hashRouteFor("/hod/login", "", "#/hod/login"), null);
  assert.equal(hashRouteFor("/", "", ""), null);
  assert.equal(hashRouteFor("/login"), null);
  assert.equal(hashRouteFor("/hodgepodge/login"), null);
  assert.equal(hashRouteFor("/staffing"), null);
});
