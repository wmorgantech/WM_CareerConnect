import { ClipboardList } from "lucide-react";

import PageHeader from "../../components/layout/PageHeader.jsx";
import { useAuth } from "../../hooks/useAuth.js";

// Candidate overview.
//
// Intentionally makes no API calls: there is no candidate-scoped endpoint.
// Candidate records are not linked to user accounts, /candidates requires
// candidates.manage, and no application or test API exists. A self-scoped
// "my applications / tests / interviews" endpoint is required before this
// page can show real data.
export default function CandidateDashboard() {
  const { user } = useAuth();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome${user?.name ? `, ${user.name}` : ""}.`}
      />

      <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <ClipboardList
          size={28}
          className="mx-auto text-[#1B3A1E]"
          aria-hidden="true"
        />

        <h2 className="mt-3 font-semibold text-gray-800">
          Your progress will appear here
        </h2>

        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          Your applications, tests and interview status will be shown
          here once they are available.
        </p>
      </section>
    </div>
  );
}
