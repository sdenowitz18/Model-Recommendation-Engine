import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type ChatAdvisorResponse } from "@shared/routes";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

// === SESSION MANAGEMENT ===

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem("school_advisor_session_id");
  });

  const createSessionMutation = useMutation({
    mutationFn: async (newSessionId: string) => {
      const res = await fetch(api.sessions.create.path, {
        method: api.sessions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: newSessionId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create session");
      return api.sessions.create.responses[201].parse(await res.json());
    },
  });

  // Initialize session if missing
  useEffect(() => {
    if (!sessionId) {
      const newId = uuidv4();
      localStorage.setItem("school_advisor_session_id", newId);
      setSessionId(newId);
      createSessionMutation.mutate(newId);
    } else {
      // Ensure session exists on backend even if local storage has it
      createSessionMutation.mutate(sessionId);
    }
  }, []); // Run once on mount

  return { sessionId, isLoading: createSessionMutation.isPending };
}

export function useSessionContext(sessionId: string | null) {
  return useQuery({
    queryKey: [api.sessions.getContext.path, sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const url = buildUrl(api.sessions.getContext.path, { sessionId });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch context");
      return api.sessions.getContext.responses[200].parse(await res.json());
    },
    enabled: !!sessionId,
  });
}

// === CHAT ===

export function useChatAdvisor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const res = await fetch(api.chat.advisor.path, {
        method: api.chat.advisor.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return api.chat.advisor.responses[200].parse(await res.json());
    },
    onSuccess: (data, variables) => {
      // Invalidate context to update the UI if new info was extracted
      queryClient.invalidateQueries({ queryKey: [api.sessions.getContext.path, variables.sessionId] });
      
      // If recommendations are ready, invalidate that query
      if (data.should_recommend) {
        queryClient.invalidateQueries({ queryKey: [api.models.recommend.path, variables.sessionId] });
      }
      
      // If comparison requested, invalidate that query
      if (data.should_compare) {
        queryClient.invalidateQueries({ queryKey: [api.comparison.get.path, variables.sessionId] });
      }
    },
  });
}

// === MODELS & RECOMMENDATIONS ===

export function useModels() {
  return useQuery({
    queryKey: [api.models.list.path],
    queryFn: async () => {
      const res = await fetch(api.models.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch models");
      return api.models.list.responses[200].parse(await res.json());
    },
  });
}

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

export function useRecommendations(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [api.models.recommend.path, sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const url = buildUrl(api.models.recommend.path, { sessionId });
      const res = await fetch(url, { method: "POST", credentials: "include" }); // POST to trigger generation if missing
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return api.models.recommend.responses[200].parse(await res.json());
    },
    enabled: !!sessionId && enabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// === COMPARISON ===

export function useSaveComparison() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, modelIds }: { sessionId: string; modelIds: number[] }) => {
      const url = buildUrl(api.comparison.save.path, { sessionId });
      const res = await fetch(url, {
        method: api.comparison.save.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelIds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save comparison");
      return api.comparison.save.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.comparison.get.path, variables.sessionId] });
    },
  });
}

export function useComparison(sessionId: string | null) {
  return useQuery({
    queryKey: [api.comparison.get.path, sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const url = buildUrl(api.comparison.get.path, { sessionId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comparison");
      return api.comparison.get.responses[200].parse(await res.json());
    },
    enabled: !!sessionId,
  });
}
