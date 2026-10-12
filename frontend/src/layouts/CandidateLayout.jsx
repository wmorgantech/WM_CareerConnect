import {
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  UserRound,
  Video,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

// `available: true` means the route is registered in app/routes.jsx.
// Items without it are shown as "Coming soon" until their pages are routed.
const menuItems = [
  {
    label: "Dashboard",
    path: "/candidate",
    icon: LayoutDashboard,
    available: true,
  },
  {
    label: "My Profile",
    path: "/candidate/profile",
    icon: UserRound,
  },
  {
    label: "Applications",
    path: "/candidate/applications",
    icon: FileText,
  },
  {
    label: "Tests",
    path: "/candidate/tests",
    icon: ClipboardCheck,
  },
  {
    label: "Interviews",
    path: "/candidate/interviews",
    icon: Video,
  },
];

export default function CandidateLayout() {
  const { user, logout } = useAuth();

  const initials =
    user?.name
      ?.split(" ")
      .map((part) => part.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "CA";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-[#1B3A1E] text-white">
        {/* Brand */}
        <div className="h-16 px-5 flex items-center border-b border-white/10">
          <div>
            <h1 className="text-lg font-bold">
              WM CareerConnect
            </h1>

            <p className="text-xs text-white/60 mt-0.5">
              Candidate Portal
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;

            if (!item.available) {
              return (
                <div
                  key={item.path}
                  aria-disabled="true"
                  title="Coming soon"
                  className="flex items-center gap-3 min-h-11 px-3 rounded-lg text-sm font-medium text-white/40 cursor-not-allowed"
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
                end
                className={({ isActive }) =>
                  [
                    "flex items-center gap-3",
                    "min-h-11 px-3 rounded-lg",
                    "text-sm font-medium transition",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")
                }
              >
                <Icon
                  size={18}
                  strokeWidth={1.8}
                />

                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2 mb-2">
            <div className="w-9 h-9 shrink-0 rounded-full bg-white/15 flex items-center justify-center text-xs font-semibold">
              {initials}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.name || "Candidate"}
              </p>

              <p className="text-xs text-white/50 truncate">
                {user?.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="w-full min-h-11 px-3 rounded-lg flex items-center gap-3 text-sm text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <LogOut
              size={18}
              strokeWidth={1.8}
            />

            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-9 h-9 rounded-lg bg-green-100 text-green-800 flex items-center justify-center">
              <UserRound size={19} />
            </div>

            <div>
              <p className="text-xs text-gray-500">
                Candidate Portal
              </p>

              <h2 className="text-base font-semibold text-gray-900">
                {user?.name || "Candidate"}
              </h2>
            </div>
          </div>

          <div className="w-9 h-9 rounded-full bg-green-100 text-green-800 flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}