import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  email: string;
  emailVerifiedAt: string | null;
  isAdmin: boolean;
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch auth state");
      return res.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const qc = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
    },
    onSuccess: () => {
      qc.setQueryData(["auth-me"], null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const isVerified = !!user?.emailVerifiedAt;

  return {
    user: user ?? null,
    isLoading,
    /** Session exists and email is verified (product access). */
    isAuthenticated: !!user && isVerified,
    /** Logged in per cookie, but email not verified yet. */
    needsEmailVerification: !!user && !isVerified,
    logout: () => logoutMutation.mutate(),
    isLoggingOut: logoutMutation.isPending,
  };
}
