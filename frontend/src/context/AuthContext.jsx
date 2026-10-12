import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from "../services/auth.service";

import {
  clearStoredAuth,
  getStoredAuth,
  refreshSession,
  setAuthHandlers,
  storeAuth,
} from "../services/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(
    () => getStoredAuth()?.user || null,
  );
  const [accessToken, setAccessToken] = useState(
    () => getStoredAuth()?.accessToken || null,
  );
  const [loading, setLoading] = useState(true);

  const initializedRef = useRef(false);

  const saveAuth = useCallback((authData) => {
    const nextAuth = {
      user: authData.user,
      accessToken: authData.accessToken,
    };

    storeAuth(nextAuth);
    setUser(nextAuth.user);
    setAccessToken(nextAuth.accessToken);
  }, []);

  const clearAuth = useCallback(() => {
    clearStoredAuth();
    setUser(null);
    setAccessToken(null);
  }, []);

  // Keep React state in sync with refreshes/expiry that happen inside
  // apiRequest (storage is already updated there).
  useEffect(() => {
    return setAuthHandlers({
      onSessionRefreshed: (authData) => {
        setUser(authData.user);
        setAccessToken(authData.accessToken);
      },
      onSessionExpired: () => {
        setUser(null);
        setAccessToken(null);
      },
    });
  }, []);

  const login = useCallback(
    async (email, password) => {
      const response = await loginRequest(
        email,
        password,
      );

      saveAuth(response.data);

      return response.data;
    },
    [saveAuth],
  );

  const refresh = useCallback(async () => {
    try {
      // Shared single-flight refresh; stores the session and updates state.
      return await refreshSession();
    } catch (error) {
      // Only a confirmed 401 means the session is gone.
      if (error?.status === 401) {
        clearAuth();
      }

      throw error;
    }
  }, [clearAuth]);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const loadCurrentUser = useCallback(async () => {
    try {
      // apiRequest refreshes and retries once on a 401.
      const response = await getCurrentUser();
      const currentUser = response?.data?.user;

      if (currentUser) {
        setUser(currentUser);

        const stored = getStoredAuth();

        if (stored?.accessToken) {
          storeAuth({
            user: currentUser,
            accessToken: stored.accessToken,
          });
        }
      }
    } catch (error) {
      // 401 here means refresh was rejected too: the session is gone.
      // Network errors and 5xx keep the restored session.
      if (error?.status === 401) {
        clearAuth();
      }
    }
  }, [clearAuth]);

  useEffect(() => {
    // Guard against the StrictMode double-invoked effect.
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    async function initializeAuth() {
      try {
        const stored = getStoredAuth();

        if (stored?.accessToken && stored?.user) {
          await loadCurrentUser();
        } else {
          try {
            await refresh();
          } catch {
            // Not signed in, or the server is unreachable.
          }
        }
      } finally {
        setLoading(false);
      }
    }

    initializeAuth();
  }, [loadCurrentUser, refresh]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      loading,
      isAuthenticated: Boolean(user && accessToken),
      login,
      logout,
      refresh,
    }),
    [
      user,
      accessToken,
      loading,
      login,
      logout,
      refresh,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
