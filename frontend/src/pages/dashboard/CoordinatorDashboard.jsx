import { Building2 } from "lucide-react";

import PageHeader from "../../components/layout/PageHeader.jsx";
import { useAuth } from "../../hooks/useAuth.js";

// Campus Coordinator overview.
//
// Intentionally makes no API calls: the existing college, drive, candidate,
// interview and dashboard endpoints require colleges.manage, drives.manage,
// candidates.manage, interviews.* or reports.view, none of which the
// CAMPUS_COORDINATOR role holds. A coordinator-scoped endpoint (for example
// GET /dashboard/coordinator, limited to assigned colleges/drives) would be
// needed to show real data here.
export default function CoordinatorDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome${user?.name ? `, ${user.name}` : ""}.`}
      />

      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <Building2
          size={28}
          className="mx-auto text-[#1B3A1E]"
          aria-hidden="true"
        />

        <h2 className="mt-3 font-semibold text-gray-800">
          Placement overview coming soon
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Summaries of your colleges and placement drives will appear
          here once they are available for the Campus Coordinator
          role. No figures are shown until then.
        </p>
      </section>
    </div>
  );
}
