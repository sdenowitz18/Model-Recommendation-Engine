import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type TaxonomySelection } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import {
  Sparkles, Loader2, Check, X, ChevronLeft, ChevronRight, ChevronDown,
  ArrowLeft, ExternalLink, AlertTriangle, Target, BookOpen,
  LayoutGrid, Pencil, Globe, BarChart2, FileText,
  MessageCircle, Zap, School, CheckCircle, Settings, Send, Printer,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId?: number;
  streaming?: boolean;
}

interface DecisionFramePathBProps {
  sessionId: string;
  stepData: Record<string, any>;
  stepsCompleted: number[];
  onGoToStep: (step: number) => void;
  onConfirm: () => void;
  isConfirming: boolean;
}

interface RecommendationsPathBProps {
  sessionId: string;
  stepData: Record<string, any>;
  forceRefreshKey?: number;
  onGoToStep: (step: number) => void;
}

// ---------------------------------------------------------------------------
// SYSTEM_ELEMENT_GROUPS reference (keys only, for rendering context)
// ---------------------------------------------------------------------------

const SYS_GROUPS = [
  { key: "curriculum", label: "Curriculum & Assessment", icon: "📘", contextKey: "curriculum_context", questions: [] as { key: string; text: string }[] },
  { key: "family", label: "Family & Community", icon: "👨‍👩‍👧", contextKey: "family_context", questions: [
    { key: "family_schedule_flexible", text: "Flexible annual schedule" },
    { key: "family_outreach_staff", text: "Outreach-capable staff" },
    { key: "family_restrict_partnerships", text: "Partnership restrictions" },
    { key: "family_restrict_data", text: "Data sharing restrictions" },
    { key: "family_restrict_involvement", text: "Family involvement restrictions" },
  ] },
  { key: "scheduling", label: "Scheduling & Time", icon: "🗓️", contextKey: "scheduling_context", questions: [
    { key: "scheduling_seat_time", text: "Seat time policy" },
    { key: "scheduling_flex_blocks", text: "Flex/choice blocks" },
  ] },
  { key: "technology", label: "Technology & Infra", icon: "💻", contextKey: "technology_context", questions: [
    { key: "technology_device_access", text: "Student device access" },
    { key: "technology_device_capability", text: "Device capability" },
    { key: "technology_specialized_hardware", text: "Specialized hardware" },
  ] },
  { key: "adult_roles", label: "Adult Roles & PD", icon: "🧑‍🏫", contextKey: "adult_roles_context", questions: [
    { key: "can_commit_pd", text: "Commit to PD" },
  ] },
  { key: "budget", label: "Budget & Operations", icon: "💰", contextKey: "budget_context", questions: [
    { key: "budget_available", text: "Budget for paid solution" },
    { key: "budget_transportation", text: "Transportation services" },
  ] },
];

// ---------------------------------------------------------------------------
// Alignment pill color helper
// ---------------------------------------------------------------------------

function alignLabel(pct: number): { label: string; cls: string } {
  if (pct >= 70) return { label: "High", cls: "hi" };
  if (pct >= 40) return { label: "Medium", cls: "mid" };
  return { label: "Low", cls: "lo" };
}

// ---------------------------------------------------------------------------
// Experience Summary — Path B
// ---------------------------------------------------------------------------

export function DecisionFramePathB({
  sessionId,
  stepData,
  stepsCompleted,
  onGoToStep,
  onConfirm,
  isConfirming,
}: DecisionFramePathBProps) {
  const [contextModal, setContextModal] = useState<{ title: string; text: string } | null>(null);

  const exp = (stepData.experience as Record<string, any>) || {};
  const s1 = stepData["1"] || {};
  const s2 = stepData["2"] || {};
  const s3 = stepData["3"] || {};
  const s4 = stepData["4"] || {};
  const s5 = stepData["5"] || {};

  const primaryPracticeIds = new Set<number>(
    ((exp.primaryPractices || []) as TaxonomySelection[]).map((p) => p.id)
  );
  const outcomes: TaxonomySelection[] = s2.selected_outcomes || [];
  const leaps: TaxonomySelection[] = s2.selected_leaps || [];
  const primaryPractices: TaxonomySelection[] = exp.primaryPractices || [];
  const additionalPractices: TaxonomySelection[] = ((s3.selected_practices || []) as TaxonomySelection[]).filter(
    (p) => !primaryPracticeIds.has(p.id)
  );
  const allPractices = [...primaryPractices, ...additionalPractices];

  const importanceLabel = (imp: string) =>
    imp === "most_important" ? "Must Have" : imp === "important" ? "Important" : "Nice to Have";


  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-[#FAF7F0]">
      {/* Sticky experience banner */}
      <div className="shrink-0 bg-[#104080] px-6 py-3.5 flex items-center gap-4 flex-wrap shadow-md z-10">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8FD9CB] mb-0.5">
            Experience
          </p>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold uppercase text-white leading-tight truncate font-display">
              {exp.name || "Untitled Experience"}
            </h2>
            <button
              onClick={() => onGoToStep(2)}
              className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-white/40 border border-white/20 rounded-md px-2.5 py-1 hover:text-white hover:border-white/50 transition-all"
            >
              <Pencil className="w-2.5 h-2.5 inline mr-1" />Edit
            </button>
          </div>
          {exp.description && (
            <p className="text-xs text-white/50 mt-0.5 line-clamp-1">{exp.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {exp.targetedGradeBands?.length > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[rgba(63,183,160,.2)] text-[#8FD9CB]">
              {exp.targetedGradeBands.join(", ")}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              document.body.classList.add("printing-landscape");
              window.print();
              document.body.classList.remove("printing-landscape");
            }}
            className="border-white/30 text-white hover:bg-white/10 gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full px-3"
          >
            <Printer className="w-3.5 h-3.5" /> Export
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isConfirming}
            className="bg-[#E04040] hover:bg-[#C42E2E] text-white gap-2 text-[10px] font-bold uppercase tracking-wider rounded-full px-4"
          >
            {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Generate Recommendations
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-8 py-6 space-y-6 pb-20">

          {/* Outcomes / LEAPs / Practices — 3 column cards */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#E1E8F2] flex items-center justify-center">
                <Target className="w-4 h-4 text-[#104080]" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#E04040]">Experience Summary</p>
                <h3 className="text-lg font-extrabold uppercase text-[#104080] font-display">
                  What Students Are Building Towards
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Outcomes card */}
              <AimCard
                title="Outcomes"
                items={outcomes}
                contextText={s2.outcomes_summary}
                onEdit={() => onGoToStep(3)}
                importanceLabel={importanceLabel}
                onExpandContext={(title, text) => setContextModal({ title, text })}
              />
              {/* LEAPs card */}
              <AimCard
                title="LEAPs"
                items={leaps}
                contextText={s2.leaps_summary}
                onEdit={() => onGoToStep(9)}
                importanceLabel={importanceLabel}
                onExpandContext={(title, text) => setContextModal({ title, text })}
              />
              {/* Practices card */}
              <AimCard
                title="Practices"
                items={allPractices}
                primaryIds={primaryPracticeIds}
                contextText={s3.experience_summary}
                onEdit={() => onGoToStep(2)}
                importanceLabel={importanceLabel}
                onExpandContext={(title, text) => setContextModal({ title, text })}
              />
            </div>
          </section>

          {/* System Elements */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#E1E8F2] flex items-center justify-center">
                <Settings className="w-4 h-4 text-[#104080]" />
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#E04040]">System Context</p>
                <h3 className="text-lg font-extrabold uppercase text-[#104080] font-display">
                  System Elements
                </h3>
              </div>
              <button
                onClick={() => onGoToStep(4)}
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-[#104080] border border-transparent hover:border-muted-foreground/20 px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {SYS_GROUPS.map((g) => {
                const hasQuestionData = g.questions.some((q) => !!s4[q.key]);
                const hasContext = !!s4[g.contextKey];
                if (!hasQuestionData && !hasContext) return null;
                return (
                  <div key={g.key} className="bg-white border border-border rounded-xl p-3.5 shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{g.icon}</span>
                      <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#104080] flex-1">
                        {g.label}
                      </span>
                    </div>
                    <div className="space-y-1 flex-1">
                      {g.questions.map((q) => {
                        const val = s4[q.key];
                        if (!val) return null;
                        return (
                          <div key={q.key} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground flex-1 truncate">{q.text}</span>
                            <SysTag value={val} />
                          </div>
                        );
                      })}
                    </div>
                    {hasContext && (
                      <div className="mt-auto pt-2">
                        <div className="p-2.5 bg-[#F4EFE6] rounded-md border-l-[3px] border-[#3FB7A0]">
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{s4[g.contextKey]}</p>
                          {s4[g.contextKey].length > 150 && (
                            <button
                              className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#2C8A78] hover:text-[#E04040] transition-colors"
                              onClick={() => setContextModal({ title: g.label, text: s4[g.contextKey] })}
                            >
                              Expand
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Model Preferences summary */}
          {Object.keys(s5).length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#E1E8F2] flex items-center justify-center">
                  <Settings className="w-4 h-4 text-[#104080]" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#E04040]">Preferences</p>
                  <h3 className="text-lg font-extrabold uppercase text-[#104080] font-display">
                    Model Preferences
                  </h3>
                </div>
                <button
                  onClick={() => onGoToStep(5)}
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-[#104080] border border-transparent hover:border-muted-foreground/20 px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </div>
              <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {s5.evidence_threshold && (
                    <Badge variant="secondary" className="text-xs">
                      Evidence: {s5.evidence_threshold === "established" ? "Established" : "Open to emerging"}
                    </Badge>
                  )}
                  {s5.open_to_stitching && (
                    <Badge variant="secondary" className="text-xs">
                      {s5.open_to_stitching === "yes" ? "Open to combining" : "Single model preferred"}
                    </Badge>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      {/* Bottom nav */}
      <div className="shrink-0 flex items-center justify-between px-7 py-3.5 border-t bg-white">
        <Button variant="outline" size="sm" onClick={() => onGoToStep(5)} className="gap-2 text-xs">
          <ChevronLeft className="w-3.5 h-3.5" /> Previous
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={isConfirming}
          className="gap-2 text-xs bg-[#104080] hover:bg-[#0A2A5C]"
        >
          {isConfirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Generate Recommendations
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Context modal */}
      <Dialog open={!!contextModal} onOpenChange={() => setContextModal(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold uppercase tracking-wider text-[#104080]">
              {contextModal?.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {contextModal?.text}
          </p>
        </DialogContent>
      </Dialog>

      {/* Landscape print portal for Experience Summary */}
      {createPortal(
        <div className="print-landscape-container">
          <PrintExperienceSummaryLandscape stepData={stepData} />
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AimCard (Outcomes / LEAPs / Practices)
// ---------------------------------------------------------------------------

function AimCard({
  title,
  items,
  primaryIds,
  contextText,
  onEdit,
  importanceLabel,
  onExpandContext,
}: {
  title: string;
  items: TaxonomySelection[];
  primaryIds?: Set<number>;
  contextText?: string;
  onEdit: () => void;
  importanceLabel: (imp: string) => string;
  onExpandContext?: (title: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const maxVisible = 4;
  const shown = expanded ? items : items.slice(0, maxVisible);
  const hasMore = items.length > maxVisible;

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="bg-[#104080] px-3.5 py-2.5 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[.09em] text-white/90 flex-1">{title}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/35">{items.length}</span>
        <button
          onClick={onEdit}
          className="text-[8.5px] font-bold uppercase tracking-wider text-white/40 border border-white/20 rounded px-2 py-0.5 hover:text-white hover:border-white/50 transition-all"
        >
          Edit
        </button>
      </div>
      <div className="p-3.5 flex-1 flex flex-col">
        {shown.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">None selected</p>
        ) : (
          <div className="space-y-1.5">
            {shown.map((item, i) => {
              const isPrimary = primaryIds?.has(item.id);
              return (
                <div
                  key={item.id ?? i}
                  className={cn(
                    "flex items-center gap-2 py-1.5 px-2 rounded text-xs font-semibold text-[#104080]",
                    isPrimary && "bg-[#FCE5E5]",
                    !isPrimary && "border-b border-muted/30 last:border-0"
                  )}
                >
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    item.importance === "most_important" ? "bg-[#E04040]" :
                    item.importance === "important" ? "bg-[#5070A0]" : "bg-muted-foreground/30"
                  )} />
                  <span className="flex-1 truncate">{item.name}</span>
                  <span className="text-[9px] font-bold uppercase text-muted-foreground/60 shrink-0">
                    {isPrimary ? "Primary" : importanceLabel(item.importance)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#5070A0] hover:text-[#104080] transition-colors"
          >
            {expanded ? "Show fewer" : `+${items.length - maxVisible} more`}
          </button>
        )}

        {/* Context box inside card */}
        {contextText && (
          <div className="mt-auto pt-3">
            <div className="p-2.5 bg-[#F4EFE6] rounded-md border-l-[3px] border-[#3FB7A0]">
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{contextText}</p>
              {contextText.length > 150 && onExpandContext && (
                <button
                  className="mt-1 text-[9px] font-bold uppercase tracking-wider text-[#2C8A78] hover:text-[#E04040] transition-colors"
                  onClick={() => onExpandContext(title + " Context", contextText)}
                >
                  Expand
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SysTag (value badge for system elements)
// ---------------------------------------------------------------------------

function SysTag({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const isYes = lower === "yes" || lower === "definitely" || lower === "1:1" || lower.startsWith("high") || lower === "full flexibility";
  const isNo = lower === "no" || lower === "none" || lower.startsWith("no ");
  return (
    <span className={cn(
      "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
      isYes && "bg-[#DEF2EE] text-[#2C8A78]",
      isNo && "bg-[#FCE5E5] text-[#C42E2E]",
      !isYes && !isNo && "bg-muted text-muted-foreground"
    )}>
      {value.length > 30 ? value.slice(0, 30) + "…" : value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recommendations View — Path B
// ---------------------------------------------------------------------------

export function RecommendationsPathB({
  sessionId,
  stepData,
  forceRefreshKey = 0,
  onGoToStep,
}: RecommendationsPathBProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const hasAutoGenerated = useRef(false);
  const lastForceRefreshKey = useRef(0);
  const [lastGenStepData, setLastGenStepData] = useState("");
  const [activeModelId, setActiveModelId] = useState<number | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<number, LocalChatMessage[]>>({});
  const [pendingModelId, setPendingModelId] = useState<number | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportModels, setSelectedExportModels] = useState<Set<number>>(new Set());

  // Data fetching
  const { data: models = [], isLoading: isLoadingModels } = useQuery<any[]>({
    queryKey: ["/api/models"],
    queryFn: async () => {
      const res = await fetch("/api/models", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch models");
      return res.json();
    },
  });

  const { data: recommendations = [], isLoading: isLoadingRecs } = useQuery<any[]>({
    queryKey: [api.models.getRecommendations.path, sessionId],
    queryFn: async () => {
      const url = buildUrl(api.models.getRecommendations.path, { sessionId });
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.models.recommend.path, { sessionId });
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to generate");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.models.getRecommendations.path, sessionId] });
      setLastGenStepData(JSON.stringify(stepData));
      toast({ title: "Recommendations generated", description: "Model matches computed from your decision frame." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate recommendations.", variant: "destructive" });
    },
  });

  // Auto-generate
  useEffect(() => {
    if (sessionId && models.length > 0 && !isLoadingModels && !isLoadingRecs && recommendations.length === 0 && !hasAutoGenerated.current && !generateMutation.isPending) {
      hasAutoGenerated.current = true;
      generateMutation.mutate();
    }
  }, [sessionId, models.length, isLoadingModels, isLoadingRecs, recommendations.length, generateMutation.isPending]);

  // Force refresh from decision frame
  useEffect(() => {
    if (forceRefreshKey > 0 && forceRefreshKey !== lastForceRefreshKey.current && !generateMutation.isPending) {
      lastForceRefreshKey.current = forceRefreshKey;
      generateMutation.mutate();
    }
  }, [forceRefreshKey, generateMutation.isPending]);

  // Baseline for staleness
  useEffect(() => {
    if (recommendations.length > 0 && lastGenStepData === "") {
      setLastGenStepData(JSON.stringify(stepData));
    }
  }, [recommendations.length, stepData, lastGenStepData]);

  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<Record<number, string[]>>({});
  const [forceBranch, setForceBranch] = useState<string | null>(null);

  // Chat streaming
  const sendModelMessage = useCallback(async (modelId: number, message: string, topic?: string | null) => {
    const isGreeting = message === "__greeting__";
    setPendingModelId(modelId);
    const assistantMsgId = crypto.randomUUID();
    const userMsg: LocalChatMessage | null = isGreeting ? null : {
      id: crypto.randomUUID(), role: "user", content: message, modelId,
    };
    const placeholderMsg: LocalChatMessage = {
      id: assistantMsgId, role: "assistant", content: "", modelId, streaming: true,
    };
    setChatHistories((prev) => ({
      ...prev,
      [modelId]: [...(prev[modelId] || []), ...(userMsg ? [userMsg] : []), placeholderMsg],
    }));

    try {
      const res = await fetch("/api/chat/step8/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, modelId, ...(topic ? { topic } : {}) }),
        credentials: "include",
      });
      if (!res.ok || !res.body) throw new Error("Stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.token !== undefined) {
              setChatHistories((prev) => ({
                ...prev,
                [modelId]: (prev[modelId] ?? []).map((m) =>
                  m.id === assistantMsgId ? { ...m, content: m.content + payload.token } : m
                ),
              }));
            } else if (payload.suggestedFollowUps) {
              setSuggestedFollowUps((prev) => ({ ...prev, [modelId]: payload.suggestedFollowUps }));
            } else if (payload.done || payload.error) {
              setChatHistories((prev) => ({
                ...prev,
                [modelId]: (prev[modelId] ?? []).map((m) =>
                  m.id === assistantMsgId ? { ...m, streaming: false } : m
                ),
              }));
            }
          } catch { /* skip malformed SSE */ }
        }
      }
    } catch {
      setChatHistories((prev) => ({
        ...prev,
        [modelId]: (prev[modelId] ?? []).filter((m) => m.id !== assistantMsgId),
      }));
      toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
    } finally {
      setPendingModelId(null);
    }
  }, [sessionId, toast]);

  const handleExploreModel = useCallback((modelId: number) => {
    const existing = chatHistories[modelId] ?? [];
    if (!existing.length) {
      sendModelMessage(modelId, "__greeting__");
    }
    setActiveTopic(null);
    setActiveModelId(modelId);
  }, [chatHistories, sendModelMessage]);

  const handleAskAI = useCallback((modelId: number, topic: string) => {
    const existing = chatHistories[modelId] ?? [];
    if (!existing.length) {
      sendModelMessage(modelId, "__greeting__");
    }
    setActiveModelId(modelId);

    if (topic === "model") {
      setForceBranch(topic);
    } else if (topic.startsWith("watchout:")) {
      const domain = topic.replace("watchout:", "");
      const prompt = `Tell me about the "${domain}" watchout for this model and what we should consider.`;
      setActiveTopic(topic);
      sendModelMessage(modelId, prompt, topic);
    }
  }, [chatHistories, sendModelMessage]);

  const handleBackToList = useCallback(() => setActiveModelId(null), []);

  // Loading states
  if (isLoadingModels || isLoadingRecs || generateMutation.isPending) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#FAF7F0]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#104080] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {generateMutation.isPending ? "Finding your best model matches…" : "Loading recommendations…"}
          </p>
        </div>
      </div>
    );
  }

  // Active model — split view
  if (activeModelId !== null) {
    const rec = recommendations.find((r: any) => r.modelId === activeModelId);
    const model = rec?.model || models.find((m: any) => m.id === activeModelId) || {};
    return (
      <ModelSplitView
        model={model}
        rec={rec}
        sessionId={sessionId}
        chatHistory={chatHistories[activeModelId] || []}
        isPending={pendingModelId === activeModelId}
        activeTopic={activeTopic}
        suggestedFollowUps={suggestedFollowUps[activeModelId] || []}
        forceBranch={forceBranch}
        onSendMessage={(msg, topic) => sendModelMessage(activeModelId, msg, topic)}
        onSetTopic={setActiveTopic}
        onAskAI={(topic) => handleAskAI(activeModelId, topic)}
        onBack={handleBackToList}
        onClearConversation={() => {
          fetch(`/api/sessions/${sessionId}/chat/model-conversation/${activeModelId}`, {
            method: "DELETE", credentials: "include",
          }).catch(() => {});
          setChatHistories((prev) => { const n = { ...prev }; delete n[activeModelId!]; return n; });
          setActiveTopic(null);
          setForceBranch(null);
          setSuggestedFollowUps((prev) => { const n = { ...prev }; delete n[activeModelId!]; return n; });
          sendModelMessage(activeModelId, "__greeting__");
        }}
        onClearForceBranch={() => setForceBranch(null)}
      />
    );
  }

  // Confidence score calculation
  const s2 = stepData["2"] || {};
  const s3 = stepData["3"] || {};
  const s4 = stepData["4"] || {};
  const hasOutcomes = ((s2.selected_outcomes || []) as any[]).length > 0;
  const hasLeaps = ((s2.selected_leaps || []) as any[]).length > 0;
  const hasPractices = ((s3.selected_practices || []) as any[]).length > 0;
  const SYSTEM_QUESTION_KEYS = [
    "family_schedule_flexible", "family_outreach_staff", "family_restrict_partnerships",
    "family_restrict_data", "family_restrict_involvement",
    "scheduling_seat_time", "scheduling_flex_blocks",
    "technology_device_access", "technology_device_capability", "technology_specialized_hardware",
    "can_commit_pd",
    "budget_available", "budget_transportation",
  ];
  const totalSysQuestions = SYSTEM_QUESTION_KEYS.length;
  const answeredSysQuestions = SYSTEM_QUESTION_KEYS.filter((k) => s4[k] && s4[k] !== "").length;
  const sysElementPct = totalSysQuestions > 0 ? answeredSysQuestions / totalSysQuestions : 0;

  const confidenceScore = (hasOutcomes ? 20 : 0) + (hasLeaps ? 20 : 0) + (hasPractices ? 20 : 0) + (sysElementPct * 40);
  const confidenceLevel = confidenceScore >= 75 ? "High" : confidenceScore >= 50 ? "Medium" : "Low";
  const confidenceMissing: string[] = [];
  if (!hasOutcomes) confidenceMissing.push("No outcomes selected");
  if (!hasLeaps) confidenceMissing.push("No LEAPs selected");
  if (!hasPractices) confidenceMissing.push("No practices selected");
  if (answeredSysQuestions < totalSysQuestions) confidenceMissing.push(`${totalSysQuestions - answeredSysQuestions} of ${totalSysQuestions} system questions unanswered`);
  const confidenceTooltip = confidenceLevel === "High"
    ? "You've completed most of the major inputs. Recommendations should be highly relevant."
    : `Confidence could improve: ${confidenceMissing.join("; ")}`;

  // Model grid
  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-[#FAF7F0]">
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-8 py-6 space-y-5 pb-20">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold font-display text-[#104080] uppercase">
                Your Model Matches
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-muted-foreground">
                  {recommendations.length} of {models.length} models matched your decision frame
                </p>
                <div className="relative group">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border cursor-default",
                    confidenceLevel === "High" && "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
                    confidenceLevel === "Medium" && "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
                    confidenceLevel === "Low" && "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
                  )}>
                    {confidenceLevel} Confidence
                  </span>
                  <div className="absolute left-0 top-full mt-1.5 z-50 w-64 p-3 rounded-lg border border-border bg-white shadow-lg text-xs text-muted-foreground leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity">
                    {confidenceTooltip}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedExportModels(new Set(recommendations.slice(0, 4).map((r: any) => r.modelId)));
                  setShowExportModal(true);
                }}
                disabled={recommendations.length === 0}
                className="gap-1.5 text-xs"
              >
                <Printer className="w-3.5 h-3.5" /> Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="gap-2 text-xs"
              >
                <Sparkles className="w-3.5 h-3.5" /> Refresh
              </Button>
            </div>
          </div>

          {/* 4-column grid */}
          {recommendations.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {recommendations.map((rec: any, i: number) => (
                <ModelCardPathB
                  key={rec.id ?? i}
                  rec={rec}
                  rank={i + 1}
                  onExplore={() => handleExploreModel(rec.modelId)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <LayoutGrid className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-base font-semibold mb-1">No matching models found</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Try adjusting your outcomes or practices in earlier steps.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Bottom nav */}
      <div className="shrink-0 flex items-center justify-between px-7 py-3.5 border-t bg-white">
        <Button variant="outline" size="sm" onClick={() => onGoToStep(6)} className="gap-2 text-xs">
          <ChevronLeft className="w-3.5 h-3.5" /> Experience Summary
        </Button>
        <span className="text-xs text-muted-foreground">Select a model to explore with AI</span>
      </div>

      {/* Export modal — select models to include */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#104080]">Export Recommendations</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            Your Experience Summary will be included on the first page. Select which models to include:
          </p>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {recommendations.map((rec: any, i: number) => {
              const m = rec.model || {};
              const isSelected = selectedExportModels.has(rec.modelId);
              return (
                <label key={rec.modelId ?? i} className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 cursor-pointer transition-colors">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      setSelectedExportModels((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(rec.modelId);
                        else next.delete(rec.modelId);
                        return next;
                      });
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#104080] truncate">{m.name ?? `Model ${i + 1}`}</p>
                    <p className="text-[10px] text-muted-foreground">{rec.score ?? 0}% Match</p>
                  </div>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setShowExportModal(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={selectedExportModels.size === 0}
              onClick={() => {
                setShowExportModal(false);
                setTimeout(() => {
                  document.body.classList.add("printing-export");
                  window.print();
                  document.body.classList.remove("printing-export");
                }, 200);
              }}
              className="gap-1.5 bg-[#104080] hover:bg-[#0A2A5C]"
            >
              <Printer className="w-3.5 h-3.5" /> Print ({selectedExportModels.size} model{selectedExportModels.size !== 1 ? "s" : ""})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print-only content rendered via portal to body for clean print isolation */}
      {createPortal(
        <div className="print-export-container" aria-hidden="true">
          <div className="print-page">
            <PrintExperienceSummary stepData={stepData} />
          </div>
          {recommendations
            .filter((rec: any) => selectedExportModels.has(rec.modelId))
            .map((rec: any, i: number) => (
              <div key={rec.modelId ?? i} className="print-page">
                <PrintModelDetail model={rec.model || {}} alignment={rec.alignment} />
              </div>
            ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Card (4-col grid version)
// ---------------------------------------------------------------------------

function ModelCardPathB({ rec, rank, onExplore }: { rec: any; rank: number; onExplore: () => void }) {
  const m = rec.model || {};
  const align = rec.alignment || {};
  const constraintFlags = align.constraintFlags || [];
  const matchPct = rec.score ?? 0;

  return (
    <div className="bg-white border border-border rounded-xl shadow-sm flex flex-col overflow-hidden hover:shadow-md hover:border-muted-foreground/30 transition-all">
      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-1.5 mb-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-[.12em] text-[#E04040]">#{rank}</span>
          <span className="text-[11px] font-extrabold bg-[#104080] text-white px-2.5 py-0.5 rounded-full">
            {matchPct}% Match
          </span>
        </div>
        <h4 className="text-sm font-extrabold text-[#104080] leading-snug mb-1.5 font-display">
          {m.name ?? `Model ${rank}`}
        </h4>
        <p className="text-xs text-muted-foreground line-clamp-4 flex-1 mb-2.5 leading-relaxed">
          {(m.description ?? "").slice(0, 220)}{(m.description ?? "").length > 220 ? "…" : ""}
        </p>

        {/* Watchout indicator */}
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
            constraintFlags.length === 0
              ? "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]"
              : "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]"
          )}>
            {constraintFlags.length === 0 ? "No Watchouts" : `${constraintFlags.length} Watchout${constraintFlags.length > 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* Single CTA */}
      <div className="px-3.5 pb-3.5 pt-2 border-t border-muted/30">
        <button
          onClick={onExplore}
          className="w-full flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider py-2.5 rounded-lg bg-[#104080] text-white hover:bg-[#0A2A5C] transition-colors"
        >
          Explore This Model <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Split View — Model Detail (60%) + Chat (40%)
// ---------------------------------------------------------------------------

function ModelSplitView({
  model,
  rec,
  sessionId,
  chatHistory,
  isPending,
  activeTopic,
  suggestedFollowUps,
  forceBranch,
  onSendMessage,
  onSetTopic,
  onAskAI,
  onBack,
  onClearConversation,
  onClearForceBranch,
}: {
  model: any;
  rec: any;
  sessionId: string;
  chatHistory: LocalChatMessage[];
  isPending: boolean;
  activeTopic: string | null;
  suggestedFollowUps: string[];
  forceBranch: string | null;
  onSendMessage: (msg: string, topic?: string | null) => void;
  onSetTopic: (topic: string | null) => void;
  onAskAI: (topic: string) => void;
  onBack: () => void;
  onClearConversation: () => void;
  onClearForceBranch: () => void;
}) {
  const alignment = rec?.alignment || null;

  return (
    <div className="w-full h-full flex overflow-hidden">
      {/* Left — model detail (60%) */}
      <div className="flex-[3] flex flex-col overflow-hidden border-r border-border">
        {/* Top bar */}
        <div className="shrink-0 px-5 py-3 border-b bg-white flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#104080] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Recommendations
          </button>
          <div className="w-px h-4 bg-border" />
          <span className="text-sm font-extrabold text-[#104080] font-display truncate">{model.name}</span>
        </div>

        {/* Model detail content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 md:p-8 space-y-8 pb-20">
            {/* Hero */}
            <div className="space-y-4">
              {model.grades && (
                <div className="flex flex-wrap gap-1.5">
                  {model.grades.split(",").map((g: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{g.trim()}</Badge>
                  ))}
                </div>
              )}
              <h1 className="text-3xl font-extrabold font-display text-[#104080] leading-tight">{model.name}</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">{model.description}</p>
              {model.link && (
                <a href={model.link} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 text-xs">
                    Visit Official Site <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </a>
              )}
            </div>

            {/* Your Alignment */}
            {alignment && (
              <section className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Target className="w-5 h-5 text-[#104080]" />
                  <h2 className="text-lg font-bold font-display text-[#104080] flex-1">Your Alignment</h2>
                </div>
                <p className="text-xs text-muted-foreground">Based on your decision frame.</p>
                <div className="grid grid-cols-3 gap-3">
                  <AlignmentDetailCard title="Outcomes" icon={<CheckCircle className="w-4 h-4" />} score={alignment.outcomesScore} />
                  <AlignmentDetailCard title="LEAPs" icon={<Zap className="w-4 h-4" />} score={alignment.leapsScore} />
                  <AlignmentDetailCard title="Practices" icon={<BookOpen className="w-4 h-4" />} score={alignment.practicesScore} />
                </div>
                {alignment.constraintFlags?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Watchouts ({alignment.constraintFlags.length})
                    </p>
                    {alignment.constraintFlags.map((flag: any, i: number) => (
                      <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-amber-900">{flag.domain}</p>
                            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">{flag.detail}</p>
                          </div>
                          <button
                            onClick={() => onAskAI(`watchout:${flag.domain}`)}
                            className="flex items-center gap-1 text-[10px] font-semibold text-amber-800/70 hover:text-amber-900 transition-colors px-2 py-1 rounded-md hover:bg-amber-100 shrink-0"
                          >
                            <Sparkles className="w-3 h-3" /> Ask AI
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Model Details — 3 columns */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <BookOpen className="w-5 h-5 text-[#104080]" />
                <h2 className="text-lg font-bold font-display text-[#104080] flex-1">Model Details</h2>
              </div>
              <div className="grid md:grid-cols-3 gap-8">
                <DetailList
                  title="Practices"
                  icon={<BookOpen className="w-4 h-4 text-[#104080]" />}
                  items={model.keyPractices?.split(",") || []}
                  color="bg-[#104080]"
                />
                <DetailList
                  title="Outcomes"
                  icon={<CheckCircle className="w-4 h-4 text-emerald-600" />}
                  items={model.outcomeTypes?.split(",") || []}
                  color="bg-emerald-500"
                />
                <DetailList
                  title="LEAPs"
                  icon={<Zap className="w-4 h-4 text-indigo-600" />}
                  items={(model.attributes as any)?.leaps?.split(",") || []}
                  color="bg-indigo-500"
                />
              </div>
            </section>

            {/* Reach */}
            {(model.attributes as any)?.reach && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#104080]" />
                  <h3 className="text-base font-bold text-[#104080]">Reach</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {(model.attributes as any).reach}
                </p>
              </section>
            )}

            {/* Proof Points */}
            {(model.attributes as any)?.impact && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-[#104080]" />
                  <h3 className="text-base font-bold text-[#104080]">Proof Points</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {(model.attributes as any).impact}
                </p>
              </section>
            )}

            {/* Implementation Materials */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#104080]" />
                <h3 className="text-base font-bold text-[#104080]">Implementation Materials</h3>
              </div>
              {(model.attributes as any)?.build_items ? (
                <ul className="space-y-1.5">
                  {(model.attributes as any).build_items.split(",").map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mt-2 shrink-0" />
                      {item.trim()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Not specified</p>
              )}
            </section>
          </div>
        </ScrollArea>
      </div>

      {/* Right — chat panel (40%) */}
      <div className="flex-[2] flex flex-col bg-white overflow-hidden">
        <ChatPanel
          modelName={model.name || "Model"}
          chatHistory={chatHistory}
          isPending={isPending}
          activeTopic={activeTopic}
          suggestedFollowUps={suggestedFollowUps}
          constraintFlags={alignment?.constraintFlags || []}
          forceBranch={forceBranch}
          onSendMessage={onSendMessage}
          onSetTopic={onSetTopic}
          onClearConversation={onClearConversation}
          onClearForceBranch={onClearForceBranch}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alignment Detail Card (in split view)
// ---------------------------------------------------------------------------

function AlignmentDetailCard({
  title,
  icon,
  score,
}: {
  title: string;
  icon: React.ReactNode;
  score: { label: string; pct: number; earned: number; max: number; matches: any[] } | null;
}) {
  if (!score || !score.matches?.length) return null;
  const matched = score.matches.filter((m: any) => m.matched).length;
  const { label, cls } = alignLabel(score.pct);
  return (
    <div className="bg-white border border-border rounded-xl p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-bold text-[#104080]">{title}</span>
        <span className={cn(
          "ml-auto text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border",
          cls === "hi" && "bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7]",
          cls === "mid" && "bg-[#FEF3C7] text-[#92400E] border-[#FCD34D]",
          cls === "lo" && "bg-[#FEE2E2] text-[#991B1B] border-[#FCA5A5]",
        )}>
          {label} ({score.pct}%)
        </span>
      </div>
      <div className="space-y-1">
        {score.matches.map((m: any, j: number) => (
          <div key={j} className="flex items-center gap-1.5 text-xs">
            {m.matched ? <Check className="w-3 h-3 text-emerald-600" /> : <X className="w-3 h-3 text-red-400" />}
            <span className={m.matched ? "text-foreground" : "text-muted-foreground"}>{m.name}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        {matched}/{score.matches.length} matched
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail List (Practices / Outcomes / LEAPs bullets)
// ---------------------------------------------------------------------------

function DetailList({
  title,
  icon,
  items,
  color,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  color: string;
}) {
  const filtered = items.map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      {filtered.length > 0 ? (
        <ul className="space-y-2">
          {filtered.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-foreground/80">
              <div className={cn("w-1.5 h-1.5 rounded-full mt-2 shrink-0", color)} />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not specified</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat Panel (right side of split view)
// ---------------------------------------------------------------------------

// Topic tree structure for guided chat flows
const TOPIC_TREE: Record<string, { label: string; children: { key: string; label: string; prompt: string }[] }> = {
  root: {
    label: "What would you like to explore?",
    children: [
      { key: "model", label: "Let\u2019s talk about the model", prompt: "" },
      { key: "watchouts", label: "Let\u2019s talk about the watchouts", prompt: "" },
    ],
  },
  model: {
    label: "What would you like to explore?",
    children: [
      { key: "model:executive_summary", label: "Executive Summary", prompt: "Give me an executive summary of this model." },
      { key: "model:summary", label: "Program Overview", prompt: "Tell me about this program." },
      { key: "model:core_approach", label: "Core Approach", prompt: "How does this program actually work?" },
      { key: "model:resources_provided", label: "Resources Provided", prompt: "What resources does this program provide?" },
      { key: "model:impact", label: "Impact", prompt: "What is the impact of this program?" },
      { key: "model:cost_and_access", label: "Cost & Access", prompt: "What does this program cost and how do we access it?" },
      { key: "model:pd_requirements", label: "Professional Development Requirements", prompt: "What professional development is required?" },
      { key: "model:technology_needs", label: "Technology Needs", prompt: "What technology does this program require?" },
      { key: "model:scheduling_impact", label: "Scheduling Impact", prompt: "How does this program affect our schedule?" },
      { key: "model:off_site_learning", label: "Off-Site Learning", prompt: "Does this program require off-site learning?" },
      { key: "model:partnerships", label: "Partnerships", prompt: "Does this program require partnerships?" },
      { key: "model:family_involvement", label: "Family Involvement", prompt: "Does this program require family involvement?" },
      { key: "model:data_sharing", label: "Data Sharing", prompt: "What is this program's data sharing policy?" },
    ],
  },
};

function TopicTreeSelector({
  onSelectTopic,
  onSendMessage,
  constraintFlags,
  forceBranch,
  onClearForceBranch,
  startExpanded = true,
}: {
  onSelectTopic: (topic: string | null) => void;
  onSendMessage: (msg: string, topic?: string | null) => void;
  constraintFlags: { domain: string; detail: string }[];
  forceBranch?: string | null;
  onClearForceBranch?: () => void;
  startExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(startExpanded);
  const [branch, setBranch] = useState<string>("root");

  useEffect(() => {
    if (forceBranch && (TOPIC_TREE[forceBranch] || forceBranch === "watchouts")) {
      setBranch(forceBranch);
      setIsExpanded(true);
      onClearForceBranch?.();
    }
  }, [forceBranch, onClearForceBranch]);

  const handleSelectAndCollapse = (key: string, prompt: string) => {
    onSelectTopic(key);
    onSendMessage(prompt, key);
    setIsExpanded(false);
    setBranch("root");
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => { setIsExpanded(true); setBranch("root"); }}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-[#E1E8F2]/30"
      >
        <span className="font-medium">Explore a topic</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    );
  }

  // Watchouts branch — dynamic items from constraintFlags
  if (branch === "watchouts") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setBranch("root")}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ChevronDown className="w-3 h-3 rotate-90" /> Back
          </button>
          <button
            onClick={() => { setIsExpanded(false); setBranch("root"); }}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground font-medium">Which watchout do you want to focus on?</p>
        <div className="space-y-1">
          {constraintFlags.map((flag, i) => (
            <button
              key={i}
              onClick={() => handleSelectAndCollapse(
                `watchout:${flag.domain}`,
                `Tell me about the "${flag.domain}" watchout for this model and what we should consider.`
              )}
              className="w-full text-left text-xs px-3 py-1.5 rounded-lg border border-border hover:border-amber-300 hover:bg-amber-50/50 transition-all text-muted-foreground hover:text-foreground flex items-start gap-2"
            >
              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium">{flag.domain}</span>
                <span className="text-muted-foreground ml-1 text-[10px]">— {flag.detail}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentBranch = TOPIC_TREE[branch] || TOPIC_TREE.root;
  const isRoot = branch === "root";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        {!isRoot ? (
          <button
            onClick={() => setBranch("root")}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ChevronDown className="w-3 h-3 rotate-90" /> Back
          </button>
        ) : (
          <p className="text-[10px] text-muted-foreground font-medium">{currentBranch.label}</p>
        )}
        <button
          onClick={() => { setIsExpanded(false); setBranch("root"); }}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className="w-3.5 h-3.5 rotate-180" />
        </button>
      </div>
      {!isRoot && (
        <p className="text-[10px] text-muted-foreground font-medium">{currentBranch.label}</p>
      )}
      <div className="space-y-1">
        {currentBranch.children.map((item) => {
          const isWatchouts = item.key === "watchouts";
          const noWatchouts = isWatchouts && constraintFlags.length === 0;
          return (
            <button
              key={item.key}
              onClick={() => {
                if (noWatchouts) return;
                if (isWatchouts) {
                  setBranch("watchouts");
                } else if (item.prompt) {
                  handleSelectAndCollapse(item.key, item.prompt);
                } else {
                  setBranch(item.key);
                }
              }}
              className={
                noWatchouts
                  ? "w-full text-left text-xs px-3 py-1.5 rounded-lg border border-border/50 bg-muted/10 text-muted-foreground/50 cursor-not-allowed"
                  : "w-full text-left text-xs px-3 py-1.5 rounded-lg border border-border hover:border-[#104080]/30 hover:bg-[#E1E8F2]/30 transition-all text-muted-foreground hover:text-foreground"
              }
            >
              <span>{item.label}</span>
              {isWatchouts && constraintFlags.length > 0 && (
                <span className="ml-2 text-[9px] text-amber-600 font-semibold">{constraintFlags.length}</span>
              )}
              {noWatchouts && (
                <span className="ml-2 text-[9px] text-muted-foreground/60">None flagged</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatPanel({
  modelName,
  chatHistory,
  isPending,
  activeTopic,
  suggestedFollowUps,
  constraintFlags,
  forceBranch,
  onSendMessage,
  onSetTopic,
  onClearConversation,
  onClearForceBranch,
}: {
  modelName: string;
  chatHistory: LocalChatMessage[];
  isPending: boolean;
  activeTopic: string | null;
  suggestedFollowUps: string[];
  constraintFlags: { domain: string; detail: string }[];
  forceBranch: string | null;
  onSendMessage: (msg: string, topic?: string | null) => void;
  onSetTopic: (topic: string | null) => void;
  onClearConversation: () => void;
  onClearForceBranch: () => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || isPending) return;
    setInput("");
    onSendMessage(msg, activeTopic);
  };

  const messages = chatHistory.filter((m) => m.role === "user" || (m.role === "assistant" && m.content));

  return (
    <>
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-[#104080]" />
        <span className="text-xs font-bold uppercase tracking-wider text-[#104080] flex-1 truncate">
          Chat about {modelName}
        </span>
        <button
          onClick={onClearConversation}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Persistent topic branches */}
      <div className="shrink-0 px-4 py-2 border-b bg-[#F5F0E8]/50">
        <TopicTreeSelector
          onSelectTopic={onSetTopic}
          onSendMessage={onSendMessage}
          constraintFlags={constraintFlags}
          forceBranch={forceBranch}
          onClearForceBranch={onClearForceBranch}
          startExpanded={chatHistory.length === 0}
        />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !isPending && (
          <p className="text-xs text-muted-foreground text-center">
            Ask anything about <span className="font-semibold">{modelName}</span>, or choose a topic above.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
              msg.role === "user"
                ? "bg-[#104080] text-white"
                : "bg-muted/50 text-foreground border border-border"
            )}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm max-w-none [&_p]:mb-1.5 [&_p]:leading-relaxed [&_ul]:mt-1 [&_li]:text-sm">
                  <ReactMarkdown>{msg.content || (msg.streaming ? "…" : "")}</ReactMarkdown>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isPending && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="bg-muted/50 border border-border rounded-xl px-3.5 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Suggested follow-ups */}
        {suggestedFollowUps.length > 0 && !isPending && messages.length > 1 && messages[messages.length - 1]?.role === "assistant" && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {suggestedFollowUps.map((q, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(q, activeTopic)}
                className="text-[11px] px-2.5 py-1.5 rounded-full border border-[#104080]/20 text-[#104080] hover:bg-[#104080]/5 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input + disclaimer */}
      <div className="shrink-0 border-t bg-white">
        <div className="px-4 py-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
              placeholder={`Ask about ${modelName}…`}
              className="min-h-[40px] max-h-[120px] text-sm resize-none"
              rows={1}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isPending}
              className="shrink-0 h-10 w-10 bg-[#104080] hover:bg-[#0A2A5C]"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center pb-2 px-4">
          Model Advisor is AI-powered and can make mistakes. Please double-check responses.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Print-only components (rendered in hidden container, visible only during print)
// ---------------------------------------------------------------------------

function PrintExperienceSummary({ stepData }: { stepData: Record<string, any> }) {
  const exp = (stepData.experience as Record<string, any>) || {};
  const s1 = stepData["1"] || {};
  const s2 = stepData["2"] || {};
  const s3 = stepData["3"] || {};
  const s4 = stepData["4"] || {};
  const outcomes: TaxonomySelection[] = s2.selected_outcomes || [];
  const leaps: TaxonomySelection[] = s2.selected_leaps || [];
  const primaryPracticeIds = new Set<number>(
    ((exp.primaryPractices || []) as TaxonomySelection[]).map((p) => p.id)
  );
  const primaryPractices: TaxonomySelection[] = exp.primaryPractices || [];
  const additionalPractices: TaxonomySelection[] = ((s3.selected_practices || []) as TaxonomySelection[]).filter(
    (p) => !primaryPracticeIds.has(p.id)
  );
  const allPractices = [...primaryPractices, ...additionalPractices];

  const impLabel = (imp: string) =>
    imp === "most_important" ? "Must Have" : imp === "important" ? "Important" : "Nice to Have";

  return (
    <div className="p-6 font-sans" style={{ fontSize: "10px" }}>
      {/* Navy banner */}
      <div style={{ backgroundColor: "#104080", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px" }}>
        <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8FD9CB", marginBottom: "2px" }}>Experience</p>
        <h1 style={{ fontSize: "16px", fontWeight: 800, textTransform: "uppercase", color: "white", margin: 0 }}>
          {exp.name || "Experience Summary"}
        </h1>
        {exp.description && <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "3px" }}>{exp.description}</p>}
        {exp.targetedGradeBands?.length > 0 && (
          <span style={{ fontSize: "8px", fontWeight: 700, color: "#8FD9CB", display: "inline-block", marginTop: "4px" }}>
            Grades: {exp.targetedGradeBands.join(", ")}
          </span>
        )}
      </div>

      {/* Outcomes / LEAPs / Practices */}
      <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#E04040", marginBottom: "2px" }}>What Students Are Building Towards</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
        {/* Outcomes */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ backgroundColor: "#104080", padding: "4px 8px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "white" }}>Outcomes ({outcomes.length})</span>
          </div>
          <div style={{ padding: "6px 8px" }}>
            {outcomes.map((o, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: o.importance === "most_important" ? "#E04040" : "#5070A0", flexShrink: 0 }} />
                <span style={{ fontSize: "9px", color: "#1f2937", flex: 1 }}>{o.name}</span>
                <span style={{ fontSize: "7px", color: "#9ca3af" }}>{impLabel(o.importance)}</span>
              </div>
            ))}
            {s2.outcomes_summary && (
              <div style={{ marginTop: "4px", padding: "3px 5px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                <p style={{ fontSize: "8px", color: "#6b7280", lineHeight: "1.3", margin: 0 }}>{s2.outcomes_summary}</p>
              </div>
            )}
          </div>
        </div>

        {/* LEAPs */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ backgroundColor: "#104080", padding: "4px 8px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "white" }}>LEAPs ({leaps.length})</span>
          </div>
          <div style={{ padding: "6px 8px" }}>
            {leaps.map((l, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: l.importance === "most_important" ? "#E04040" : "#5070A0", flexShrink: 0 }} />
                <span style={{ fontSize: "9px", color: "#1f2937", flex: 1 }}>{l.name}</span>
                <span style={{ fontSize: "7px", color: "#9ca3af" }}>{impLabel(l.importance)}</span>
              </div>
            ))}
            {s2.leaps_summary && (
              <div style={{ marginTop: "4px", padding: "3px 5px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                <p style={{ fontSize: "8px", color: "#6b7280", lineHeight: "1.3", margin: 0 }}>{s2.leaps_summary}</p>
              </div>
            )}
          </div>
        </div>

        {/* Practices */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{ backgroundColor: "#104080", padding: "4px 8px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "white" }}>Practices ({allPractices.length})</span>
          </div>
          <div style={{ padding: "6px 8px" }}>
            {allPractices.map((p, i) => {
              const isPrimary = primaryPracticeIds.has(p.id);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px", backgroundColor: isPrimary ? "#FCE5E5" : "transparent", padding: isPrimary ? "1px 3px" : "0", borderRadius: "3px" }}>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: isPrimary ? "#E04040" : "#5070A0", flexShrink: 0 }} />
                  <span style={{ fontSize: "9px", color: "#1f2937", flex: 1 }}>{p.name}</span>
                  {isPrimary && <span style={{ fontSize: "7px", color: "#9ca3af" }}>Primary</span>}
                </div>
              );
            })}
            {s3.experience_summary && (
              <div style={{ marginTop: "4px", padding: "3px 5px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                <p style={{ fontSize: "8px", color: "#6b7280", lineHeight: "1.3", margin: 0 }}>{s3.experience_summary}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Elements */}
      <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#E04040", marginBottom: "2px" }}>System Context</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
        {SYS_GROUPS.map((g) => {
          const hasQuestionData = g.questions.some((q) => !!s4[q.key]);
          const hasContext = !!s4[g.contextKey];
          if (!hasQuestionData && !hasContext) return null;
          return (
            <div key={g.key} style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "5px 7px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
                <span style={{ fontSize: "10px" }}>{g.icon}</span>
                <span style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", color: "#104080" }}>{g.label}</span>
              </div>
              {g.questions.map((q) => {
                const val = s4[q.key];
                if (!val) return null;
                return (
                  <div key={q.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ fontSize: "8px", color: "#6b7280" }}>{q.text}</span>
                    <span style={{
                      fontSize: "7px", fontWeight: 700, textTransform: "uppercase",
                      padding: "1px 5px", borderRadius: "8px",
                      backgroundColor: (val.toLowerCase() === "yes" || val.toLowerCase() === "definitely" || val === "1:1") ? "#DEF2EE" : (val.toLowerCase() === "no" || val.toLowerCase() === "none") ? "#FCE5E5" : "#f3f4f6",
                      color: (val.toLowerCase() === "yes" || val.toLowerCase() === "definitely" || val === "1:1") ? "#2C8A78" : (val.toLowerCase() === "no" || val.toLowerCase() === "none") ? "#C42E2E" : "#6b7280",
                    }}>
                      {val.length > 20 ? val.slice(0, 20) + "…" : val}
                    </span>
                  </div>
                );
              })}
              {hasContext && (
                <div style={{ marginTop: "3px", padding: "3px 5px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                  <p style={{ fontSize: "7px", color: "#6b7280", lineHeight: "1.3", margin: 0 }}>{(s4[g.contextKey] as string).slice(0, 100)}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Community context */}
      {s1.context && (
        <div style={{ marginTop: "8px", padding: "5px 8px", backgroundColor: "#F4EFE6", borderLeft: "3px solid #3FB7A0", borderRadius: "4px" }}>
          <p style={{ fontSize: "8px", fontWeight: 700, color: "#104080", textTransform: "uppercase", marginBottom: "2px" }}>Community Context</p>
          <p style={{ fontSize: "8px", color: "#4b5563", lineHeight: "1.3", margin: 0 }}>{(s1.context as string).slice(0, 250)}</p>
        </div>
      )}
    </div>
  );
}

function PrintModelDetail({ model, alignment }: { model: any; alignment: any }) {
  const outcomeMatches = alignment?.outcomesScore?.matches || [];
  const leapMatches = alignment?.leapsScore?.matches || [];
  const practiceMatches = alignment?.practicesScore?.matches || [];
  const constraintFlags = alignment?.constraintFlags || [];

  return (
    <div className="p-6 font-sans text-[11px]">
      {/* Header row: grade badges + model name */}
      <div className="flex items-center gap-3 mb-2">
        {model.grades && (
          <div className="flex gap-1">
            {model.grades.split(",").map((g: string, i: number) => (
              <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-700">
                {g.trim()}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-xl font-bold text-[#104080]">{model.name}</h1>
      </div>

      {/* Description */}
      <p className="text-gray-600 leading-snug mb-3">{model.description}</p>

      {model.link && (
        <p className="text-[10px] text-[#104080] mb-3">Visit: {model.link}</p>
      )}

      {/* Alignment + Watchouts in a compact grid */}
      {alignment && (
        <div className="mb-3">
          <h2 className="text-xs font-bold text-[#104080] mb-2">Your Alignment</h2>
          <div className="grid grid-cols-3 gap-3 mb-2">
            {outcomeMatches.length > 0 && (
              <div className="border border-gray-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-[#104080]">Outcomes</span>
                  <span className={cn("text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                    alignment.outcomesScore?.label === "High" ? "bg-green-100 text-green-800" :
                    alignment.outcomesScore?.label === "Medium" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                  )}>{alignment.outcomesScore?.pct}%</span>
                </div>
                {outcomeMatches.map((m: any, j: number) => (
                  <p key={j} className="text-[10px] text-gray-700 leading-tight">
                    {m.matched ? "✓" : "✗"} {m.name}
                  </p>
                ))}
              </div>
            )}
            {leapMatches.length > 0 && (
              <div className="border border-gray-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-[#104080]">LEAPs</span>
                  <span className={cn("text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                    alignment.leapsScore?.label === "High" ? "bg-green-100 text-green-800" :
                    alignment.leapsScore?.label === "Medium" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                  )}>{alignment.leapsScore?.pct}%</span>
                </div>
                {leapMatches.map((m: any, j: number) => (
                  <p key={j} className="text-[10px] text-gray-700 leading-tight">
                    {m.matched ? "✓" : "✗"} {m.name}
                  </p>
                ))}
              </div>
            )}
            {practiceMatches.length > 0 && (
              <div className="border border-gray-200 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-[#104080]">Practices</span>
                  <span className={cn("text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                    alignment.practicesScore?.label === "High" ? "bg-green-100 text-green-800" :
                    alignment.practicesScore?.label === "Medium" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                  )}>{alignment.practicesScore?.pct}%</span>
                </div>
                {practiceMatches.map((m: any, j: number) => (
                  <p key={j} className="text-[10px] text-gray-700 leading-tight">
                    {m.matched ? "✓" : "✗"} {m.name}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Watchouts — compact inline */}
          {constraintFlags.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase text-amber-800">Watchouts ({constraintFlags.length}): </span>
              {constraintFlags.map((flag: any, i: number) => (
                <span key={i} className="text-[10px] text-amber-700 inline">
                  {flag.domain}: {flag.detail}{i < constraintFlags.length - 1 ? " · " : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Model Details — compact 3-col */}
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <h3 className="text-[10px] font-bold text-[#104080] uppercase border-b pb-0.5 mb-1">Practices</h3>
          {(model.keyPractices?.split(",") || []).map((item: string, i: number) => (
            <p key={i} className="text-[10px] text-gray-700 leading-tight">• {item.trim()}</p>
          ))}
        </div>
        <div>
          <h3 className="text-[10px] font-bold text-emerald-700 uppercase border-b pb-0.5 mb-1">Outcomes</h3>
          {(model.outcomeTypes?.split(",") || []).map((item: string, i: number) => (
            <p key={i} className="text-[10px] text-gray-700 leading-tight">• {item.trim()}</p>
          ))}
        </div>
        <div>
          <h3 className="text-[10px] font-bold text-indigo-700 uppercase border-b pb-0.5 mb-1">LEAPs</h3>
          {((model.attributes as any)?.leaps?.split(",") || []).map((item: string, i: number) => (
            <p key={i} className="text-[10px] text-gray-700 leading-tight">• {item.trim()}</p>
          ))}
        </div>
      </div>

      {/* Reach / Proof Points / Implementation — compact */}
      <div className="grid grid-cols-3 gap-4">
        {(model.attributes as any)?.reach && (
          <div>
            <h3 className="text-[10px] font-bold text-[#104080] uppercase mb-0.5">Reach</h3>
            <p className="text-[10px] text-gray-600 leading-snug">{(model.attributes as any).reach}</p>
          </div>
        )}
        {(model.attributes as any)?.impact && (
          <div>
            <h3 className="text-[10px] font-bold text-[#104080] uppercase mb-0.5">Proof Points</h3>
            <p className="text-[10px] text-gray-600 leading-snug">{(model.attributes as any).impact}</p>
          </div>
        )}
        {(model.attributes as any)?.build_items && (
          <div>
            <h3 className="text-[10px] font-bold text-[#104080] uppercase mb-0.5">Implementation</h3>
            <p className="text-[10px] text-gray-600 leading-snug">{(model.attributes as any).build_items}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landscape Experience Summary for print — matches on-screen design
// ---------------------------------------------------------------------------

function PrintExperienceSummaryLandscape({ stepData }: { stepData: Record<string, any> }) {
  const exp = (stepData.experience as Record<string, any>) || {};
  const s1 = stepData["1"] || {};
  const s2 = stepData["2"] || {};
  const s3 = stepData["3"] || {};
  const s4 = stepData["4"] || {};
  const s5 = stepData["5"] || {};
  const outcomes: TaxonomySelection[] = s2.selected_outcomes || [];
  const leaps: TaxonomySelection[] = s2.selected_leaps || [];
  const primaryPracticeIds = new Set<number>(
    ((exp.primaryPractices || []) as TaxonomySelection[]).map((p) => p.id)
  );
  const primaryPractices: TaxonomySelection[] = exp.primaryPractices || [];
  const additionalPractices: TaxonomySelection[] = ((s3.selected_practices || []) as TaxonomySelection[]).filter(
    (p) => !primaryPracticeIds.has(p.id)
  );
  const allPractices = [...primaryPractices, ...additionalPractices];

  const impLabel = (imp: string) =>
    imp === "most_important" ? "Must Have" : imp === "important" ? "Important" : "Nice to Have";

  return (
    <div className="p-5 font-sans" style={{ fontSize: "9px" }}>
      {/* Banner matching the navy header on-screen */}
      <div style={{ backgroundColor: "#104080", padding: "10px 16px", borderRadius: "8px", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8FD9CB", marginBottom: "2px" }}>Experience</p>
          <h1 style={{ fontSize: "14px", fontWeight: 800, textTransform: "uppercase", color: "white", margin: 0 }}>
            {exp.name || "Untitled Experience"}
          </h1>
          {exp.description && <p style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>{exp.description}</p>}
        </div>
        <div style={{ textAlign: "right" }}>
          {exp.targetedGradeBands?.length > 0 && (
            <span style={{ fontSize: "8px", fontWeight: 700, color: "#8FD9CB", border: "1px solid rgba(143,217,203,0.4)", borderRadius: "10px", padding: "2px 8px" }}>
              Grades: {exp.targetedGradeBands.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* Section: What Students Are Building Towards */}
      <div style={{ marginBottom: "10px" }}>
        <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#E04040", marginBottom: "2px" }}>Experience Summary</p>
        <h2 style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "#104080", margin: "0 0 6px 0" }}>What Students Are Building Towards</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          {/* Outcomes card */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ backgroundColor: "#104080", padding: "5px 8px" }}>
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "white" }}>Outcomes</span>
              <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", marginLeft: "6px" }}>{outcomes.length}</span>
            </div>
            <div style={{ padding: "6px 8px" }}>
              {outcomes.map((o, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: o.importance === "most_important" ? "#E04040" : o.importance === "important" ? "#5070A0" : "#ccc", flexShrink: 0 }} />
                  <span style={{ fontSize: "8px", color: "#1f2937", flex: 1 }}>{o.name}</span>
                  <span style={{ fontSize: "7px", color: "#9ca3af" }}>{impLabel(o.importance)}</span>
                </div>
              ))}
              {s2.outcomes_summary && (
                <div style={{ marginTop: "4px", padding: "4px 6px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                  <p style={{ fontSize: "8px", color: "#6b7280", lineHeight: "1.3" }}>{s2.outcomes_summary}</p>
                </div>
              )}
            </div>
          </div>

          {/* LEAPs card */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ backgroundColor: "#104080", padding: "5px 8px" }}>
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "white" }}>LEAPs</span>
              <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", marginLeft: "6px" }}>{leaps.length}</span>
            </div>
            <div style={{ padding: "6px 8px" }}>
              {leaps.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px" }}>
                  <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: l.importance === "most_important" ? "#E04040" : l.importance === "important" ? "#5070A0" : "#ccc", flexShrink: 0 }} />
                  <span style={{ fontSize: "8px", color: "#1f2937", flex: 1 }}>{l.name}</span>
                  <span style={{ fontSize: "7px", color: "#9ca3af" }}>{impLabel(l.importance)}</span>
                </div>
              ))}
              {s2.leaps_summary && (
                <div style={{ marginTop: "4px", padding: "4px 6px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                  <p style={{ fontSize: "8px", color: "#6b7280", lineHeight: "1.3" }}>{s2.leaps_summary}</p>
                </div>
              )}
            </div>
          </div>

          {/* Practices card */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
            <div style={{ backgroundColor: "#104080", padding: "5px 8px" }}>
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "white" }}>Practices</span>
              <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.5)", marginLeft: "6px" }}>{allPractices.length}</span>
            </div>
            <div style={{ padding: "6px 8px" }}>
              {allPractices.map((p, i) => {
                const isPrimary = primaryPracticeIds.has(p.id);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2px", backgroundColor: isPrimary ? "#FCE5E5" : "transparent", padding: isPrimary ? "1px 4px" : "0", borderRadius: "3px" }}>
                    <span style={{ width: "4px", height: "4px", borderRadius: "50%", backgroundColor: isPrimary ? "#E04040" : "#5070A0", flexShrink: 0 }} />
                    <span style={{ fontSize: "8px", color: "#1f2937", flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: "7px", color: "#9ca3af" }}>{isPrimary ? "Primary" : ""}</span>
                  </div>
                );
              })}
              {s3.experience_summary && (
                <div style={{ marginTop: "4px", padding: "4px 6px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                  <p style={{ fontSize: "8px", color: "#6b7280", lineHeight: "1.3" }}>{s3.experience_summary}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section: System Elements */}
      <div>
        <p style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#E04040", marginBottom: "2px" }}>System Context</p>
        <h2 style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: "#104080", margin: "0 0 6px 0" }}>System Elements</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
          {SYS_GROUPS.map((g) => {
            const hasQuestionData = g.questions.some((q) => !!s4[q.key]);
            const hasContext = !!s4[g.contextKey];
            if (!hasQuestionData && !hasContext) return null;
            return (
              <div key={g.key} style={{ border: "1px solid #e5e7eb", borderRadius: "6px", padding: "5px 7px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "3px" }}>
                  <span style={{ fontSize: "10px" }}>{g.icon}</span>
                  <span style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#104080" }}>{g.label}</span>
                </div>
                {g.questions.map((q) => {
                  const val = s4[q.key];
                  if (!val) return null;
                  return (
                    <div key={q.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                      <span style={{ fontSize: "8px", color: "#6b7280" }}>{q.text}</span>
                      <span style={{
                        fontSize: "7px", fontWeight: 700, textTransform: "uppercase",
                        padding: "1px 5px", borderRadius: "8px",
                        backgroundColor: (val.toLowerCase() === "yes" || val.toLowerCase() === "definitely" || val === "1:1" || val.toLowerCase().startsWith("high") || val === "Full flexibility") ? "#DEF2EE" : (val.toLowerCase() === "no" || val.toLowerCase() === "none") ? "#FCE5E5" : "#f3f4f6",
                        color: (val.toLowerCase() === "yes" || val.toLowerCase() === "definitely" || val === "1:1" || val.toLowerCase().startsWith("high") || val === "Full flexibility") ? "#2C8A78" : (val.toLowerCase() === "no" || val.toLowerCase() === "none") ? "#C42E2E" : "#6b7280",
                      }}>
                        {val.length > 25 ? val.slice(0, 25) + "…" : val}
                      </span>
                    </div>
                  );
                })}
                {hasContext && (
                  <div style={{ marginTop: "3px", padding: "3px 5px", backgroundColor: "#F4EFE6", borderLeft: "2px solid #3FB7A0", borderRadius: "3px" }}>
                    <p style={{ fontSize: "7px", color: "#6b7280", lineHeight: "1.3", margin: 0 }}>{(s4[g.contextKey] as string).slice(0, 120)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Community context if present */}
      {s1.context && (
        <div style={{ marginTop: "8px", padding: "5px 8px", backgroundColor: "#F4EFE6", borderLeft: "3px solid #3FB7A0", borderRadius: "4px" }}>
          <p style={{ fontSize: "8px", fontWeight: 700, color: "#104080", textTransform: "uppercase", marginBottom: "2px" }}>Community Context</p>
          <p style={{ fontSize: "8px", color: "#4b5563", lineHeight: "1.3", margin: 0 }}>{(s1.context as string).slice(0, 300)}</p>
        </div>
      )}
    </div>
  );
}
