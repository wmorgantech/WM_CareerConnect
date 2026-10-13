import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <section className="state">
      <h1 className="state__title">Page not found</h1>
      <p className="state__text">That page doesn't exist or isn't available yet.</p>
      <Link to="/" className="btn btn--outline">
        Back to start
      </Link>
    </section>
  );
}
