import React from "react";
import { ShieldCheck, Activity, Cpu, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const startLogin = () => {
    const redirectUrl = window.location.origin + "/auth/callback";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(1200px 500px at 20% 0%, rgba(6,182,212,0.12), transparent), radial-gradient(900px 400px at 90% 20%, rgba(99,102,241,0.10), transparent)" }} />
      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2 gap-10 items-center px-6 py-10">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-xs tracking-[0.2em] uppercase text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" /> Banking IT Ops
          </div>
          <h1 className="mt-6 font-extrabold tracking-tight text-4xl sm:text-5xl lg:text-6xl">
            AI Incident <span className="text-cyan-400">Analyzer</span>
          </h1>
          <p className="mt-4 max-w-xl text-slate-300 leading-relaxed">
            A tactical command center that pulls active ServiceNow incidents, correlates them with your
            internal RCA and knowledge base, and produces analyst-grade root cause, impact and remediation
            insights in seconds.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4 max-w-md">
            <Feature icon={<Activity className="h-4 w-4" />} label="Live ServiceNow" />
            <Feature icon={<Cpu className="h-4 w-4" />} label="AI RCA Engine" />
            <Feature icon={<Database className="h-4 w-4" />} label="Internal KB / RCA" />
            <Feature icon={<ShieldCheck className="h-4 w-4" />} label="Role-Based Access" />
          </div>
        </div>
        <div className="justify-self-center w-full max-w-md">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur-md p-8 shadow-2xl">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              Secure Access
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">Sign in to continue</h2>
            <p className="mt-2 text-sm text-slate-400">
              Access is protected by Google SSO. Your role (Admin or End User) is enforced server-side.
            </p>
            <Button
              data-testid="google-login-btn"
              onClick={startLogin}
              className="mt-6 w-full h-11 bg-white text-slate-900 hover:bg-slate-100 font-semibold"
            >
              <GoogleIcon />
              Continue with Google
            </Button>
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              By continuing you agree to the bank's IT acceptable-use policy.
              Sessions last 7 days and can be revoked from the audit log.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, label }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm text-slate-300">
      <span className="text-cyan-400">{icon}</span> {label}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-5 w-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.9 6.1 29.7 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.9 6.1 29.7 4 24 4 16 4 9.1 8.6 6.3 14.1z"/><path fill="#4CAF50" d="M24 44c5.6 0 10.7-2.1 14.5-5.6l-6.7-5.5C29.7 34.6 27 36 24 36c-5.2 0-9.6-3.1-11.3-7.6l-6.6 5.1C9 39.4 15.9 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.7 5.5C41.1 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
  );
}
