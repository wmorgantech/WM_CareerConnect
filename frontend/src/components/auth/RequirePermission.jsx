import { ShieldAlert } from "lucide-react";

import { usePermissions } from "../../hooks/usePermissions.js";

// Renders its children only when the signed-in user holds `permission`;
// otherwise shows an in-layout "no access" message. This is a UI guard
// only: the API enforces the same permission on every request.
export default function RequirePermission({ permission, children }) {
  const { hasPermission } = usePermissions();

  if (hasPermission(permission)) {
    return children;
  }

  return (
    <section
      className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center"
      role="alert"
    >
      <ShieldAlert
        aria-hidden="true"
        className="mx-auto text-[#D32F2F]"
        size={28}
      />
      <h1 className="mt-3 font-semibold text-gray-800">Access denied</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
        Your account does not have permission to view this page. Contact
        your administrator if you need access.
      </p>
    </section>
  );
}
