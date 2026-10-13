import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";

import { getVisibleNav, portalOf } from "../../config/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";

function NavItem({ item, onClose }) {
  const Icon = item.icon;

  return (
    <li>
      {item.ready ? (
        <NavLink
          to={item.path}
          className={({ isActive }) => (isActive ? "rail__link rail__link--active" : "rail__link")}
          onClick={onClose}
        >
          <Icon size={17} aria-hidden="true" />
          <span>{item.label}</span>
        </NavLink>
      ) : (
        <span className="rail__link rail__link--soon" aria-disabled="true" title="Not available yet">
          <Icon size={17} aria-hidden="true" />
          <span>{item.label}</span>
          <span className="rail__badge">Soon</span>
        </span>
      )}
    </li>
  );
}

// Every group is a dropdown. It opens by itself when the current page is inside it and can be toggled by
// hand; the others start closed. A group with its own icon (Recruitment) is drawn as a menu row, the rest
// keep their small section heading, now with a chevron.
function Group({ group, pathname, onClose }) {
  const [manual, setManual] = useState(null);
  const GroupIcon = group.icon;
  const HeadingIcon = group.headingIcon;
  const hasActive = group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
  const open = manual ?? hasActive;
  const listId = `rail-group-${(group.id ?? group.label).toLowerCase().replace(/\W+/g, "-")}`;
  const toggleClass = GroupIcon
    ? hasActive ? "rail__toggle rail__toggle--active" : "rail__toggle"
    : hasActive ? "rail__label rail__heading rail__heading--active" : "rail__label rail__heading";

  return (
    <div className="rail__group">
      <button type="button" className={toggleClass} onClick={() => setManual(!open)} aria-expanded={open} aria-controls={listId}>
        {GroupIcon ? <GroupIcon size={17} aria-hidden="true" /> : null}
        {!GroupIcon && HeadingIcon ? <HeadingIcon className="rail__heading-icon" size={15} aria-hidden="true" /> : null}
        <span>{group.label}</span>
        <ChevronDown size={16} className="rail__chevron" aria-hidden="true" />
      </button>
      <div className="rail__panel" data-open={open ? "true" : "false"}>
        <div className="rail__panel-inner">
          <ul id={listId} className={GroupIcon ? "rail__list rail__list--nested" : "rail__list"}>
            {group.items.map((item) => (
              <NavItem key={item.id} item={item} onClose={onClose} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function AdminSidebar({ open, onClose }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const groups = getVisibleNav(user, portalOf(pathname));
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    closeRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div className={open ? "scrim scrim--open" : "scrim"} onClick={onClose} aria-hidden="true" />

      <nav id="admin-nav" className={open ? "rail rail--open" : "rail"} aria-label="Workspace navigation">
        <button ref={closeRef} type="button" className="rail__close" onClick={onClose} aria-label="Close navigation">
          <X size={18} aria-hidden="true" />
        </button>

        {groups.length === 0 ? (
          <p className="rail__empty">No admin modules are available for your account.</p>
        ) : (
          groups.map((group) => <Group key={group.label} group={group} pathname={pathname} onClose={onClose} />)
        )}
      </nav>
    </>
  );
}
