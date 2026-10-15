import { Navigate, Outlet, useLocation } from "react-router-dom";

import ErrorState from "../components/feedback/ErrorState.jsx";
import LoadingState from "../components/feedback/LoadingState.jsx";
import { PORTALS, portalOf, portalRedirect } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";
import { getErrorMessage } from "../utils/errors.js";

export default function ProtectedRoute() {
  const { status, user, portal, restoreError, retryRestore, sessionExpired, signedOutByUser } =
    useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <LoadingState fullscreen label="Restoring your session…" />;
  }

  if (status === "error") {
    return (
      <ErrorState
        fullscreen
        title="Can't reach the server"
        message={getErrorMessage(restoreError)}
        onRetry={retryRestore}
      />
    );
  }

  if (status !== "signedIn") {
    return (
      <Navigate
        to={PORTALS[portalOf(location.pathname)].loginPath}
        replace
        state={
          signedOutByUser
            ? null
            : { from: location, expired: sessionExpired }
        }
      />
    );
  }

  // Leaving the portal the session signed in through would switch the client header on the next
  // refresh, find no cookie, and end the session. Stay inside it.
  const inPortal = portalRedirect(location.pathname, portal, user);

  if (inPortal) {
    return <Navigate to={inPortal} replace />;
  }

  return <Outlet />;
}
