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

  const authMutation = useMutation({
    mutationFn: async ({ email, password, mode }: { email: string; password: string; mode: Mode }) => {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["auth-me"], data);
      navigate("/ccl");
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return;
    authMutation.mutate({ email: email.trim(), password, mode });
  };

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
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
              <p className="text-sm text-destructive">{error}</p>
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
        </div>
      </div>
    </div>
  );
}
