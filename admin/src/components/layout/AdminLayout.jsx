import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { homePathFor, portalOf, ROUTE_TITLES } from "../../config/navigation.js";
import AdminHeader from "./AdminHeader.jsx";
import AdminSidebar from "./AdminSidebar.jsx";
import { useAuth } from "../../hooks/useAuth.js";

export default function AdminLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const portal = portalOf(pathname);
  const homePath = homePathFor(user, portal);

useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const title = ROUTE_TITLES[pathname] ?? "Not found";

  // The page's own heading is the only title on screen; the browser tab mirrors it.
  useEffect(() => {
    document.title = `${title} · CareerConnect`;
  }, [title]);

  return (
    <div className="shell">
      <AdminHeader navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />

      <div className="shell__body">
        <AdminSidebar open={navOpen} onClose={() => setNavOpen(false)} />

        <div className="shell__main">
          <main className="page" id="main">
            {pathname !== homePath ? (
              <button
                type="button"
                className="mobile-back"
                onClick={() => {
                  if ((window.history.state?.idx ?? 0) > 0) {
                    navigate(-1);
                  } else {
                    navigate(homePath, { replace: true });
                  }
                }}
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span>Back</span>
              </button>
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
