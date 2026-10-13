import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { loginRequest, logoutRequest } from "../api/auth.api.js";
import {
  clearSession,
  refreshSession,
  setAccessToken,
  setSessionHandlers,
} from "../api/client.js";

export const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [sessionExpired, setSessionExpired] = useState(false);

const [signedOutByUser, setSignedOutByUser] = useState(false);
  const [restoreError, setRestoreError] = useState(null);

  const startedRef = useRef(false);

useEffect(() => {
    return setSessionHandlers({
      onRefreshed: (authData) => {
        setUser(authData.user);
        setStatus("signedIn");
      },
      onExpired: () => {
        setUser(null);
        setStatus("signedOut");
        setSessionExpired(true);
      },
    });
  }, []);

  const restore = useCallback(async () => {
    setStatus("loading");
    setRestoreError(null);

    try {
      await refreshSession();
    } catch (error) {
      if (error?.status === 401) {

        setStatus("signedOut");
      } else {
        setRestoreError(error);
        setStatus("error");
      }
    }
  }, []);

  useEffect(() => {

    if (startedRef.current) {
      return;
    }

    startedRef.current = true;
    restore();
  }, [restore]);

  const login = useCallback(async (email, password) => {
    const response = await loginRequest(email, password);
    const authData = response?.data;

    setAccessToken(authData.accessToken);
    setUser(authData.user);
    setSessionExpired(false);
    setSignedOutByUser(false);
    setStatus("signedIn");

    return authData.user;
  }, []);

  const logout = useCallback(async () => {

setSignedOutByUser(true);

    try {
      await logoutRequest();
    } catch {
      return;
    } finally {
      clearSession();
      setUser(null);
      setSessionExpired(false);
      setStatus("signedOut");
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === "signedIn" && Boolean(user),
      sessionExpired,
      signedOutByUser,
      restoreError,
      retryRestore: restore,
      login,
      logout,
    }),
    [
      user,
      status,
      sessionExpired,
      signedOutByUser,
      restoreError,
      restore,
      login,
      logout,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}
