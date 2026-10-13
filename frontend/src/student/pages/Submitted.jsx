import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

import Shell from "../components/Shell.jsx";
import { leaveFullscreen } from "../fullscreen.js";

export default function Submitted() {
  useEffect(() => {
    leaveFullscreen();
  }, []);

  return (
    <Shell narrow>
      <section className="card card--form stack center" role="status" aria-labelledby="sub-title">
        <CheckCircle2 size={48} className="okicon" aria-hidden="true" />
        <h1 id="sub-title">Assessment submitted</h1>
        <p>Your assessment has been submitted successfully.</p>
        <p className="muted">Thank you. Your answers are saved with the recruitment team. Results are not shown in the portal; the team will contact you about the next steps. You do not need to do anything else.</p>
        <div className="row row--center">
          <Link className="btn btn--primary" to="/">Back to home</Link>
          <Link className="btn btn--outline" to="/interviews">My interviews</Link>
        </div>
      </section>
    </Shell>
  );
}
