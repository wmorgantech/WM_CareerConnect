import {
  BarChart3,
  Building2,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  MessageCircleQuestion,
  Settings,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";

// `available: true` means the route is registered in app/routes.jsx.
// Items without it are shown as "Coming soon" until their pages are routed.
const menuItems = [
  {
    label: "Dashboard",
    path: "/admin",
    icon: LayoutDashboard,
    available: true,
  },
  {
    label: "Users & Roles",
    path: "/admin/users",
    icon: Users,
    permission: "users.manage",
    available: true,
  },
  {
    label: "Colleges",
    path: "/admin/colleges",
    icon: Building2,
    permission: "colleges.manage",
    available: true,
  },
  {
    label: "Drives",
    path: "/admin/drives",
    icon: GraduationCap,
    permission: "drives.manage",
    available: true,
  },
  {
    label: "Candidates",
    path: "/admin/candidates",
    icon: Users,
    permission: "candidates.manage",
    available: true,
  },
  {
    label: "Questions",
    path: "/admin/questions",
    icon: MessageCircleQuestion,
    permission: "questions.manage",
  },
  {
    label: "Tests",
    path: "/admin/tests",
    icon: ClipboardCheck,
    permission: "tests.manage",
  },
  {
    label: "Interviews",
    path: "/admin/interviews",
    icon: Video,
    permission: "interviews.schedule",
    available: true,
  },
  {
    label: "Reports",
    path: "/admin/reports",
    icon: BarChart3,
    permission: "reports.view",
    available: true,
  },
  {
    label: "Settings",
    path: "/admin/settings",
    icon: Settings,
    permission: "settings.manage",
    available: true,
  },
  {
    label: "Audit Logs",
    path: "/admin/audit-logs",
    icon: ShieldCheck,
    permission: "audit.view",
    available: true,
  },
];

function getRoleLabel(roles = []) {
  if (roles.includes("SUPER_ADMIN")) {
    return "Super Admin";
  }

  if (roles.includes("HR_ADMIN")) {
    return "HR / Recruitment Admin";
  }

  if (roles.includes("CAMPUS_COORDINATOR")) {
    return "Campus Coordinator";
  }

  return "Administrator";
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();

  const visibleMenuItems = menuItems.filter(
    (item) =>
      !item.permission || hasPermission(item.permission),
  );

  const roleLabel = getRoleLabel(user?.roles);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-64 shrink-0 flex-col bg-[#1B3A1E] text-white md:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <div>
            <h1 className="text-lg font-bold">
              WM CareerConnect
            </h1>

            <p className="mt-0.5 text-xs text-white/60">
              {roleLabel}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;

            if (!item.available) {
              return (
                <div
                  key={item.path}
                  aria-disabled="true"
                  title="Coming soon"
                  className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/40"
                >
                  <Icon size={18} strokeWidth={1.8} />
                  <span className="min-w-0 flex-1 truncate">
                    {item.label}
                  </span>
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
                    Coming soon
                  </span>
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin"}
                className={({ isActive }) =>
                  [
                    "flex min-h-11 items-center gap-3 rounded-lg px-3",
                    "text-sm font-medium transition",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")
                }
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="mb-2 px-3 py-2">
            <p className="truncate text-sm font-medium">
              {user?.name || "User"}
            </p>

            <p className="truncate text-xs text-white/50">
              {user?.email}
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="min-h-11 w-full rounded-lg px-3 text-left text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6">
          <div>
            <p className="text-sm text-gray-500">
              {roleLabel}
            </p>

            <h2 className="text-base font-semibold text-gray-900">
              {user?.name || "Dashboard"}
            </h2>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800">
            {user?.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
