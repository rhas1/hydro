import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, ApiError, getToken, setToken, UNAUTHORIZED_EVENT } from "../api/client";
import type { Me, Permission } from "../api/types";

interface AuthState {
  user: Me | null;
  loading: boolean;
  /** Set when the server couldn't be reached at start-up (the saved sign-in is kept). */
  startupError: string | null;
  retry: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));
  const [startupError, setStartupError] = useState<string | null>(null);

  // State only changes once the request finishes, so this is safe to run from an effect.
  const fetchUser = useCallback(() => {
    if (!getToken()) return;
    api<Me>("/auth/me")
      .then(setUser)
      .catch((error) => {
        // Only the server rejecting the sign-in ends the session (the client clears the
        // token on 401). A dropped connection or a restarting server must not sign you out.
        if (!(error instanceof ApiError && error.status === 401)) {
          setStartupError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(fetchUser, [fetchUser]);

  const retry = useCallback(() => {
    setLoading(true);
    setStartupError(null);
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ access_token: string; user: Me }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(result.access_token);
    setUser(result.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      startupError,
      retry,
      login,
      logout,
      can: (permission) => Boolean(user?.permissions.includes(permission)),
    }),
    [user, loading, startupError, retry, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
