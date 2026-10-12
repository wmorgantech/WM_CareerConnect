import { usePermissions } from "../../hooks/usePermissions.js";

import AdminDashboard from "./AdminDashboard.jsx";
import CoordinatorDashboard from "./CoordinatorDashboard.jsx";

// Entry for /admin. The statistics dashboard needs `reports.view`
// (GET /dashboard/stats); admin-area roles without it get the
// coordinator overview instead of a request that would return 403.
export default function Dashboard() {
  const { hasPermission } = usePermissions();

  if (hasPermission("reports.view")) {
    return <AdminDashboard />;
  }

  return <CoordinatorDashboard />;
}
