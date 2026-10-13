import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "../components/layout/AdminLayout.jsx";
import { homePathFor } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";
import AccessDenied from "../pages/AccessDenied.jsx";
import AuditLogsPage from "../pages/audit/AuditLogsPage.jsx";
import CandidatesPage from "../pages/candidates/CandidatesPage.jsx";
import CollegesPage from "../pages/colleges/CollegesPage.jsx";
import Dashboard from "../pages/Dashboard.jsx";
import DecisionsPage from "../pages/decisions/DecisionsPage.jsx";
import DrivesPage from "../pages/drives/DrivesPage.jsx";
import InterviewsPage from "../pages/interviews/InterviewsPage.jsx";
import QuestionsPage from "../pages/questions/QuestionsPage.jsx";
import PlacementPage from "../pages/placement/PlacementPage.jsx";
import ResultsPage from "../pages/results/ResultsPage.jsx";
import StudentsPage from "../pages/students/StudentsPage.jsx";
import TemplatesPage from "../pages/templates/TemplatesPage.jsx";
import Login from "../pages/Login.jsx";
import NotFound from "../pages/NotFound.jsx";
import Overview from "../pages/Overview.jsx";
import ReportsPage from "../pages/reports/ReportsPage.jsx";
import SettingsPage from "../pages/settings/SettingsPage.jsx";
import UsersPage from "../pages/users/UsersPage.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import RequirePermission from "./RequirePermission.jsx";

function HomeRedirect() {
  const { user } = useAuth();

  return <Navigate to={homePathFor(user)} replace />;
}

function guarded(anyOf, element, anyRole) {
  return <RequirePermission anyOf={anyOf} anyRole={anyRole}>{element}</RequirePermission>;
}

const RESULT_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "HOD", "STAFF"];

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/hod/login" element={<Login portal="hod" />} />
      <Route path="/staff/login" element={<Login portal="staff" />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={guarded(["reports.view"], <Dashboard />)} />
          <Route path="users" element={guarded(["users.manage"], <UsersPage />)} />
          <Route path="colleges" element={guarded(["colleges.manage"], <CollegesPage />)} />
          <Route path="drives" element={guarded(["drives.manage"], <DrivesPage />)} />
          <Route path="candidates" element={guarded(["candidates.manage"], <CandidatesPage />)} />
          <Route path="interviews" element={guarded(["interviews.schedule", "interviews.feedback"], <InterviewsPage />)} />
          <Route path="students" element={guarded(["candidates.register", "testStatus.monitor"], <StudentsPage />)} />
          <Route path="questions" element={guarded(["questions.manage"], <QuestionsPage />)} />
          <Route path="templates" element={guarded(["tests.manage"], <TemplatesPage />)} />
          <Route path="decisions" element={guarded(["candidates.shortlist", "candidates.reject"], <DecisionsPage />, ["SUPER_ADMIN", "HR_ADMIN"])} />
          <Route path="results" element={guarded(["results.view"], <ResultsPage />, RESULT_ROLES)} />
          <Route path="placement" element={guarded(["results.view"], <PlacementPage />, ["HOD", "STAFF"])} />
          <Route path="hod" element={<Navigate to="/hod/results" replace />} />
          <Route path="hod/results" element={guarded(["results.view"], <ResultsPage />, ["HOD"])} />
          <Route path="hod/placement" element={guarded(["results.view"], <PlacementPage />, ["HOD"])} />
          <Route path="staff" element={<Navigate to="/staff/results" replace />} />
          <Route path="staff/results" element={guarded(["results.view"], <ResultsPage />, ["STAFF"])} />
          <Route path="staff/placement" element={guarded(["results.view"], <PlacementPage />, ["STAFF"])} />
          <Route path="reports" element={guarded(["reports.view"], <ReportsPage />)} />
          <Route path="settings" element={guarded(["settings.manage"], <SettingsPage />)} />
          <Route path="audit-logs" element={guarded(["audit.view"], <AuditLogsPage />)} />
          <Route path="overview" element={<Overview />} />
          <Route path="access-denied" element={<AccessDenied />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
