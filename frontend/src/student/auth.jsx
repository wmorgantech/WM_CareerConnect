import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { clearSession, refreshSession, setAccessToken, setExpiredHandler, studentApi } from "./api.js";

const StudentContext = createContext(null);

export function StudentProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [expired, setExpired] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    setExpiredHandler(() => {
      setUser(null);
      setStatus("signedOut");
      setExpired(true);
    });

    return () => setExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (started.current) return;

    started.current = true;

    refreshSession()
      .then((data) => {
        setUser(data.user);
        setStatus("signedIn");
      })
      .catch(() => setStatus("signedOut"));
  }, []);

  const login = useCallback(async (loginId, password) => {
    const response = await studentApi.login(loginId, password);

    setAccessToken(response.data.accessToken);
    setUser(response.data.user);
    setExpired(false);
    setStatus("signedIn");

    return response.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await studentApi.logout();
    } catch {

    }

    clearSession();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const markPasswordChanged = useCallback(() => setUser((u) => (u ? { ...u, mustChangePassword: false } : u)), []);

  const value = useMemo(
    () => ({ user, status, expired, login, logout, markPasswordChanged }),
    [user, status, expired, login, logout, markPasswordChanged],
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}

export function useStudent() {
  const value = useContext(StudentContext);

  if (!value) throw new Error("useStudent must be used inside StudentProvider");

  return value;
}
