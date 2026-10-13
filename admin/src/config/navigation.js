import {
  BarChart3,
  BookOpenCheck,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  ScrollText,
  School,
  Settings,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";

export const NAV_GROUPS = [
  {
    label: "Overview",
    headingIcon: LayoutDashboard,
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", anyOf: ["reports.view"], ready: true },
    ],
  },
  {
    label: "People",
    headingIcon: Users,
    items: [
      { id: "users", label: "Users & roles", icon: Users, path: "/users", anyOf: ["users.manage"], ready: true },
      { id: "colleges", label: "Colleges", icon: Building2, path: "/colleges", anyOf: ["colleges.manage"], ready: true },
    ],
  },
  {
    label: "Recruitment",
    id: "recruitment",
    icon: Briefcase,
    collapsible: true,
    items: [
      { id: "drives", label: "Drives", icon: Briefcase, path: "/drives", anyOf: ["drives.manage"], ready: true },
      {
        id: "students",
        label: "Students",
        icon: GraduationCap,
        path: "/students",
        anyOf: ["candidates.register", "testStatus.monitor"],
        ready: true,
      },
      { id: "candidates", label: "Candidates", icon: UserRound, path: "/candidates", anyOf: ["candidates.manage"], ready: true },
      {
        id: "interviews",
        label: "Interviews",
        icon: CalendarClock,
        path: "/interviews",
        anyOf: ["interviews.schedule", "interviews.feedback"],
        ready: true,
      },
    ],
  },
  {
    label: "Assessment",
    headingIcon: BookOpenCheck,
    items: [
      { id: "questions", label: "Question bank", icon: BookOpenCheck, path: "/questions", anyOf: ["questions.manage"], ready: true },
      { id: "templates", label: "Test templates", icon: ClipboardList, path: "/templates", anyOf: ["tests.manage"], ready: true },
    ],
  },
  {
    label: "Insights",
    headingIcon: BarChart3,
    items: [
      {
        id: "decisions",
        label: "Shortlisting",
        icon: CheckCheck,
        path: "/decisions",
        anyOf: ["candidates.shortlist", "candidates.reject"],
        anyRole: ["SUPER_ADMIN", "HR_ADMIN"],
        ready: true,
      },
      {
        id: "placement",
        label: "College overview",
        icon: School,
        path: "/placement",
        anyOf: ["results.view"],
        anyRole: ["HOD", "STAFF"],
        ready: true,
        portal: true,
      },
      {
        id: "results",
        label: "Results & ranking",
        icon: Trophy,
        path: "/results",
        anyOf: ["results.view"],
        anyRole: ["SUPER_ADMIN", "HR_ADMIN", "HOD", "STAFF"],
        ready: true,
        portal: true,
      },
      { id: "reports", label: "Reports", icon: BarChart3, path: "/reports", anyOf: ["reports.view"], ready: true },
    ],
  },
  {
    label: "System",
    headingIcon: Settings,
    items: [
      { id: "settings", label: "Settings", icon: Settings, path: "/settings", anyOf: ["settings.manage"], ready: true },
      { id: "audit", label: "Audit log", icon: ScrollText, path: "/audit-logs", anyOf: ["audit.view"], ready: true },
    ],
  },
];

export function hasAnyPermission(user, anyOf) {
  const held = user?.permissions ?? [];

  return anyOf.some((permission) => held.includes(permission));
}

export function hasAnyRole(user, anyOf) {
  const held = user?.roles ?? [];

  return anyOf.some((role) => held.includes(role));
}

function allowed(user, item) {
  return hasAnyPermission(user, item.anyOf) && (!item.anyRole || hasAnyRole(user, item.anyRole));
}

export const PORTALS = {
  admin: { base: "", loginPath: "/login", home: null, name: "Admin console" },
  hod: { base: "/hod", loginPath: "/hod/login", home: "/hod/results", name: "HOD portal", role: "HOD" },
  staff: { base: "/staff", loginPath: "/staff/login", home: "/staff/results", name: "Staff portal", role: "STAFF" },
};

export function portalOf(pathname) {
  if (pathname === "/hod" || pathname.startsWith("/hod/")) return "hod";
  if (pathname === "/staff" || pathname.startsWith("/staff/")) return "staff";

  return "admin";
}

export function getVisibleNav(user, portal = "admin") {
  const base = PORTALS[portal].base;

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => allowed(user, item) && (portal === "admin" || item.portal))
      .map((item) => ({ ...item, path: `${base}${item.path}` })),
  })).filter((group) => group.items.length > 0);
}

export function homePathFor(user, portal = "admin") {
  if (portal !== "admin") {
    return PORTALS[portal].home;
  }

  if (hasAnyPermission(user, ["reports.view"])) {
    return "/dashboard";
  }

  const first = getVisibleNav(user)
    .flatMap((group) => group.items)
    .find((item) => item.ready);

  return first ? first.path : "/overview";
}

export const ROUTE_TITLES = {
  "/dashboard": "Dashboard",
  "/overview": "Overview",
  "/users": "Users & roles",
  "/colleges": "Colleges",
  "/drives": "Drives",
  "/students": "Students",
  "/candidates": "Candidates",
  "/interviews": "Interviews",
  "/questions": "Question bank",
  "/templates": "Test templates",
  "/decisions": "Shortlisting",
  "/results": "Results & ranking",
  "/hod/results": "Results & ranking",
  "/staff/results": "Results & ranking",
  "/placement": "College overview",
  "/hod/placement": "College overview",
  "/staff/placement": "College overview",
  "/reports": "Reports",
  "/settings": "Settings",
  "/audit-logs": "Audit log",
};

export const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  CAMPUS_COORDINATOR: "Campus Coordinator",
  INTERVIEWER: "Interviewer",
  CANDIDATE: "Candidate",
  HOD: "HOD",
  STAFF: "Staff",
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}
