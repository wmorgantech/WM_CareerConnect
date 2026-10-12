import { useAuth } from "./useAuth";

export function usePermissions() {
  const { user } = useAuth();

  const permissions = user?.permissions || [];

  const hasPermission = (permission) =>
    permissions.includes(permission);

  const hasAnyPermission = (requiredPermissions) =>
    requiredPermissions.some((permission) =>
      permissions.includes(permission),
    );

  const hasAllPermissions = (requiredPermissions) =>
    requiredPermissions.every((permission) =>
      permissions.includes(permission),
    );

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}