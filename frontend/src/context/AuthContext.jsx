import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { authApi } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await authApi.me());
    } catch (error) {
      if (error?.response?.status !== 401) console.error("Auth refresh failed:", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Returning from OAuth callback: AuthCallback exchanges the session_id first, skip /me.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error("Logout request failed (session cleared locally):", error);
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, refresh, logout }), [user, loading, refresh, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
