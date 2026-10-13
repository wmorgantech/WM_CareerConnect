import { Lock } from "lucide-react";

import { getVisibleNav, roleLabel } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";

export default function Overview() {
  const { user } = useAuth();
  const hasModules = getVisibleNav(user).length > 0;
  const roles = (user?.roles ?? []).map(roleLabel);

  if (hasModules) {
    return (
      <section className="state">
        <h1 className="state__title">Welcome{user?.name ? `, ${user.name}` : ""}</h1>
        <p className="state__text">Choose a module from the navigation.</p>
      </section>
    );
  }

  return (
    <section className="state" role="status">
      <Lock className="state__icon" size={28} aria-hidden="true" />
      <h1 className="state__title">Admin access isn't available for your account</h1>
      <p className="state__text">
        {roles.length > 0 ? `Your role (${roles.join(", ")}) has` : "Your account has"} no tools in the admin console yet. If you
        expected access, contact a Super Admin.
      </p>
    </section>
  );
}
