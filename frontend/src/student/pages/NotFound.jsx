import { Link } from "react-router-dom";

import Shell from "../components/Shell.jsx";
import { EmptyState } from "../ui.jsx";

export default function NotFound() {
  return (
    <Shell narrow>
      <section className="card">
        <EmptyState title="Page not found">That page does not exist in the student portal.</EmptyState>
        <div className="row row--center">
          <Link className="btn btn--primary" to="/">Go to home</Link>
        </div>
      </section>
    </Shell>
  );
}
