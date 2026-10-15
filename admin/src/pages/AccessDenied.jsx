import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { homePathFor } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";

export default function AccessDenied() {
  const { user, portal } = useAuth();

  return (
    <section className="state" role="alert">
      <ShieldAlert className="state__icon state__icon--danger" size={28} aria-hidden="true" />
      <h1 className="state__title">Access denied</h1>
      <p className="state__text">
        Your account doesn't have permission to view this page. Contact a
        Super Admin if you need access.
      </p>
      <Link to={homePathFor(user, portal ?? "admin")} className="btn btn--outline">
        Back to start
      </Link>
    </section>
  );
}
