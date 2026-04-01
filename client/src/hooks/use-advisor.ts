import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

// === SESSION MANAGEMENT ===

/**
 * Initialize and ensure a specific session exists on the backend.
 * @param sessionId - explicit session UUID (from URL).
 */
export function useSession(sessionId?: string | null) {
  const [resolvedId, setResolvedId] = useState<string | null>(sessionId ?? null);

  const createSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(api.sessions.create.path, {
        method: api.sessions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, focusArea: "ccl" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create session");
      return api.sessions.create.responses[201].parse(await res.json());
    },
  });

  useEffect(() => {
    if (sessionId) {
      setResolvedId(sessionId);
      createSessionMutation.mutate(sessionId);
    } else if (!resolvedId) {
      const newId = uuidv4();
      setResolvedId(newId);
      createSessionMutation.mutate(newId);
    } else {
      createSessionMutation.mutate(resolvedId);
    }
  }, [sessionId]);

  return { sessionId: resolvedId, isLoading: createSessionMutation.isPending };
}

// === MODELS ===

export function useModel(id: number) {
  return useQuery({
    queryKey: [api.models.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.models.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch model");
      return api.models.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}
