import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import Login from "../pages/auth/Login.jsx";
import Dashboard from "../pages/dashboard/Dashboard.jsx";
import Colleges from "../pages/colleges/Colleges.jsx";
import Users from "../pages/users/Users.jsx";
import Drives from "../pages/drives/Drives.jsx";
import Candidates from "../pages/candidates/Candidates.jsx";
import CandidateDetails from "../pages/candidates/CandidateDetails.jsx";
import Interviews from "../pages/interviews/Interviews.jsx";
import InterviewDetails from "../pages/interviews/InterviewDetails.jsx";
import MyInterviews from "../pages/interviewer/MyInterviews.jsx";
import Reports from "../pages/reports/Reports.jsx";
import Settings from "../pages/settings/Settings.jsx";
import AuditLogs from "../pages/audit-logs/AuditLogs.jsx";
import Feedback from "../pages/interviewer/Feedback.jsx";
import InterviewerDashboard from "../pages/interviewer/InterviewerDashboard.jsx";
import CandidateDashboard from "../pages/candidate/CandidateDashboard.jsx";

import AdminLayout from "../layouts/AdminLayout.jsx";
import InterviewerLayout from "../layouts/InterviewerLayout.jsx";
import CandidateLayout from "../layouts/CandidateLayout.jsx";

import RequirePermission from "../components/auth/RequirePermission.jsx";
import { useAuth } from "../hooks/useAuth.js";

const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "CAMPUS_COORDINATOR",
];

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500" role="status">
        Checking your session...
      </p>
    </main>
  );
}

function getHomePath(user) {
  const roles = Array.isArray(user?.roles)
    ? user.roles
    : [];

  if (roles.some((role) => ADMIN_ROLES.includes(role))) {
    return "/admin";
  }

  if (roles.includes("INTERVIEWER")) {
    return "/interviewer";
  }

  if (roles.includes("CANDIDATE")) {
    return "/candidate";
  }

  return "/unauthorized";
}

// Returns the page the user originally requested, but only if it lies under
// their own role's route prefix; otherwise their home path.
function getPostLoginPath(user, from) {
  const home = getHomePath(user);

  if (!from || typeof from.pathname !== "string") {
    return home;
  }

  const { pathname } = from;

  if (pathname === home || pathname.startsWith(`${home}/`)) {
    return `${pathname}${from.search || ""}${from.hash || ""}`;
  }

  return home;
}

function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  if (allowedRoles?.length) {
    const userRoles = Array.isArray(user?.roles)
      ? user.roles
      : [];

    const hasAllowedRole = allowedRoles.some((role) =>
      userRoles.includes(role),
    );

    if (!hasAllowedRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}

function RoleRedirect() {
  const { user } = useAuth();

  return <Navigate to={getHomePath(user)} replace />;
}

// The single place that redirects an authenticated user away from /login,
// both after a successful sign-in and when an existing session is restored.
function LoginRoute() {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return (
      <Navigate
        to={getPostLoginPath(user, location.state?.from)}
        replace
      />
    );
  }

  return <Login />;
}

function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <h1 className="text-2xl font-bold text-gray-900">
        Access denied
      </h1>

      <p className="mt-2 max-w-md text-sm text-gray-600">
        Your account does not have access to this page.
        Please contact your administrator if you need access.
      </p>

      <button
        type="button"
        onClick={() => {
          window.location.replace("/login");
        }}
        className="mt-5 rounded-lg bg-[#1B3A1E] px-4 py-2 text-sm font-medium text-white hover:bg-[#254d29]"
      >
        Return to login
      </button>
    </main>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        index: true,
        element: <RoleRedirect />,
      },
    ],
  },
  {
    path: "/login",
    element: <LoginRoute />,
  },
  {
    path: "/unauthorized",
    element: <UnauthorizedPage />,
  },
  {
    path: "/admin",
    element: <ProtectedRoute allowedRoles={ADMIN_ROLES} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            index: true,
            element: <Dashboard />,
          },
          {
            path: "users",
            element: (
              <RequirePermission permission="users.manage">
                <Users />
              </RequirePermission>
            ),
          },
          {
            path: "drives",
            element: (
              <RequirePermission permission="drives.manage">
                <Drives />
              </RequirePermission>
            ),
          },
          {
            path: "candidates",
            element: (
              <RequirePermission permission="candidates.manage">
                <Candidates />
              </RequirePermission>
            ),
          },
          {
            path: "candidates/:candidateId",
            element: (
              <RequirePermission permission="candidates.manage">
                <CandidateDetails />
              </RequirePermission>
            ),
          },
          {
            path: "interviews",
            element: (
              <RequirePermission permission="interviews.schedule">
                <Interviews />
              </RequirePermission>
            ),
          },
          {
            path: "interviews/:interviewId",
            element: (
              <RequirePermission permission="interviews.schedule">
                <InterviewDetails mode="admin" />
              </RequirePermission>
            ),
          },
          {
            path: "reports",
            element: (
              <RequirePermission permission="reports.view">
                <Reports />
              </RequirePermission>
            ),
          },
          {
            path: "settings",
            element: (
              <RequirePermission permission="settings.manage">
                <Settings />
              </RequirePermission>
            ),
          },
          {
            path: "audit-logs",
            element: (
              <RequirePermission permission="audit.view">
                <AuditLogs />
              </RequirePermission>
            ),
          },
          {
            path: "colleges",
            element: (
              <RequirePermission permission="colleges.manage">
                <Colleges />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
  {
    path: "/interviewer",
    element: <ProtectedRoute allowedRoles={["INTERVIEWER"]} />,
    children: [
      {
        element: <InterviewerLayout />,
        children: [
          {
            index: true,
            element: <InterviewerDashboard />,
          },
          {
            path: "interviews",
            element: (
              <RequirePermission permission="interviews.feedback">
                <MyInterviews />
              </RequirePermission>
            ),
          },
          {
            path: "interviews/:interviewId",
            element: (
              <RequirePermission permission="interviews.feedback">
                <InterviewDetails mode="interviewer" />
              </RequirePermission>
            ),
          },
          {
            path: "feedback",
            element: (
              <RequirePermission permission="interviews.feedback">
                <Feedback />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
  {
    path: "/candidate",
    element: <ProtectedRoute allowedRoles={["CANDIDATE"]} />,
    children: [
      {
        element: <CandidateLayout />,
        children: [
          {
            index: true,
            element: <CandidateDashboard />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);

export default router;
