export function hasPermission(user, permission) {
  return user?.permissions?.includes(permission) ?? false;
}

export function hasRole(user, role) {
  return user?.roles?.includes(role) ?? false;
}
