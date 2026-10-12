import { useEffect, useState } from "react";
import {
  Users,
  Building2,
  GraduationCap,
  UserRound,
} from "lucide-react";

import PageHeader from "../../components/layout/PageHeader.jsx";
import {
  ErrorPanel,
  StatCard,
} from "../../components/dashboard/DashboardParts.jsx";
import { getDashboardStats } from "../../services/dashboard.service.js";

const statCards = [
  { key: "totalUsers", label: "Active Users", icon: Users },
  { key: "totalColleges", label: "Active Colleges", icon: Building2 },
  { key: "totalDrives", label: "Active Drives", icon: GraduationCap },
  { key: "totalCandidates", label: "Active Candidates", icon: UserRound },
];

// Dashboard for roles holding `reports.view` (SUPER_ADMIN, HR_ADMIN).
// Uses GET /dashboard/stats.
export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadStats() {
    setLoading(true);
    setError(null);

    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (err) {
      setStats(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your recruitment activity at a glance."
      />

      {error && <ErrorPanel error={error} onRetry={loadStats} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ key, label, icon }) => {
          const value = stats?.[key];

          return (
            <StatCard
              key={key}
              label={label}
              icon={icon}
              loading={loading}
              value={typeof value === "number" ? value : null}
            />
          );
        })}
      </div>
    </div>
  );
}
