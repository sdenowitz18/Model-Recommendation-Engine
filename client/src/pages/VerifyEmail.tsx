import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/transcend-logo.svg";
import { useAuth, type AuthUser } from "@/hooks/use-auth";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function tokenFromUrl(): string | null {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("token");
  }

  const autoTokenDone = useRef(false);

  const verifyMutation = useMutation({
    mutationFn: async (body: { token?: string; email?: string; code?: string }) => {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      return data as AuthUser & { ok?: boolean };
    },
    onSuccess: (data) => {
      qc.setQueryData(["auth-me"], {
        id: data.id,
        email: data.email,
        emailVerifiedAt: data.emailVerifiedAt,
        isAdmin: data.isAdmin,
      });
      navigate("/ccl");
    },
    onError: (err: Error) => setError(err.message),
  });

  useEffect(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;
    if (!t || autoTokenDone.current) return;
    autoTokenDone.current = true;
    verifyMutation.mutate({ token: t });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot token verification from URL on mount
  }, []);

  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const qEmail = params?.get("email");
    if (qEmail) setEmail(qEmail);
  }, []);

  useEffect(() => {
    if (!isLoading && user?.emailVerifiedAt) {
      navigate("/ccl");
    }
  }, [isLoading, user, navigate]);

  const resendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not resend");
      return data as { message?: string };
    },
    onSuccess: (data) => {
      setInfo(data.message || "If the account exists, check your inbox.");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setInfo(null);
    },
  });

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !code.trim()) return;
    verifyMutation.mutate({ email: email.trim(), code: code.trim() });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src={logoUrl} alt="Transcend" className="h-10 w-auto mb-3 select-none" draggable={false} />
          <span className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-muted-foreground">
            Verify your email
          </span>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-8 space-y-6">
          {tokenFromUrl() && verifyMutation.isPending && (
            <p className="text-sm text-muted-foreground text-center">Confirming your link…</p>
          )}

          {!tokenFromUrl() && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter the code from your email, or open the link we sent you.
              </p>
              <div>
                <label className="text-[11px] font-display font-bold uppercase tracking-[0.14em] block mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-display font-bold uppercase tracking-[0.14em] block mb-1.5">
                  Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 tracking-widest"
                  placeholder="6-digit code"
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full uppercase tracking-[0.12em] font-display font-bold text-xs"
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? "Verifying…" : "Verify"}
              </Button>
            </form>
          )}

          {tokenFromUrl() && error && <p className="text-sm text-destructive">{error}</p>}

          <div className="border-t pt-6 space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-display font-bold">
              Didn&apos;t get it?
            </p>
            <p className="text-xs text-muted-foreground">
              Resend requires your password so only you can trigger a new email.
            </p>
            <div>
              <label className="text-[11px] font-display font-bold uppercase tracking-[0.14em] block mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            {info && <p className="text-sm text-green-700">{info}</p>}
            <Button
              type="button"
              variant="outline"
              className="w-full uppercase tracking-[0.12em] font-display font-bold text-xs"
              disabled={!email.trim() || !password || resendMutation.isPending}
              onClick={() => resendMutation.mutate()}
            >
              {resendMutation.isPending ? "Sending…" : "Resend verification email"}
            </Button>
          </div>

          <button
            type="button"
            className="text-xs text-primary font-display font-bold uppercase tracking-[0.1em] w-full text-center"
            onClick={() => navigate("/login")}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
