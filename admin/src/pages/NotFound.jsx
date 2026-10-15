import { Link } from "react-router-dom";

import { homePathFor } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";

export default function NotFound() {
  const { user, portal } = useAuth();

  return (
    <section className="state">
      <h1 className="state__title">Page not found</h1>
      <p className="state__text">That page doesn't exist or isn't available yet.</p>
      <Link to={homePathFor(user, portal ?? "admin")} className="btn btn--outline">
        Back to start
      </Link>
    </section>
  );
}
