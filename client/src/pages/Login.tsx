import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/transcend-logo.svg";

type Mode = "login" | "register";

export default function Login() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [registerInfo, setRegisterInfo] = useState<{
    devNote?: string;
    emailChannel?: string;
  } | null>(null);
  const [loginNeedsVerify, setLoginNeedsVerify] = useState(false);

  const authMutation = useMutation({
    mutationFn: async ({ email, password, mode }: { email: string; password: string; mode: Mode }) => {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = new Error(
          typeof data.message === "string" ? data.message : "Something went wrong",
        ) as Error & { code?: string };
        if (typeof data.code === "string") err.code = data.code;
        throw err;
      }
      return { data, mode };
    },
    onSuccess: ({ data, mode }) => {
      setLoginNeedsVerify(false);
      if (mode === "register") {
        setRegisterInfo({
          devNote: typeof data.devNote === "string" ? data.devNote : undefined,
          emailChannel: typeof data.emailChannel === "string" ? data.emailChannel : undefined,
        });
        setRegisterSuccess(true);
        qc.setQueryData(["auth-me"], null);
        return;
      }
      qc.setQueryData(["auth-me"], {
        id: data.id,
        email: data.email,
        emailVerifiedAt: data.emailVerifiedAt,
        isAdmin: data.isAdmin,
      });
      navigate("/ccl");
    },
    onError: (err: Error & { code?: string }) => {
      setLoginNeedsVerify(err.code === "email_unverified");
      if (err.code === "email_unverified") {
        setError(
          "This email is not verified yet. Open the verification page to enter your code or resend the link.",
        );
      } else {
        setError(err.message);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginNeedsVerify(false);
    if (!email.trim() || !password) return;
    authMutation.mutate({ email: email.trim(), password, mode });
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
    setRegisterSuccess(false);
    setRegisterInfo(null);
    setLoginNeedsVerify(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* dashed swoop motif behind the card */}
      <svg
        aria-hidden="true"
        className="absolute top-1/4 -right-32 w-[520px] h-[360px] opacity-50 pointer-events-none"
        viewBox="0 0 520 360"
        fill="none"
      >
        <path
          d="M0 60 C 200 280, 400 340, 520 240"
          stroke="#5BC3B4"
          strokeWidth="2"
          strokeDasharray="5 6"
          strokeLinecap="round"
        />
      </svg>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src={logoUrl} alt="Transcend" className="h-10 w-auto mb-3 select-none" draggable={false} />
          <span className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Model Recommendation Assistant
          </span>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-8">
          {registerSuccess ? (
            <div className="space-y-5 text-center">
              <p className="t-eyebrow">Almost there</p>
              <h1 className="font-display font-bold uppercase tracking-tight text-xl text-foreground">
                {registerInfo?.emailChannel === "dev_console" ? "Next: verify your email" : "Check your email"}
              </h1>
              {registerInfo?.emailChannel === "dev_console" && registerInfo.devNote ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-left text-sm text-amber-950">
                  <p className="font-medium mb-1">No email was sent (local dev)</p>
                  <p className="text-amber-900/90">{registerInfo.devNote}</p>
                  <p className="mt-2 text-xs text-amber-800/80">
                    To get real Gmail delivery, add <code className="rounded bg-amber-100/80 px-1">RESEND_API_KEY</code> and{" "}
                    <code className="rounded bg-amber-100/80 px-1">EMAIL_FROM</code> to <code className="rounded bg-amber-100/80 px-1">.env</code> and restart the server.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  We sent a verification link and code to{" "}
                  <span className="text-foreground font-medium">{email.trim()}</span>.
                </p>
              )}
              <Button
                type="button"
                className="w-full uppercase tracking-[0.12em] font-display font-bold text-xs"
                onClick={() => navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`)}
              >
                Enter code or open link
              </Button>
              <button
                type="button"
                onClick={() => { setRegisterSuccess(false); setRegisterInfo(null); setMode("login"); }}
                className="text-xs font-display font-bold uppercase tracking-[0.1em] text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
          <div className="mb-6 text-center">
            <p className="t-eyebrow mb-2">{mode === "login" ? "Welcome back" : "Get started"}</p>
            <h1 className="font-display font-bold uppercase tracking-tight text-2xl text-foreground">
              {mode === "login" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {mode === "login"
                ? "Sign in to access your questionnaires."
                : "Create an account to get started."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-display font-bold uppercase tracking-[0.14em] text-foreground block mb-1.5">
                Email address
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@school.org"
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                disabled={authMutation.isPending}
              />
            </div>

            <div>
              <label className="text-[11px] font-display font-bold uppercase tracking-[0.14em] text-foreground block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
                  className="w-full border rounded-lg px-3 py-2.5 pr-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  disabled={authMutation.isPending}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                {mode === "login" && email.trim() && loginNeedsVerify && (
                  <button
                    type="button"
                    className="text-xs font-display font-bold uppercase tracking-[0.08em] text-primary hover:underline"
                    onClick={() => navigate(`/verify-email?email=${encodeURIComponent(email.trim())}`)}
                  >
                    Open email verification
                  </button>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full uppercase tracking-[0.12em] font-display font-bold text-xs"
              disabled={!email.trim() || !password || authMutation.isPending}
            >
              {authMutation.isPending
                ? (mode === "login" ? "Signing in…" : "Creating account…")
                : (mode === "login" ? "Sign in" : "Create account")}
            </Button>
          </form>

          <div className="mt-5 text-center">
            <span className="text-xs text-muted-foreground">
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
            </span>
            {" "}
            <button
              type="button"
              onClick={switchMode}
              className="text-xs font-display font-bold uppercase tracking-[0.1em] text-primary hover:underline"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
