import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Activity } from "lucide-react";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) { navigate("/login", { replace: true }); return; }
    const session_id = decodeURIComponent(m[1]);
    (async () => {
      try {
        const res = await authApi.session(session_id);
        setUser(res.user);
        // clear hash
        window.history.replaceState({}, "", window.location.pathname);
        const target = res.user.role === "admin" ? "/admin" : "/incidents";
        navigate(target, { replace: true, state: { user: res.user } });
      } catch (e) {
        navigate("/login", { replace: true });
      }
    })();
  }, [location.hash, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
      <div className="flex items-center gap-3">
        <Activity className="h-5 w-5 animate-pulse text-cyan-400" />
        <span className="font-medium tracking-tight">Establishing secure session…</span>
      </div>
    </div>
  );
}
