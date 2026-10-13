import { useMemo } from "react";

import { hasAnyPermission } from "../config/navigation.js";
import { useAuth } from "./useAuth.js";

export function usePermissions() {
  const { user } = useAuth();

  return useMemo(
    () => ({
      permissions: user?.permissions ?? [],
      hasPermission: (permission) => hasAnyPermission(user, [permission]),
      hasAnyPermission: (list) => hasAnyPermission(user, list),
    }),
    [user],
  );
}
