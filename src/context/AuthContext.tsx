// App-wide auth context replacing the Supabase session flow
// (docs/09 Phase 4: "Auth context uses /api/auth/me"). Cookie session only —
// no tokens anywhere else. [local-first]
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { login as apiLogin, me, logout as apiLogout, type ApiMember, type Me } from "@/lib/api/auth";
import { isUnauthorized } from "@/lib/api/client";

type Status = "loading" | "anon" | "authed";

interface AuthValue {
  status: Status;
  user: Me["user"] | null;
  member: ApiMember | null;
  /** Re-askes the API who we are (after login or on recovering an interval). */
  refresh: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function readCachedMember(): ApiMember | null {
  // Offline/eager paint fallback only — the API decides (`/api/auth/me`).
  try {
    const raw = localStorage.getItem("cached_member_profile");
    if (!raw) return null;
    return JSON.parse(raw) as ApiMember;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<Me["user"] | null>(null);
  const [member, setMember] = useState<ApiMember | null>(readCachedMember);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await me();
      setUser(data.user);
      setMember(data.member ?? null);
      try {
        if (data.member) {
          localStorage.setItem("cached_member_profile", JSON.stringify(data.member));
        } else {
          localStorage.removeItem("cached_member_profile");
        }
      } catch {
        // localStorage unavailable — API state still authoritative
      }
      setStatus("authed");
      return true;
    } catch (error) {
      if (isUnauthorized(error)) {
        setUser(null);
        setMember(null);
        setStatus("anon");
        return false;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      // Cookie + CSRF cookie land via Set-Cookie on this response.
      await apiLogin(email, password);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setMember(null);
      setStatus("anon");
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, user, member, refresh, login, logout }),
    [status, user, member, refresh, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}
