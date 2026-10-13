import { hasAnyRole } from "../config/navigation.js";
import { useAuth } from "../hooks/useAuth.js";
import { usePermissions } from "../hooks/usePermissions.js";
import AccessDenied from "../pages/AccessDenied.jsx";

export default function RequirePermission({ anyOf, anyRole, children }) {
  const { hasAnyPermission } = usePermissions();
  const { user } = useAuth();

  return hasAnyPermission(anyOf) && (!anyRole || hasAnyRole(user, anyRole)) ? children : <AccessDenied />;
}
