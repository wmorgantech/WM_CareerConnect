import { useState } from "react";
import { LogOut, Menu, UserRound } from "lucide-react";
import { useLocation } from "react-router-dom";

import { PORTALS, portalOf, roleLabel } from "../../config/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";

// The one top bar: the logo mark with the product name, then who is signed in and a sign-out icon.
// The backend stores no profile photo, so a neutral profile icon is always shown.
export default function AdminHeader({ onOpenNav, navOpen }) {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { pathname } = useLocation();
  const portal = portalOf(pathname);
  const roles = (user?.roles ?? []).map(roleLabel).join(", ");

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    await logout();
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__menu"
        onClick={onOpenNav}
        aria-label="Open navigation"
        aria-expanded={navOpen}
        aria-controls="admin-nav"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <div className="topbar__brand">
        <span className="brandmark" aria-hidden="true">
          <img src="/assets/logo/wm-morgan-logo.png" alt="" />
        </span>
        <span className="topbar__name">CareerConnect</span>
        {portal !== "admin" ? <span className="topbar__portal">{PORTALS[portal].name}</span> : null}
      </div>

      <div className="topbar__user">
        <div className="topbar__identity">
          <span className="topbar__username">{user?.name}</span>
          <span className="topbar__roles">{roles}</span>
        </div>
        <span className="topbar__avatar" role="img" aria-label={`Signed in as ${user?.name ?? "user"}`}>
          <UserRound size={19} aria-hidden="true" />
        </span>
        <button
          type="button"
          className="topbar__signout"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label={signingOut ? "Signing out" : "Sign out"}
          data-tip={signingOut ? "Signing out…" : "Sign out"}
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
