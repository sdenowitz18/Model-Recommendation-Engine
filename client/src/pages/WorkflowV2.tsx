import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useSession } from "@/hooks/use-advisor";
import { api, buildUrl, type StepChatResponse } from "@shared/routes";
import { WORKFLOW_STEPS, OUTCOME_GROUPS, PRACTICE_GROUPS, type WorkflowProgress, type StepConversation, type StepDocument, type TaxonomyItem, type TaxonomySelection, type KnowledgeBaseEntry } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTalkItOut } from "@/hooks/use-talk-it-out";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import logoUrl from "@/assets/transcend-logo.svg";
import {
  Send, Sparkles, User, Loader2, RotateCcw, Check, ChevronRight,
  Upload, FileText, X, Settings, ArrowRight, RefreshCcw, School,
  Target, BookOpen, AlertTriangle, Sliders, LayoutGrid, ClipboardCheck,
  Paperclip, Download, ChevronDown, ChevronUp, ChevronLeft, ExternalLink,
  GripVertical, Plus, Minus, ArrowUp, ArrowDown, MessageSquare,
  CloudUpload, Bot, Briefcase, GraduationCap, Layers, Trophy, Users, Pencil,
  MessageCircle, Maximize2, Minimize2, Split, Zap,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DecisionFramePathB, RecommendationsPathB } from "./DecisionPackagePathB";

// Vercel serverless functions have a 4.5 MB request body limit.
// Warn users who try to upload files larger than this.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB (leave headroom for multipart overhead)

async function uploadDocumentFile(
  file: File,
  sessionId: string | number,
  stepNumber: number,
): Promise<{ fileContent?: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please upload files under 4 MB. For large PDFs, try exporting just the relevant pages or compressing the file first.`,
    );
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(
    `/api/sessions/${sessionId}/workflow/documents/${stepNumber}/upload`,
    { method: "POST", body: formData, credentials: "include" },
  );
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming",
];

const STEP_ICONS: Record<number, any> = {
  0: CloudUpload,
  1: School,
  2: Target,
  3: BookOpen,
  4: Settings,
  5: Sliders,
  6: ClipboardCheck,
  7: LayoutGrid,
  8: Bot,
};

// =========================================================================
// V2 PROTOTYPE — Experience-scoped workflow path
// =========================================================================
//
// v2 introduces a path picker after Step 1. Users choose between defining
// aims for their whole CCL program (Path A — same as v1) or defining a
// specific experience (Path B — adds a new "Experience" step in front of
// Aims, and removes the standalone Practices step since practices are
// captured inside the Experience step).
//
// Storage strategy: v2 reuses v1 stepData keys ("1" school, "2" aims,
// "3" practices, "4" system elements, etc.) so the recommendation engine
// in server/recommendation-engine.ts works unchanged. v2-specific data
// (path choice, experience-level fields) lives under new top-level keys
// in stepData ("designScope", "experience").
//
// For Path B: the Experience step renders at activeStep === 2 and writes
// to stepData["3"].selected_practices (so practices are visible to the
// engine), plus stepData.experience for v2-specific metadata. Aims then
// renders at activeStep === 3 and writes to stepData["2"] as it does in
// v1. The chevron labels are remapped per-path so users see a coherent
// progression even though the underlying activeStep integers differ from
// v1's natural ordering.

type DesignScope = "whole_program" | "specific_experience";

interface V2StepDef {
  /** Integer used as activeStep / data-testid; aligned with v1 step numbers
   *  for the steps that share keys (1=school, 4=system_elements, etc.).
   *  In Path B, step numbers 2 and 3 are remapped: 2 = experience panel
   *  (writes to stepData["3"] practices), 3 = aims (writes to stepData["2"]). */
  number: number;
  label: string;
  icon: any;
}

const V2_STEPS_PATH_A: V2StepDef[] = [
  { number: 1, label: "School Context", icon: School },
  { number: 0, label: "Upload Documents", icon: CloudUpload },
  { number: 2, label: "Outcomes", icon: Target },
  { number: 9, label: "LEAPs", icon: Zap },
  { number: 3, label: "Practices", icon: BookOpen },
  { number: 4, label: "System Elements", icon: Settings },
  { number: 5, label: "Model Preferences", icon: Sliders },
  { number: 6, label: "Experience Summary", icon: ClipboardCheck },
  { number: 7, label: "Recommendations", icon: LayoutGrid },
  { number: 8, label: "Explore Model", icon: Bot },
];

const V2_STEPS_PATH_B: V2StepDef[] = [
  { number: 1, label: "School Context", icon: School },
  { number: 2, label: "Define Experience", icon: BookOpen },
  { number: 3, label: "Outcomes", icon: Target },
  { number: 9, label: "LEAPs", icon: Zap },
  { number: 4, label: "System Elements", icon: Settings },
  { number: 5, label: "Model Preferences", icon: Sliders },
  { number: 6, label: "Experience Summary", icon: ClipboardCheck },
  { number: 7, label: "Recommendations", icon: LayoutGrid },
  { number: 8, label: "Explore Model", icon: Bot },
];

/** Only School Context is shown until the user commits to a path. */
const V2_SCHOOL_CONTEXT_ONLY: V2StepDef = { number: 1, label: "School Context", icon: School };

type V2HeaderRow =
  | { type: "real"; step: V2StepDef }
  | { type: "pathPicker" };

/** Build header chevrons: before path selection show School ± Choose path; afterward each path's full pill list. */
function buildV2HeaderRows(designScope: DesignScope | undefined, showPathPicker: boolean): V2HeaderRow[] {
  if (!designScope) {
    const rows: V2HeaderRow[] = [{ type: "real", step: V2_SCHOOL_CONTEXT_ONLY }];
    if (showPathPicker) rows.push({ type: "pathPicker" });
    return rows;
  }
  if (designScope === "whole_program") return V2_STEPS_PATH_A.map((step) => ({ type: "real", step }));
  return V2_STEPS_PATH_B.map((step) => ({ type: "real", step }));
}

/** Targeted grade-band sub-options gated by the school-context grade band. */
const EXPERIENCE_GRADE_OPTIONS: Record<string, string[]> = {
  "K-5": ["K", "1", "2", "3", "4", "5"],
  "6-8": ["6", "7", "8"],
  "9-12": ["9", "10", "11", "12"],
  "Post-secondary": ["Post-secondary"],
};

function useWorkflowProgress(sessionId: string | null) {
  return useQuery<WorkflowProgress>({
    queryKey: [api.workflow.getProgress.path, sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error("No session");
      const url = buildUrl(api.workflow.getProgress.path, { sessionId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch progress");
      return res.json();
    },
    enabled: !!sessionId,
  });
}

function useStepConversation(sessionId: string | null, stepNumber: number) {
  return useQuery<StepConversation[]>({
    queryKey: [api.workflow.getConversation.path, sessionId, stepNumber],
    queryFn: async () => {
      if (!sessionId) return [];
      const url = buildUrl(api.workflow.getConversation.path, { sessionId, stepNumber });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!sessionId,
  });
}

function useStepDocuments(sessionId: string | null, stepNumber: number) {
  return useQuery<StepDocument[]>({
    queryKey: [api.workflow.getDocuments.path, sessionId, stepNumber],
    queryFn: async () => {
      if (!sessionId) return [];
      const url = buildUrl(api.workflow.getDocuments.path, { sessionId, stepNumber });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch documents");
      return res.json();
    },
    enabled: !!sessionId,
  });
}

function useTaxonomyItems(stepNumber: number) {
  return useQuery<TaxonomyItem[]>({
    queryKey: [api.taxonomy.getItems.path, stepNumber],
    queryFn: async () => {
      const url = buildUrl(api.taxonomy.getItems.path, { stepNumber });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch taxonomy items");
      return res.json();
    },
    staleTime: 0, // Always refetch — admin may update taxonomy items at any time
  });
}

// ---------------------------------------------------------------------------
// Step Transition Page — full-screen framing screen shown between top-level steps
// ---------------------------------------------------------------------------

const STEP_TRANSITION_CONTENT: Record<number, { title: string; body: string }> = {
  1: {
    title: "School Context",
    body: "Let's start with the basics — your school, district, grade band, and any community context that shapes the experience you're designing.",
  },
  2: {
    title: "Outcomes",
    body: "What outcomes matter most for the experience you're building? Select only what's directly relevant — not everything your school aspires to.",
  },
  9: {
    title: "LEAPs",
    body: "Now let's capture the learning principles that should define this experience. LEAPs describe the design moves and environment you're trying to create.",
  },
  3: {
    title: "Learning Experience & Practices",
    body: "What practices and learning experiences are central to the experience you're designing? Focus on what's relevant to this initiative.",
  },
  4: {
    title: "System Elements",
    body: "What's possible given your context? We'll walk through six operational areas — curriculum, partnerships, scheduling, technology, staffing, and budget.",
  },
  5: {
    title: "Model Preferences",
    body: "Share any preferences for model type, existing solutions you want to keep, or anything that would be a dealbreaker.",
  },
  6: {
    title: "Experience Summary",
    body: "Before we generate your recommendations, let's review a consolidated view of your context, aims, practices, and system constraints.",
  },
  7: {
    title: "Your Recommendations",
    body: "Based on everything you've shared, we're ready to suggest the learning models that best fit what you're designing.",
  },
};

// Path B uses different copy for steps 2 and 3 because the experience step
// replaces the generic Aims/Practices intro. Other steps fall back to the
// shared STEP_TRANSITION_CONTENT.
const STEP_TRANSITION_CONTENT_PATH_B: Record<number, { title: string; body: string }> = {
  2: {
    title: "Define Your Experience",
    body: "Tell us about the experience you're designing. We'll capture the basics, the practices it should incorporate, and any documents you have so we can find models that fit.",
  },
  3: {
    title: "Outcomes",
    body: "What outcomes matter most for the experience you just defined? Select only what's directly relevant.",
  },
  9: {
    title: "LEAPs",
    body: "Now let's capture the learning principles that should define this experience. LEAPs describe the design moves and environment you're trying to create.",
  },
};

interface StepTransitionPageProps {
  stepNumber: number;
  onContinue: () => void;
  onBack: () => void;
  isLoading?: boolean;
  designScope?: DesignScope;
}

function StepTransitionPage({ stepNumber, onContinue, onBack, isLoading, designScope }: StepTransitionPageProps) {
  const content = (designScope === "specific_experience" && STEP_TRANSITION_CONTENT_PATH_B[stepNumber])
    || STEP_TRANSITION_CONTENT[stepNumber];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); onContinue(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); onBack(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onContinue, onBack]);

  if (!content) return null;

  return (
    <div className="w-full h-full flex items-center justify-center bg-background">
      <div style={{ animation: "schoolFadeIn 0.4s ease forwards" }} className="w-full max-w-lg px-8 space-y-8">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Up next</p>
        <div className="space-y-3">
          <div className="text-8xl font-display font-bold text-primary/10 leading-none select-none tabular-nums">
            {stepNumber}
          </div>
          <h1 className="text-5xl font-display font-bold text-foreground leading-tight">
            {content.title}
          </h1>
        </div>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
          {content.body}
        </p>
        <p className="text-xs text-muted-foreground">Press → or Enter to begin</p>
      </div>

      {/* Floating nav */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        <button type="button" onClick={onBack} title="Back"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <button type="button" onClick={onContinue} disabled={isLoading} title="Begin"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
          {isLoading ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
        </button>
      </div>
    </div>
  );
}

export default function WorkflowV2() {
  // Read sessionId from URL params (/ccl-v2/:sessionId) if present
  const params = useParams<{ sessionId?: string }>();
  const { sessionId, isLoading: isSessionLoading } = useSession(params.sessionId ?? null);
  const { data: progress, refetch: refetchProgress } = useWorkflowProgress(sessionId);
  const [activeStep, setActiveStep] = useState(1);
  const { toast } = useToast();
  const qc = useQueryClient();

  // Transition page state — shown between top-level step advances
  const [transitionToStep, setTransitionToStep] = useState<number | null>(null);
  const transitionActionRef = useRef<() => void>(() => {});
  /** Stores the intended activeStep to set after confirmStepMutation resolves, overriding the default stepNumber+1. */
  const intendedNextStepRef = useRef<number | null>(null);
  /** True once we've set activeStep from the initial progress load — prevents background refetches from overriding manual navigation. */
  const hasInitializedActiveStep = useRef(false);
  /**
   * Set to true when the user manually clicks a chevron while a confirmStep mutation is in-flight.
   * Prevents onSuccess from overriding the user's explicit navigation choice.
   */
  const userManuallyNavigatedRef = useRef(false);

  // v2: path picker screen state — shown after Step 1 confirmation when the
  // user hasn't yet picked a design scope (whole CCL program vs specific
  // experience). Once picked, the rest of the flow renders accordingly.
  const [showPathPicker, setShowPathPicker] = useState(false);
  const [showPathBInterstitial, setShowPathBInterstitial] = useState(false);

  // Incremented whenever the user clicks "Generate Model Recommendations" from
  // the Decision Frame (step 6), so RecommendationsView always triggers a fresh run.
  const [recommendRefreshKey, setRecommendRefreshKey] = useState(0);

  useEffect(() => {
    if (!progress) return;
    if (showPathPicker) return;
    // Only set activeStep from server progress on initial load.
    // After that, all navigation is driven by confirmStepMutation.onSuccess and
    // chevron clicks — background refetches must not override the user's position.
    // Also never interrupt an in-progress transition.
    if (hasInitializedActiveStep.current) return;
    if (transitionToStep !== null) return;

    const data = (progress.stepData as Record<string, any>) || {};
    const scope = data.designScope as DesignScope | undefined;
    let next = progress.currentStep;

    // v2 skips the global intro-upload until Path A commits; coerce server step 0 → school context unless Path A Documents.
    if (next === 0 && scope !== "whole_program") {
      next = 1;
    }

    const completed = (progress.stepsCompleted as number[]) || [];
    const hasAnything = completed.length > 0 || scope || !!data.designScope ||
      !!(data["1"] && typeof data["1"] === "object" && Object.keys(data["1"]).length > 0);

    // Fresh-ish session stuck on currentStep 0 from v1/back-end default → School Context only.
    if (!hasAnything && progress.currentStep === 0) {
      next = 1;
    }

    hasInitializedActiveStep.current = true;
    setActiveStep(next);
  }, [progress, showPathPicker, transitionToStep]);

  // v2: derive designScope from stepData for path-aware rendering.
  const designScope: DesignScope | undefined = (progress?.stepData as Record<string, any>)?.designScope;

  const confirmStepMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      const url = buildUrl(api.workflow.confirmStep.path, { sessionId: sessionId! });
      return apiRequest("POST", url, { stepNumber });
    },
    onSuccess: async (_data: any, stepNumber: number) => {
      if (stepNumber === 1) {
        await refetchProgress();
        const refreshed = qc.getQueryData<WorkflowProgress>([api.workflow.getProgress.path, sessionId]);
        const ds = (refreshed?.stepData as Record<string, any>)?.designScope as DesignScope | undefined;
        if (!ds) {
          setTransitionToStep(null);
          setShowPathPicker(true);
          return;
        }
      }
      // If the user manually clicked a chevron while this mutation was in-flight,
      // don't override their navigation choice — just clean up state.
      const wasManual = userManuallyNavigatedRef.current;
      // Read intended step BEFORE clearing refs
      const nextStep = intendedNextStepRef.current ?? Math.min(stepNumber + 1, 8);
      userManuallyNavigatedRef.current = false;
      intendedNextStepRef.current = null;
      setTransitionToStep(null);
      if (!wasManual) {
        // Advance activeStep — use the stored intended step if set (handles custom routing
        // like Outcomes → LEAPs → Practices), otherwise fall back to stepNumber + 1.
        setActiveStep(nextStep);
      }
      refetchProgress();
      // Confirming the Decision Frame (step 6) should always re-run recommendations
      if (stepNumber === 6) setRecommendRefreshKey((k) => k + 1);
    },
  });

  // Show a transition page before advancing. The transition page stays visible
  // (with a loading spinner on →) until the server confirms, then auto-dismisses.
  const handleStepDone = useCallback((stepNumber: number) => {
    // A new step completion is always intentional — clear any leftover manual-navigation
    // flag so onSuccess always advances to the next step after this mutation.
    userManuallyNavigatedRef.current = false;

    // v2: when finishing Step 1 without a chosen path, skip the regular
    // transition page — we go straight to the path picker on success.
    if (stepNumber === 1 && !designScope) {
      confirmStepMutation.mutate(stepNumber);
      return;
    }

    // Outcomes → LEAPs (step 9) routing
    if (stepNumber === 2 && designScope === "whole_program") {
      intendedNextStepRef.current = 9;
      transitionActionRef.current = () => confirmStepMutation.mutate(stepNumber);
      setTransitionToStep(9);
      return;
    }
    if (stepNumber === 3 && designScope === "specific_experience") {
      intendedNextStepRef.current = 9;
      transitionActionRef.current = () => confirmStepMutation.mutate(stepNumber);
      setTransitionToStep(9);
      return;
    }

    // LEAPs (step 9) → next step in each path
    if (stepNumber === 9) {
      const nextAfterLeaps = designScope === "whole_program" ? 3 : 4;
      intendedNextStepRef.current = nextAfterLeaps;
      transitionActionRef.current = () => confirmStepMutation.mutate(stepNumber);
      setTransitionToStep(nextAfterLeaps);
      return;
    }

    const nextStep = stepNumber + 1;
    if (nextStep <= 7) {
      // Skip the transition page when going to Recommendations (step 7) for Path B
      if (nextStep === 7 && designScope === "specific_experience") {
        intendedNextStepRef.current = nextStep;
        confirmStepMutation.mutate(stepNumber);
        return;
      }
      intendedNextStepRef.current = nextStep;
      transitionActionRef.current = () => confirmStepMutation.mutate(stepNumber);
      setTransitionToStep(nextStep);
    } else {
      confirmStepMutation.mutate(stepNumber);
    }
  }, [confirmStepMutation, designScope]);

  // v2: persist design scope + server currentStep (Path A → Documents step 0; Path B → Define Experience step 2).
  const handlePickPath = useCallback(async (scope: DesignScope) => {
    if (!sessionId) return;
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then((r) => r.json());
      const currentStepData = { ...(currentProgress.stepData || {}) };
      currentStepData.designScope = scope;
      const nextStep = scope === "whole_program" ? 0 : 2;
      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: nextStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: currentStepData,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
      setShowPathPicker(false);
      if (scope === "specific_experience") {
        setShowPathBInterstitial(true);
      } else {
        setActiveStep(nextStep);
      }
    } catch {
      toast({ title: "Error", description: "Could not save your choice.", variant: "destructive" });
    }
  }, [sessionId, qc, toast]);

  const handleAdvanceFromPathADocuments = useCallback(() => {
    transitionActionRef.current = () => {
      void (async () => {
        if (!sessionId) return;
        try {
          const p = await fetch(
            buildUrl(api.workflow.getProgress.path, { sessionId }),
            { credentials: "include" },
          ).then((r) => r.json());
          await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currentStep: 2,
              stepsCompleted: p.stepsCompleted,
              stepData: p.stepData,
            }),
            credentials: "include",
          });
          qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
        } catch {
          toast({ title: "Error", description: "Couldn't advance to the next step.", variant: "destructive" });
        } finally {
          setActiveStep(2);
          setTransitionToStep(null);
        }
      })();
    };
    setTransitionToStep(2);
  }, [sessionId, qc, toast]);

  // Fire the pending action; for mutations the page stays until onSuccess dismisses it.
  // For direct advances (intro → step 1) we dismiss immediately.
  const handleTransitionContinue = useCallback(() => {
    transitionActionRef.current();
  }, []);

  const handleTransitionBack = useCallback(() => {
    setTransitionToStep(null);
  }, []);

  const handleAdvanceFromIntro = useCallback(() => {
    // Direct advance — no server call needed; dismiss immediately after navigating
    transitionActionRef.current = () => { setActiveStep(1); setTransitionToStep(null); };
    setTransitionToStep(1);
  }, []);

  const resetStepMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      const url = buildUrl(api.workflow.resetStep.path, { sessionId: sessionId! });
      return apiRequest("POST", url, { stepNumber });
    },
    onSuccess: (_, stepNumber) => {
      refetchProgress();
      qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, stepNumber] });
      qc.invalidateQueries({ queryKey: [api.workflow.getDocuments.path, sessionId, stepNumber] });
      if (stepNumber === 7) {
        qc.removeQueries({ queryKey: [api.models.getRecommendations.path, sessionId] });
        qc.invalidateQueries({ queryKey: [api.models.getRecommendations.path, sessionId] });
      }
      toast({ title: "Step reset", description: "You can start this step fresh." });
    },
  });

  const resetAllMutation = useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.workflow.resetAll.path, { sessionId: sessionId! });
      return apiRequest("POST", url);
    },
    onSuccess: () => {
      refetchProgress();
      qc.invalidateQueries({ queryKey: ["sessions"] });
      WORKFLOW_STEPS.forEach(s => {
        qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, s.number] });
        qc.invalidateQueries({ queryKey: [api.workflow.getDocuments.path, sessionId, s.number] });
      });
      setActiveStep(1);
      toast({ title: "All steps reset", description: "Starting completely fresh." });
    },
  });

  const handleExploreModel = useCallback(async (modelId: number) => {
    if (!sessionId || !progress) return;
    try {
      const currentStepData = { ...(progress.stepData as Record<string, any>) };
      currentStepData["8"] = { ...(currentStepData["8"] || {}), selectedModelId: modelId };
      const url = buildUrl(api.workflow.updateProgress.path, { sessionId });
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: progress.currentStep,
          stepsCompleted: progress.stepsCompleted,
          stepData: currentStepData,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
      qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, 8] });
      setActiveStep(8);
    } catch {
      toast({ title: "Error", description: "Could not open model exploration.", variant: "destructive" });
    }
  }, [sessionId, progress, qc, toast]);

  if (isSessionLoading || !sessionId) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground font-medium">Initializing...</span>
      </div>
    );
  }

  const stepsCompleted = (progress?.stepsCompleted as number[]) || [];
  const stepData = (progress?.stepData as Record<string, any>) || {};

  // v2: header rows — progressive disclosure until the user selects a flow.
  const v2HeaderRows = buildV2HeaderRows(designScope, showPathPicker);

  const filteredHeaderRows = v2HeaderRows.filter((row) => {
    if (row.type === "pathPicker") return true;
    const step = row.step;
    if (step.number === 8) return stepsCompleted.includes(7) || !!stepData["8"]?.selectedModelId;
    return true;
  });

  return (
    <div className="h-screen w-full overflow-hidden bg-background flex flex-col">
      {/* Top bar: branding + step tabs + actions — single row */}
      <header className="shrink-0 border-b border-border bg-white">
        <div className="flex items-center px-4 py-2 gap-4">
          {/* Logo + label */}
          <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity shrink-0">
            <img src={logoUrl} alt="Transcend" className="h-5 w-auto select-none" draggable={false} />
            <span className="hidden sm:block pl-2.5 border-l border-border text-[9px] font-display font-bold uppercase tracking-[0.16em] text-muted-foreground leading-tight">
              Model<br />Advisor
            </span>
          </Link>

          {/* Step tabs — inline, scrollable */}
          <div className="flex-1 min-w-0 flex items-center gap-0 overflow-x-auto">
            {filteredHeaderRows.map((row, idx) => {
              if (row.type === "pathPicker") {
                const isPickActive = !!showPathPicker;
                return (
                  <div key="path-picker" className="flex items-center shrink-0">
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 mx-0.5 shrink-0" />}
                    <div
                      role="presentation"
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap pointer-events-none",
                        isPickActive && "bg-primary text-white shadow-sm",
                        !isPickActive && "bg-muted/60 text-muted-foreground border border-border/60",
                      )}
                      data-testid="pill-choose-path"
                    >
                      <Split className="w-3 h-3 shrink-0" />
                      <span className="hidden sm:inline">Choose path</span>
                    </div>
                  </div>
                );
              }

              const step = row.step;
              const isCompleted = stepsCompleted.includes(step.number);

              let isActive = activeStep === step.number;
              if (showPathPicker) {
                isActive = false;
              }

              let progressDataKey: string | "experience" = String(step.number);
              if (designScope === "specific_experience") {
                if (step.number === 2) progressDataKey = "experience";
                else if (step.number === 3) progressDataKey = "2";
              }
              const stepDataForStep = stepData[progressDataKey];
              const hasProgress =
                !isCompleted && !!stepDataForStep && typeof stepDataForStep === "object" && Object.keys(stepDataForStep).length > 0;

              const step8Label = step.number === 8 && stepData["8"]?.selectedModelId
                ? "Explore Model"
                : step.label;

              const Icon = step.icon || STEP_ICONS[step.number];

              return (
                <div key={step.number} className="flex items-center shrink-0">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/40 mx-0.5 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => { userManuallyNavigatedRef.current = true; setTransitionToStep(null); setActiveStep(step.number); }}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap",
                      isActive && "bg-primary text-white shadow-sm",
                      isCompleted && !isActive && "bg-primary/10 text-primary hover:bg-primary/20",
                      hasProgress && !isActive && !isCompleted && "bg-amber-50 text-amber-700 hover:bg-amber-100",
                      !isActive && !isCompleted && !hasProgress && "bg-muted/60 text-muted-foreground hover:bg-muted",
                    )}
                    data-testid={`button-step-${step.number}`}
                  >
                    <span className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0",
                      isActive && "bg-white/20",
                      isCompleted && !isActive && "bg-primary text-white",
                      hasProgress && !isActive && !isCompleted && "bg-amber-200 text-amber-700",
                    )}>
                      {isCompleted ? (
                        <Check className="w-2.5 h-2.5" />
                      ) : Icon ? (
                        <Icon className="w-2.5 h-2.5" />
                      ) : step.number === 8 ? (
                        <Bot className="w-2.5 h-2.5" />
                      ) : (
                        step.number
                      )}
                    </span>
                    <span className="hidden sm:inline">{step.number === 8 ? step8Label : step.label}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive"
              onClick={() => resetAllMutation.mutate()}
              disabled={resetAllMutation.isPending}
              data-testid="button-reset-all"
            >
              {resetAllMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5 mr-1" />}
              Reset
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area — full width */}
      <main className="flex-1 min-h-0 overflow-hidden flex">
        {showPathPicker ? (
          <PathPickerPanel
            onPick={handlePickPath}
            onBack={() => { setShowPathPicker(false); setActiveStep(1); }}
          />
        ) : showPathBInterstitial ? (
          <PathBInterstitialPage onContinue={() => { setShowPathBInterstitial(false); setActiveStep(2); }} />
        ) : transitionToStep !== null ? (
          <StepTransitionPage
            stepNumber={transitionToStep}
            onContinue={handleTransitionContinue}
            onBack={handleTransitionBack}
            isLoading={confirmStepMutation.isPending}
            designScope={designScope}
          />
        ) : (
          <StepContent
            sessionId={sessionId}
            stepNumber={activeStep}
            stepData={stepData}
            stepsCompleted={stepsCompleted}
            onConfirmStep={handleStepDone}
            onResetStep={(step) => resetStepMutation.mutate(step)}
            isConfirming={confirmStepMutation.isPending}
            onAdvanceFromIntro={handleAdvanceFromIntro}
            onAdvanceFromPathADocuments={handleAdvanceFromPathADocuments}
            onExploreModel={handleExploreModel}
            onGoToStep={setActiveStep}
            recommendRefreshKey={recommendRefreshKey}
            designScope={designScope}
            onShowPathPicker={() => setShowPathPicker(true)}
          />
        )}
      </main>
    </div>
  );
}

interface StepContentProps {
  sessionId: string;
  stepNumber: number;
  stepData: Record<string, any>;
  stepsCompleted: number[];
  onConfirmStep: (step: number) => void;
  onResetStep: (step: number) => void;
  isConfirming: boolean;
  onAdvanceFromIntro: () => void;
  /** Path A (v2): after whole-program Documents (step 0), advance to Aims (step 2) instead of School. */
  onAdvanceFromPathADocuments?: () => void;
  onExploreModel: (modelId: number) => void;
  onGoToStep: (step: number) => void;
  recommendRefreshKey?: number;
  // v2: design scope and path picker re-entry
  designScope?: DesignScope;
  onShowPathPicker?: () => void;
}

// Steps that have taxonomy-based structured selection panels
type TaxonomyCategoryConfig = {
  key: string;
  label: string;
  grouped?: boolean; // If true, group by item.group field
  groups?: readonly { key: string; label: string }[]; // OUTCOME_GROUPS | PRACTICE_GROUPS
  summaryKey?: string;
  summaryColor?: string;
};

type StepTaxonomyConfig = {
  title: string;
  description: string;
  icon: any;
  categories: TaxonomyCategoryConfig[];
};

const STEP_TAXONOMY_CONFIG: Record<number, StepTaxonomyConfig> = {
  2: {
    title: "Aims for Learners",
    description: "Select the outcomes and LEAPs most relevant to the experience you're designing. Only pick what directly applies — not everything you aspire to.",
    icon: Target,
    categories: [
      { key: "outcome", label: "Outcomes", grouped: true, groups: OUTCOME_GROUPS, summaryKey: "outcomes_summary", summaryColor: "bg-primary/5 border-primary/15" },
      { key: "leap", label: "LEAPs / Design Principles", summaryKey: "leaps_summary", summaryColor: "bg-violet-500/5 border-violet-500/15" },
    ],
  },
  3: {
    title: "Learning Experience & Practices",
    description: "Select the practices and learning experiences central to this initiative. Focus on what's directly relevant.",
    icon: BookOpen,
    categories: [
      { key: "practice", label: "Practices", grouped: true, groups: PRACTICE_GROUPS, summaryKey: "practices_summary", summaryColor: "bg-emerald-500/5 border-emerald-500/15" },
    ],
  },
};

function StepContent({ sessionId, stepNumber, stepData, stepsCompleted, onConfirmStep, onResetStep, isConfirming, onAdvanceFromIntro, onAdvanceFromPathADocuments, onExploreModel, onGoToStep, recommendRefreshKey = 0, designScope, onShowPathPicker }: StepContentProps) {
  const isPathB = designScope === "specific_experience";

  // Step 0: full-screen intro upload (no split panel)
  // Path B skips the standalone documents step — uploads happen inside the
  // Experience step instead.
  if (stepNumber === 0) {
    if (isPathB) {
      return (
        <SchoolContextQuestionnaire
          sessionId={sessionId}
          stepData={stepData}
          onConfirm={() => onConfirmStep(1)}
        />
      );
    }
    const advanceFromDocs =
      designScope === "whole_program" && onAdvanceFromPathADocuments
        ? onAdvanceFromPathADocuments
        : onAdvanceFromIntro;
    return (
      <IntroUploadPanel
        sessionId={sessionId}
        onNext={advanceFromDocs}
        onSkip={advanceFromDocs}
      />
    );
  }

  // Step 1: full-screen questionnaire (no split panel, no chat)
  if (stepNumber === 1) {
    return (
      <SchoolContextQuestionnaire
        sessionId={sessionId}
        stepData={stepData}
        onConfirm={() => onConfirmStep(1)}
      />
    );
  }

  // Step 2:
  // - Path A: Outcomes (was "Aims for Learners" — now only outcomes screens)
  // - Path B: Define Your Experience panel
  if (stepNumber === 2) {
    if (isPathB) {
      return (
        <ExperienceDefinitionPanel
          sessionId={sessionId}
          stepData={stepData}
          onConfirm={() => onConfirmStep(2)}
        />
      );
    }
    return (
      <AimsForLearnersQuestionnaire
        sessionId={sessionId}
        stepData={stepData}
        mode="outcomes"
        onConfirm={() => onConfirmStep(2)}
      />
    );
  }

  // Step 3:
  // - Path A: Practices
  // - Path B: Outcomes (reads/writes stepData["2"])
  if (stepNumber === 3) {
    if (isPathB) {
      return (
        <AimsForLearnersQuestionnaire
          sessionId={sessionId}
          stepData={stepData}
          mode="outcomes"
          onConfirm={() => onConfirmStep(3)}
        />
      );
    }
    return (
      <PracticesQuestionnaire
        sessionId={sessionId}
        stepData={stepData}
        onConfirm={() => onConfirmStep(3)}
      />
    );
  }

  // Step 9: LEAPs (both paths) — reads/writes stepData["2"]
  if (stepNumber === 9) {
    return (
      <AimsForLearnersQuestionnaire
        sessionId={sessionId}
        stepData={stepData}
        mode="leaps"
        onConfirm={() => onConfirmStep(9)}
      />
    );
  }

  // Step 4: full-screen system elements questionnaire (no split panel, no chat)
  if (stepNumber === 4) {
    return (
      <SystemElementsQuestionnaire
        sessionId={sessionId}
        stepData={stepData}
        onConfirm={() => onConfirmStep(4)}
      />
    );
  }

  // Step 5: full-screen model preferences questionnaire
  if (stepNumber === 5) {
    return (
      <ModelPreferencesQuestionnaire
        sessionId={sessionId}
        stepData={stepData}
        onConfirm={() => onConfirmStep(5)}
      />
    );
  }

  // Step 6: full-screen decision frame review (no chat, no split panel)
  if (stepNumber === 6) {
    if (isPathB) {
      return (
        <DecisionFramePathB
          sessionId={sessionId}
          stepData={stepData}
          stepsCompleted={stepsCompleted}
          onGoToStep={onGoToStep}
          onConfirm={() => onConfirmStep(6)}
          isConfirming={isConfirming}
        />
      );
    }
    return (
      <DecisionFrameReview
        stepData={stepData}
        stepsCompleted={stepsCompleted}
        onGoToStep={onGoToStep}
        onConfirm={() => onConfirmStep(6)}
        isConfirming={isConfirming}
        designScope={designScope}
      />
    );
  }

  // Step 7: full-screen recommendations view (no chat split panel)
  if (stepNumber === 7) {
    if (isPathB) {
      return (
        <RecommendationsPathB
          sessionId={sessionId}
          stepData={stepData}
          forceRefreshKey={recommendRefreshKey}
          onGoToStep={onGoToStep}
        />
      );
    }
    return (
      <RecommendationsView
        sessionId={sessionId}
        stepData={stepData}
        forceRefreshKey={recommendRefreshKey}
      />
    );
  }


  // Step 8: full-screen model conversation (no split panel)
  if (stepNumber === 8) {
    return (
      <ModelConversationPanel
        sessionId={sessionId}
        stepData={stepData}
      />
    );
  }

  const step = WORKFLOW_STEPS.find(s => s.number === stepNumber)!;
  const isCompleted = stepsCompleted.includes(stepNumber);
  const currentStepData = stepData[String(stepNumber)];
  const hasTaxonomy = !!STEP_TAXONOMY_CONFIG[stepNumber];

  // State for AI-suggested taxonomy selections (any step with taxonomy)
  const [pendingSuggestions, setPendingSuggestions] = useState<{
    outcomes: number[];
    leaps: number[];
    taxonomyIds: number[];
  } | null>(null);

  // Callback for when AI returns suggestions via chat
  const handleAiSuggestions = useCallback((data: StepChatResponse) => {
    const hasStep2 = (data.suggested_outcomes && data.suggested_outcomes.length > 0) ||
                     (data.suggested_leaps && data.suggested_leaps.length > 0);
    const hasGeneric = data.suggested_taxonomy_ids && data.suggested_taxonomy_ids.length > 0;

    if (hasStep2 || hasGeneric) {
      setPendingSuggestions({
        outcomes: data.suggested_outcomes || [],
        leaps: data.suggested_leaps || [],
        taxonomyIds: data.suggested_taxonomy_ids || [],
      });
    }
  }, []);

  return (
    <ResizablePanelGroup direction="horizontal" className="w-full h-full">
      {/* Chat Panel */}
      <ResizablePanel defaultSize={35} minSize={25} maxSize={55} className="min-w-[320px]">
        <div className="w-full h-full min-w-0 border-r border-border">
          <StepChat
            sessionId={sessionId}
            stepNumber={stepNumber}
            onAiSuggestions={hasTaxonomy ? handleAiSuggestions : undefined}
          />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle className="shrink-0" />
      {/* Step Summary Panel */}
      <ResizablePanel defaultSize={65} minSize={45} className="min-w-0">
        <div className="w-full h-full overflow-hidden flex flex-col min-w-0 min-h-0">
        <div className="p-6 border-b border-border bg-white shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={isCompleted ? "default" : "secondary"} className="text-xs">
                  Step {stepNumber} of 7
                </Badge>
                {stepNumber === 7 && stepsCompleted.includes(7) && (
                  <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-200">Complete</Badge>
                )}
                {isCompleted && <Badge variant="outline" className="text-xs text-primary border-primary/30">Confirmed</Badge>}
              </div>
              <h1 className="text-xl font-display font-bold text-foreground">{step.label}</h1>
              <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onResetStep(stepNumber)}
                data-testid="button-reset-step"
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Reset Step
              </Button>
              {stepNumber < 7 && (
                <Button
                  onClick={() => onConfirmStep(stepNumber)}
                  disabled={isConfirming}
                  data-testid="button-confirm-step"
                >
                  {isConfirming ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Confirm & Proceed
                </Button>
              )}
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 bg-muted/40">
          <div className="p-6 max-w-4xl min-w-0 w-full mx-auto space-y-6 pb-20">
            {stepNumber === 1 && (
              <SchoolContextPanel sessionId={sessionId} stepData={stepData} />
            )}

            {/* Step 2: New Aims Explorer panel */}
            {stepNumber === 2 && (
              <AimsExplorerPanel
                sessionId={sessionId}
                stepData={stepData}
                pendingSuggestions={pendingSuggestions}
                onSuggestionsApplied={() => setPendingSuggestions(null)}
              />
            )}

            {/* Step 3: Practices Explorer panel */}
            {stepNumber === 3 && (
              <PracticesExplorerPanel
                sessionId={sessionId}
                stepData={stepData}
                pendingSuggestions={pendingSuggestions}
                onSuggestionsApplied={() => setPendingSuggestions(null)}
              />
            )}

            {/* Other steps with taxonomy (fallback) */}
            {hasTaxonomy && stepNumber !== 2 && stepNumber !== 3 && (
              <TaxonomySelectionPanel
                sessionId={sessionId}
                stepNumber={stepNumber}
                stepData={stepData}
                config={STEP_TAXONOMY_CONFIG[stepNumber]}
                pendingSuggestions={pendingSuggestions}
                onSuggestionsApplied={() => setPendingSuggestions(null)}
              />
            )}

            {stepNumber === 4 && (
              <ConstraintsPanel sessionId={sessionId} stepData={stepData} />
            )}

            <StepDocumentsPanel sessionId={sessionId} stepNumber={stepNumber} />
          </div>
        </ScrollArea>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

// ---------------------------------------------------------------------------
// v2: Path Picker — shown after Step 1 (School Context) is confirmed.
// Lets the user choose between defining aims for their whole CCL program
// (Path A — same as v1) or defining a specific experience (Path B —
// inserts a new Experience step before Aims and removes the standalone
// Practices step). The choice persists to stepData.designScope.
// ---------------------------------------------------------------------------

interface PathPickerPanelProps {
  onPick: (scope: DesignScope) => void;
  onBack: () => void;
}

function PathPickerPanel({ onPick, onBack }: PathPickerPanelProps) {
  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-16">
        <div className="w-full max-w-3xl space-y-8">
          <div className="text-center space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Up next</p>
            <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
              Choose your path
            </h1>
            <p className="text-muted-foreground text-base max-w-2xl mx-auto leading-relaxed">
              Your answer shapes the rest of the flow. Either path leads to model recommendations; the questions and structure adjust to match.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => onPick("whole_program")}
              className="text-left rounded-xl border-2 border-border bg-card p-6 transition-all hover:border-primary hover:bg-primary/5"
              data-testid="button-path-whole-program"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-lg font-display font-semibold text-foreground">
                  Define aims for our CCL program
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Capture goals for your whole career-connected learning program and find models that fit those aspirations.
                </p>
                <p className="text-xs text-muted-foreground/80 pt-2">
                  Walks through aims, practices, and system elements at the program level.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onPick("specific_experience")}
              className="text-left rounded-xl border-2 border-border bg-card p-6 transition-all hover:border-primary hover:bg-primary/5"
              data-testid="button-path-specific-experience"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-emerald-700" />
                </div>
                <h3 className="text-lg font-display font-semibold text-foreground">
                  Define a specific experience
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Describe the experience you're building and the practices it should incorporate, then find models you could adopt.
                </p>
                <p className="text-xs text-muted-foreground/80 pt-2">
                  Starts with experience details + practices, then walks through aims and system elements.
                </p>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            You can change your mind later by resetting the workflow.
          </p>
        </div>
      </div>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        <button
          type="button"
          onClick={onBack}
          title="Back"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Path B Interstitial — shown after selecting "Define a specific experience"
// ---------------------------------------------------------------------------

function PathBInterstitialPage({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-16">
        <div className="w-full max-w-2xl space-y-8">

          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-2">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
              Let's define your experience
            </h1>
            <p className="text-muted-foreground text-base max-w-xl mx-auto leading-relaxed">
              We'll walk you through a short series of inputs so we can find the best-fit models for what you're designing. This typically takes 10–15 minutes.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <p className="text-sm font-semibold text-foreground uppercase tracking-wide">Here's what we'll cover:</p>
            <div className="space-y-2.5">
              {[
                { icon: "📄", label: "Experience Details", desc: "Name, description, and targeted grade levels", section: "input" },
                { icon: "🎯", label: "Primary Practice", desc: "Select the core practice area — this filters your model results", section: "input" },
                { icon: "🧩", label: "Supporting Practices", desc: "Additional practices that complement your primary focus", section: "input" },
                { icon: "📊", label: "Outcomes & LEAPs", desc: "What students should achieve and the learning experiences that get them there", section: "input" },
                { icon: "⚙️", label: "System Elements", desc: "Operational questions about scheduling, budget, staffing, and more", section: "input" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
                  <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}

              <div className="pt-2 pb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Then you'll receive:</p>
              </div>

              {[
                { icon: "📋", label: "Experience Summary", desc: "A structured overview of everything you've defined — exportable and shareable" },
                { icon: "✨", label: "Model Recommendations", desc: "Ranked models matched to your specific inputs and preferences" },
                { icon: "🤖", label: "AI Advisor", desc: "Chat with AI to explore individual models and ask detailed questions" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                  <span className="text-lg shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 space-y-2">
            <p className="text-sm font-semibold text-primary">A note on scoring</p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              If you select a primary practice, we'll filter model recommendations to those that focus on that practice.
              Beyond that, our recommendations are based on the degree to which your targeted outcomes and LEAPs align with the models in our database.
              We'll also ask system-level questions to exclude models that won't fit your operational structure.
            </p>
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onContinue}
              className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base shadow-md hover:bg-primary/90 transition-colors"
            >
              Let's get started →
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// v2: Experience Definition Panel (Path B Step 2)
// ---------------------------------------------------------------------------
//
// Four sub-steps in one Define Experience rail: Upload → Experience details (incl. primary practices)
// → Additional practices → Prioritized practices — PracticesQuestionnaire (embed) skips its own rails here.

interface ExperienceDefinitionPanelProps {
  sessionId: string;
  stepData: Record<string, any>;
  onConfirm: () => void;
}

type ExperienceScreen = 1 | 2 | 3 | 4 | 5;

function ExperienceDefinitionPanel({ sessionId, stepData, onConfirm }: ExperienceDefinitionPanelProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // Start on Upload (screen 1) so users know it exists when entering Define Experience.
  const [screen, setScreen] = useState<ExperienceScreen>(1);
  const practicesQuestionnaireRef = useRef<PracticesQuestionnaireHandle>(null);
  const [animKey, setAnimKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const exp = (stepData.experience as Record<string, any>) || {};
  const [name, setName] = useState<string>(typeof exp.name === "string" ? exp.name : "");
  const [description, setDescription] = useState<string>(exp.description || "");
  const [targetedGradeBands, setTargetedGradeBands] = useState<string[]>(exp.targetedGradeBands || []);

  const primInit = ((exp.primaryPractices || []) as TaxonomySelection[]);
  const [primaryId1, setPrimaryId1] = useState<string>(
    primInit[0]?.id != null ? String(primInit[0].id) : "",
  );
  const [primaryId2, setPrimaryId2] = useState<string>(
    primInit[1]?.id != null ? String(primInit[1].id) : "",
  );

  // Prefill animation state (mirrors IntroUploadPanel)
  const [prefillStatus, setPrefillStatus] = useState<null | "prefilling" | "done">(null);
  const [prefillMsgIdx, setPrefillMsgIdx] = useState(0);

  useEffect(() => {
    if (prefillStatus !== "prefilling") return;
    const timer = setInterval(() => {
      setPrefillMsgIdx((i) => Math.min(i + 1, PRE_FILL_MESSAGES.length - 2));
    }, 1800);
    return () => clearInterval(timer);
  }, [prefillStatus]);

  const { data: taxonomyItemsRaw = [], isLoading: isLoadingTaxonomy } = useTaxonomyItems(3);
  const practices = useMemo(() => (
    ((taxonomyItemsRaw as TaxonomyItem[]) || []).filter((t) => t.category === "practice")
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [taxonomyItemsRaw]);

  const practiceById = useMemo(() => {
    const m = new Map<number, TaxonomyItem>();
    practices.forEach((p) => m.set(p.id, p));
    return m;
  }, [practices]);

  const fileRef = useRef<HTMLInputElement>(null);
  const { data: docs = [], refetch: refetchDocs } = useStepDocuments(sessionId, 0);
  const [isDragOver, setIsDragOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocumentFile(file, sessionId, 0),
    onSuccess: () => refetchDocs(),
    onError: () => toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(
        `/api/sessions/${sessionId}/workflow/documents/${docId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => refetchDocs(),
  });

  useEffect(() => {
    const e = (stepData.experience as Record<string, any>) || {};
    if (typeof e.name === "string" && !name.trim() && e.name.trim()) setName(e.name);
    if (e.description && !description) setDescription(e.description);
    if ((e.targetedGradeBands?.length ?? 0) > 0 && targetedGradeBands.length === 0) {
      setTargetedGradeBands(e.targetedGradeBands);
    }
    // Sync primary practices from prefill
    const prims = (e.primaryPractices || []) as TaxonomySelection[];
    if (prims.length > 0 && !primaryId1) {
      setPrimaryId1(prims[0]?.id != null ? String(prims[0].id) : "");
      setPrimaryId2(prims[1]?.id != null ? String(prims[1].id) : "");
    }
  }, [JSON.stringify(stepData.experience)]);

  const schoolBands: string[] = useMemo(() => {
    const s1 = (stepData["1"] as Record<string, any>) || {};
    if (Array.isArray(s1.grade_bands)) return s1.grade_bands;
    if (s1.grade_band) return [s1.grade_band];
    return [];
  }, [stepData["1"]]);

  const availableGradeOptions: string[] = useMemo(() => (
    schoolBands
      .flatMap((b) => EXPERIENCE_GRADE_OPTIONS[b] || [])
      .filter((v, idx, a) => a.indexOf(v) === idx)
  ), [schoolBands]);

  const goToScreen = (n: ExperienceScreen) => {
    setScreen(n);
    setAnimKey((k) => k + 1);
  };

  /** Primary taxonomy IDs — from saved experience and current form. */
  const pathBPrimaryPracticeIds = useMemo(() => {
    const ids = new Set<number>();
    const fromExp = ((stepData.experience as Record<string, any>)?.primaryPractices || []) as TaxonomySelection[];
    fromExp.forEach((p) => { if (p?.id != null) ids.add(Number(p.id)); });
    for (const sid of [primaryId1, primaryId2]) {
      if (sid) ids.add(Number(sid));
    }
    return Array.from(ids);
  }, [stepData.experience, primaryId1, primaryId2]);

  const buildPrimarySelections = (): TaxonomySelection[] => {
    const out: TaxonomySelection[] = [];
    for (const sid of [primaryId1, primaryId2]) {
      if (!sid) continue;
      const id = Number(sid);
      const item = practiceById.get(id);
      if (item && !out.some((x) => x.id === item.id)) {
        out.push({ id: item.id, name: item.name, importance: "most_important" });
      }
    }
    return out;
  };

  // Toggle a primary practice card (screen 3)
  const togglePrimary = (id: number) => {
    const sid = String(id);
    if (primaryId1 === sid) { setPrimaryId1(primaryId2); setPrimaryId2(""); return; }
    if (primaryId2 === sid) { setPrimaryId2(""); return; }
    if (!primaryId1) { setPrimaryId1(sid); return; }
    if (!primaryId2) { setPrimaryId2(sid); return; }
    // Both slots full — tooltip handles the message, card is disabled
  };

  const persistDetails = async () => {
    const currentProgress = await fetch(
      buildUrl(api.workflow.getProgress.path, { sessionId }),
      { credentials: "include" },
    ).then((r) => r.json());
    const sd = { ...(currentProgress.stepData || {}) };
    const trimmedName = name.trim();
    sd.experience = {
      ...(sd.experience || {}),
      name: trimmedName === "" ? null : trimmedName,
      description,
      targetedGradeBands,
    };
    await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStep: currentProgress.currentStep, stepsCompleted: currentProgress.stepsCompleted, stepData: sd }),
      credentials: "include",
    });
    qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
  };

  const persistPrimaryPracticesThenMerge = async () => {
    const primarySel = buildPrimarySelections();
    const currentProgress = await fetch(
      buildUrl(api.workflow.getProgress.path, { sessionId }),
      { credentials: "include" },
    ).then((r) => r.json());
    const sd = { ...(currentProgress.stepData || {}) };
    sd.experience = { ...(sd.experience || {}), primaryPractices: primarySel };
    const existing = ((sd["3"]?.selected_practices || []) as TaxonomySelection[]);
    const primaryIds = new Set(primarySel.map((p) => p.id));
    const rest = existing.filter((s) => !primaryIds.has(s.id));
    sd["3"] = { ...(sd["3"] || {}), selected_practices: [...primarySel, ...rest] };
    await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStep: currentProgress.currentStep, stepsCompleted: currentProgress.stepsCompleted, stepData: sd }),
      credentials: "include",
    });
    qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
  };

  const runPrefill = async (): Promise<void> => {
    if (docs.length === 0) return;
    setPrefillStatus("prefilling");
    setPrefillMsgIdx(0);
    try {
      const url = buildUrl(api.workflow.prefillFromDocuments.path, { sessionId });
      await fetch(url, { method: "POST", credentials: "include" });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
      setPrefillMsgIdx(PRE_FILL_MESSAGES.length - 1);
      setPrefillStatus("done");
      await new Promise<void>((res) => setTimeout(res, 1200));
      toast({ title: "Documents analyzed", description: "We've prefilled what we could — verify below." });
    } catch {
      toast({ title: "Analysis failed", description: "Couldn't pre-fill from documents. Continue manually.", variant: "destructive" });
    } finally {
      setPrefillStatus(null);
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadMutation.mutate(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const goNext = async () => {
    if (isSaving) return;
    if (screen >= 4) {
      setIsSaving(true);
      try { await practicesQuestionnaireRef.current?.advance(); }
      finally { setIsSaving(false); }
      return;
    }
    setIsSaving(true);
    try {
      if (screen === 1) {
        await runPrefill();
        goToScreen(2);
      } else if (screen === 2) {
        await persistDetails();
        await qc.refetchQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
        goToScreen(3);
      } else if (screen === 3) {
        await persistPrimaryPracticesThenMerge();
        await qc.refetchQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
        goToScreen(4);
      }
    } catch {
      toast({ title: "Save failed", description: "Couldn't save.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const goBack = () => {
    if (screen >= 4) {
      practicesQuestionnaireRef.current?.retreat();
      return;
    }
    if (screen === 1) return;
    goToScreen((screen - 1) as ExperienceScreen);
  };

  const innerStepLabel = ["Upload", "Experience details", "Primary practices", "Additional practices", "Prioritized practices"];
  const isPrefilling = prefillStatus === "prefilling" || prefillStatus === "done";

  const renderUpload = () => (
    <div className="flex flex-col items-center justify-center min-h-full px-6 py-16 relative">
      {/* Prefill animation overlay */}
      {isPrefilling && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="text-center space-y-8 px-8 max-w-sm">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-spin border-t-primary" style={{ animationDuration: "1.4s" }} />
              <div className="absolute inset-2 rounded-full border border-primary/10 animate-spin border-t-primary/60" style={{ animationDuration: "2.1s", animationDirection: "reverse" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-foreground font-semibold text-lg leading-snug">{PRE_FILL_MESSAGES[prefillMsgIdx]}</p>
              <p className="text-muted-foreground text-sm">Analyzing your documents — just a moment</p>
            </div>
            <div className="flex justify-center gap-2">
              {PRE_FILL_MESSAGES.slice(0, -1).map((_, i) => (
                <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-all duration-500", i <= prefillMsgIdx ? "bg-primary" : "bg-muted-foreground/20")} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Define your experience · 1 of 5</p>
          <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
            Upload any documents that describe this experience
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Optional. Drop a write-up or blueprint and we'll pre-fill the next steps where we can.
          </p>
        </div>

        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md,.doc,.ppt" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <div
          role="presentation"
          onClick={() => fileRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          className={cn(
            "rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200",
            isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50",
          )}
        >
          {uploadMutation.isPending ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <p className="text-muted-foreground text-sm">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <CloudUpload className={cn("w-10 h-10 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground/50")} />
              <div>
                <p className="text-foreground text-sm font-medium">{isDragOver ? "Drop files here" : "Drag & drop files, or click to browse"}</p>
                <p className="text-muted-foreground text-xs mt-1">PDF, DOCX, PPTX, TXT supported</p>
              </div>
            </div>
          )}
        </div>

        {docs.length > 0 && (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground font-medium truncate">{doc.fileName}</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(doc.id); }}
                  className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors shrink-0" title="Remove">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderForm = () => (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Define your experience · 2 of 5</p>
        <h1 className="text-3xl font-display font-bold text-foreground leading-tight">Experience details</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Name your experience, describe it, and set the grade levels it targets.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Experience name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Optional — e.g. "Capstone Studio"' className="text-base max-w-xl" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Description</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What is it, who is it for, what makes it distinctive?" rows={5} className="text-base resize-none max-w-2xl" />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Targeted grade levels</Label>
        {availableGradeOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border bg-muted/20 p-4">
            Set grade bands on School Context, or skip for now.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 max-w-2xl">
            {availableGradeOptions.map((grade) => {
              const selected = targetedGradeBands.includes(grade);
              return (
                <button key={grade} type="button"
                  onClick={() => { if (selected) setTargetedGradeBands(targetedGradeBands.filter((g) => g !== grade)); else setTargetedGradeBands([...targetedGradeBands, grade]); }}
                  className={cn("px-4 py-2 rounded-full border-2 text-sm font-medium transition-all",
                    selected ? "border-primary bg-primary text-white" : "border-border bg-background hover:border-primary/60 hover:bg-primary/5 text-foreground")}>
                  {grade === "Post-secondary" ? grade : `Grade ${grade}`}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const renderPrimaryPractices = () => {
    const selectedCount = [primaryId1, primaryId2].filter(Boolean).length;
    const isMaxed = selectedCount >= 2;

    return (
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Define your experience · 3 of 5</p>
          <h1 className="text-3xl font-display font-bold text-foreground leading-tight">Choose your primary practices</h1>
          <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
            Primary practices filter the models we recommend — only models built around these practices will appear in your results. Select up to 2, and only if they are the absolute core focus of this experience. Leave blank to see all models.
          </p>
        </div>

        {isLoadingTaxonomy ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading practices...
          </p>
        ) : (
          <>
            {selectedCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {[primaryId1, primaryId2].filter(Boolean).map((sid) => {
                  const p = practiceById.get(Number(sid));
                  return p ? (
                    <span key={sid} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
                      {p.name}
                      <button type="button" onClick={() => togglePrimary(Number(sid))} className="hover:text-primary/60 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : null;
                })}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {practices.map((p) => {
                const sid = String(p.id);
                const isSelected = primaryId1 === sid || primaryId2 === sid;
                const isDisabled = isMaxed && !isSelected;

                const card = (
                  <button
                    key={p.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => togglePrimary(p.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-md border text-left text-sm font-medium transition-all",
                      isSelected
                        ? "border-primary/40 bg-primary/5 text-primary"
                        : isDisabled
                          ? "border-border/30 bg-muted/20 text-muted-foreground/40 cursor-not-allowed"
                          : "border-border bg-white hover:border-primary/40 hover:bg-primary/5 text-foreground cursor-pointer",
                    )}
                  >
                    <Checkbox checked={isSelected} className="h-3.5 w-3.5 shrink-0 pointer-events-none" />
                    <span className="leading-snug">{p.name}</span>
                  </button>
                );

                if (isDisabled) {
                  return (
                    <Tooltip key={p.id}>
                      <TooltipTrigger asChild>{card}</TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                        Unselect a practice above to choose a different one
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return card;
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const subIndicator = (
    <div className="flex items-center gap-1 flex-wrap">
      {innerStepLabel.map((label, idx) => {
        const stepNum = (idx + 1) as ExperienceScreen;
        const isActive = screen === stepNum;
        const isDone = screen > stepNum;
        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              onClick={() => goToScreen(stepNum)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors",
                isActive ? "" : "hover:bg-muted/50",
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                isActive ? "bg-primary text-white" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {isDone ? <Check className="w-3 h-3" /> : stepNum}
              </div>
              <span className={cn("text-[11px] font-medium whitespace-nowrap", isActive ? "text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </button>
            {idx < innerStepLabel.length - 1 && <div className="w-4 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="w-full h-full overflow-auto bg-background flex flex-col">
      <div className="flex-shrink-0 px-8 pt-10 pb-4 max-w-5xl mx-auto w-full">{subIndicator}</div>

      {screen <= 3 ? (
        <div className={cn("flex-1", screen === 1 ? "relative" : "flex flex-col items-center justify-start px-8 pb-24")}>
          <div
            className={cn(screen !== 1 && "w-full max-w-5xl mx-auto space-y-8")}
            key={animKey}
            style={{ animation: "schoolFadeIn 0.25s ease forwards" }}
          >
            {screen === 1 && renderUpload()}
            {screen === 2 && renderForm()}
            {screen === 3 && renderPrimaryPractices()}
          </div>
        </div>
      ) : (
        <PracticesQuestionnaire
          ref={practicesQuestionnaireRef}
          sessionId={sessionId}
          stepData={stepData}
          variant="pathBExperienceAddition"
          pathBPrimaryPracticeIds={pathBPrimaryPracticeIds}
          pathBHideSubStepIndicator
          pathBHideFloatingNav
          pathBControlledStep={screen === 4 ? 1 : 2}
          onPathBControlledStepChange={(pq) => setScreen(pq === 1 ? 4 : 5)}
          onEmbeddedBack={() => goToScreen(3)}
          onConfirm={onConfirm}
        />
      )}

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        <button type="button" onClick={goBack} disabled={screen === 1 || isPrefilling} title="Previous"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <button type="button" onClick={goNext} disabled={isSaving || isPrefilling}
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
          {isSaving ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 0 — Intro Upload Panel
// ---------------------------------------------------------------------------

const DOC_TYPE_CHIPS = [
  "Experience Design Sketch",
  '"Looking Inward" & "Looking Outward" Learning',
  "Learning Notebook",
  "Blueprint",
];

const PRE_FILL_MESSAGES = [
  "Reading your documents...",
  "Identifying school context...",
  "Matching LEAPs and outcomes...",
  "Pre-filling learning experiences & practices...",
  "All set!",
];

interface IntroUploadPanelProps {
  sessionId: string;
  onNext: () => void;
  onSkip: () => void;
}

function IntroUploadPanel({ sessionId, onNext, onSkip }: IntroUploadPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isDragOver, setIsDragOver] = useState(false);
  const [prefillStatus, setPrefillStatus] = useState<null | "prefilling" | "done">(null);
  const [prefillMsgIdx, setPrefillMsgIdx] = useState(0);

  const { data: docs = [], refetch } = useStepDocuments(sessionId, 0);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadDocumentFile(file, sessionId, 0),
    onSuccess: () => refetch(),
    onError: () => toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(
        `/api/sessions/${sessionId}/workflow/documents/${docId}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => refetch(),
  });

  // Cycle through status messages during prefill
  useEffect(() => {
    if (prefillStatus !== "prefilling") return;
    const timer = setInterval(() => {
      setPrefillMsgIdx((i) => Math.min(i + 1, PRE_FILL_MESSAGES.length - 2));
    }, 1800);
    return () => clearInterval(timer);
  }, [prefillStatus]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadMutation.mutate(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleNext = async () => {
    if (docs.length === 0) { onNext(); return; }
    setPrefillStatus("prefilling");
    setPrefillMsgIdx(0);
    try {
      const url = buildUrl(api.workflow.prefillFromDocuments.path, { sessionId });
      await fetch(url, { method: "POST", credentials: "include" });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
      setPrefillMsgIdx(PRE_FILL_MESSAGES.length - 1); // "All set!"
      setPrefillStatus("done");
      setTimeout(() => {
        toast({ title: "Documents analyzed", description: "Pre-filled information across Steps 1–3. Review and adjust as you go." });
        onNext();
      }, 1200);
    } catch {
      toast({ title: "Analysis failed", description: "Couldn't pre-fill from documents. You can continue manually.", variant: "destructive" });
      setPrefillStatus(null);
      onNext();
    }
  };

  const isPrefilling = prefillStatus === "prefilling" || prefillStatus === "done";

  return (
    <div className="w-full h-full relative overflow-auto bg-background">
      {/* Pre-fill animation overlay */}
      {isPrefilling && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
          <div className="text-center space-y-8 px-8 max-w-sm">
            <div className="relative w-20 h-20 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-spin border-t-primary" style={{ animationDuration: "1.4s" }} />
              <div className="absolute inset-2 rounded-full border border-primary/10 animate-spin border-t-primary/60" style={{ animationDuration: "2.1s", animationDirection: "reverse" }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-foreground font-semibold text-lg leading-snug">
                {PRE_FILL_MESSAGES[prefillMsgIdx]}
              </p>
              <p className="text-muted-foreground text-sm">Analyzing your documents — just a moment</p>
            </div>
            <div className="flex justify-center gap-2">
              {PRE_FILL_MESSAGES.slice(0, -1).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-500",
                    i <= prefillMsgIdx ? "bg-primary" : "bg-muted-foreground/20",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main centered content */}
      <div className="flex flex-col items-center justify-center min-h-full px-6 py-16">
        <div className="w-full max-w-4xl space-y-8">

          {/* Badge */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/8 border border-primary/15">
              <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs font-medium text-primary">Model Recommendation Engine</span>
            </div>
          </div>

          {/* Headline */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-display font-bold text-foreground leading-tight tracking-tight">
              Before we get started, upload any documents from the Craft phase that would be helpful in your model selection process
            </h1>
            <p className="text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
              We'll analyze your documents to pre-fill context, LEAPs, outcomes, and practices across Steps 1–3.
            </p>
          </div>

          {/* Recommended document types */}
          <div className="flex flex-wrap gap-2 justify-center">
            {DOC_TYPE_CHIPS.map((chip) => (
              <span
                key={chip}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground border border-border bg-muted/60"
              >
                {chip}
              </span>
            ))}
          </div>

          {/* Upload zone */}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.txt,.md,.doc,.ppt"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            className={cn(
              "rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200",
              isDragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50",
            )}
          >
            {uploadMutation.isPending ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm">Uploading...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <CloudUpload className={cn("w-10 h-10 transition-colors", isDragOver ? "text-primary" : "text-muted-foreground/50")} />
                <div>
                  <p className="text-foreground text-sm font-medium">
                    {isDragOver ? "Drop files here" : "Drag & drop files, or click to browse"}
                  </p>
                  <p className="text-muted-foreground text-xs mt-1">PDF, DOCX, PPTX, TXT supported</p>
                </div>
              </div>
            )}
          </div>

          {/* Uploaded files list */}
          {docs.length > 0 && (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                >
                  <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">{doc.fileName}</p>
                    {doc.fileContent && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {doc.fileContent.slice(0, 120)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(doc.id); }}
                    className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action row */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <Button
              onClick={handleNext}
              disabled={uploadMutation.isPending || isPrefilling || docs.length === 0}
              size="lg"
              className="w-full max-w-sm gap-2"
            >
              {docs.length > 0 ? (
                <>Analyze Documents <ArrowRight className="w-4 h-4" /></>
              ) : (
                "Upload a document to continue"
              )}
            </Button>
            <button
              onClick={onSkip}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now →
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — School Context Questionnaire (two sequential sub-screens)
// ---------------------------------------------------------------------------

const GRADE_BAND_OPTIONS_Q = [
  { value: "K-5", label: "Elementary School (K-5)" },
  { value: "6-8", label: "Middle School (6-8)" },
  { value: "9-12", label: "High School (9-12)" },
  { value: "Post-secondary", label: "Post-secondary" },
];

const CONTEXT_PROMPT_QUESTIONS = [
  "What does your student community look like? (demographics, background, needs)",
  "Are there any policy considerations or mandates that shape this experience?",
  "What existing industry or employer partnerships are relevant to this initiative?",
  "Are there post-secondary institutions connected to what you're designing?",
  "What is unique about your context that we should understand?",
];

type RecordingState = "idle" | "recording" | "transcribing";

// Icon mapping for taxonomy group headers — used in both Outcomes and Practices screens
const GROUP_ICON_MAP: Record<string, any> = {
  content_career: BookOpen,
  cross_cutting: Layers,
  postsecondary_assets: Trophy,
  postsecondary_transition: Target,
  academic_integration: BookOpen,
  advising: Users,
  work_based_learning: Briefcase,
  career_college_prep: GraduationCap,
};

interface SchoolContextQuestionnaireProps {
  sessionId: string;
  stepData: Record<string, any>;
  onConfirm: () => void;
}

function SchoolContextQuestionnaire({ sessionId, stepData, onConfirm }: SchoolContextQuestionnaireProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [animKey, setAnimKey] = useState(0);

  // Fields — pre-fill from stepData["1"] if available
  const prefilled = stepData["1"] || {};
  const [district, setDistrict] = useState(prefilled.district || "");
  const [state, setState] = useState(prefilled.state || "");
  const knownBands = ["K-5", "6-8", "9-12", "Post-secondary"];
  // Support both new grade_bands (array) and legacy grade_band (string)
  const prefilledBands: string[] = Array.isArray(prefilled.grade_bands)
    ? prefilled.grade_bands
    : prefilled.grade_band
      ? [prefilled.grade_band].filter((b: string) => knownBands.includes(b))
      : [];
  const [selectedBands, setSelectedBands] = useState<string[]>(prefilledBands);
  const [context, setContext] = useState(prefilled.context || "");
  const [isSaving, setIsSaving] = useState(false);
  const [contextDocs, setContextDocs] = useState<{ name: string }[]>([]);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const contextDocInputRef = useRef<HTMLInputElement>(null);

  const { recordingState, handleStartRecording, handleStopRecording } = useTalkItOut(
    sessionId,
    (text) => setContext((prev: string) => (prev ? `${prev}\n\n${text}` : text)),
  );

  // Sync pre-fills whenever stepData["1"] updates (e.g. after prefill runs)
  useEffect(() => {
    const d = stepData["1"] || {};
    if (d.district && !district) setDistrict(d.district);
    if (d.state && !state) setState(d.state);
    if (selectedBands.length === 0) {
      const bands: string[] = Array.isArray(d.grade_bands)
        ? d.grade_bands
        : d.grade_band
          ? [d.grade_band].filter((b: string) => knownBands.includes(b))
          : [];
      if (bands.length > 0) setSelectedBands(bands);
    }
    if (d.context && !context) setContext(d.context);
  }, [JSON.stringify(stepData["1"])]);

  const anyPreFilled = !!(prefilled.district || prefilled.state || (prefilled.grade_bands?.length || prefilled.grade_band));

  const goToScreen = (n: 1 | 2 | 3) => {
    setScreen(n);
    setAnimKey((k) => k + 1);
  };

  const saveToStepData = async (patch: Record<string, any>) => {
    const currentProgress = await fetch(
      buildUrl(api.workflow.getProgress.path, { sessionId }),
      { credentials: "include" },
    ).then((r) => r.json());
    const currentStepData = { ...(currentProgress.stepData || {}) };
    currentStepData["1"] = { ...(currentStepData["1"] || {}), ...patch };
    await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStep: currentProgress.currentStep,
        stepsCompleted: currentProgress.stepsCompleted,
        stepData: currentStepData,
      }),
      credentials: "include",
    });
    qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
  };

  const goNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (screen === 1) {
        await saveToStepData({ district, state });
        goToScreen(2);
      } else if (screen === 2) {
        await saveToStepData({ grade_bands: selectedBands });
        goToScreen(3);
      } else {
        await saveToStepData({ district, state, grade_bands: selectedBands, context });
        onConfirm();
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const goBack = () => {
    if (screen > 1) goToScreen((screen - 1) as 1 | 2 | 3);
  };

  // Global arrow-key navigation — skip when a textarea is focused (screen 4 write-it)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, isSaving, district, state, selectedBands, context]);

  const handleContextDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const doc = await uploadDocumentFile(file, sessionId, 1);
      setContextDocs((prev) => [...prev, { name: file.name }]);
      if (doc.fileContent) {
        setContext((prev: string) => prev ? `${prev}\n\n[From ${file.name}]:\n${doc.fileContent}` : `[From ${file.name}]:\n${doc.fileContent}`);
      }
      toast({ title: "Document added", description: `${file.name} has been added.` });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingDoc(false);
      if (contextDocInputRef.current) contextDocInputRef.current.value = "";
    }
  };

  // Screen 3 uses wider container for the 3-card grid
  const containerWidth = screen === 3 ? "max-w-4xl" : "max-w-lg";

  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-center min-h-full px-8 py-16">
        <div className={cn("w-full space-y-8 transition-all duration-300", containerWidth)}>

          {/* Pre-fill banner — shown on screen 1 if any fields were pre-filled */}
          {screen === 1 && anyPreFilled && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/8 border border-primary/15 text-sm text-primary">
              <Sparkles className="w-4 h-4 shrink-0" />
              Some fields were pre-filled from your uploaded documents — review and adjust as needed.
            </div>
          )}

          {/* Animated screen content */}
          <div key={animKey} style={{ animation: "schoolFadeIn 0.25s ease forwards" }}>

            {/* ── Screen 1: State + District ── */}
            {screen === 1 && (
              <div className="space-y-8">
                <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
                  Which state and district?
                </h1>
                <div className="space-y-4">
                  <Select value={state} onValueChange={(v) => setState(v)}>
                    <SelectTrigger
                      className={cn("h-14 text-lg border-2 focus:border-primary", prefilled.state && !state ? "bg-primary/5" : state ? "bg-primary/5" : "")}
                    >
                      <SelectValue placeholder="Select a state…" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    autoFocus
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") goNext(); }}
                    placeholder="District (e.g. Chicago Public Schools)"
                    className={cn("h-14 text-lg border-2 focus:border-primary", prefilled.district ? "bg-primary/5" : "")}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Press the → key or button to continue</p>
              </div>
            )}

            {/* ── Screen 2: Grade Band (multi-select) ── */}
            {screen === 2 && (
              <div className="space-y-8">
                <div className="space-y-2">
                  <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
                    What grade band do you serve?
                  </h1>
                  <p className="text-sm text-muted-foreground">Select all that apply.</p>
                </div>
                <div className="space-y-3">
                  {GRADE_BAND_OPTIONS_Q.map((opt) => {
                    const isSelected = selectedBands.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSelectedBands((prev) =>
                            prev.includes(opt.value)
                              ? prev.filter((v) => v !== opt.value)
                              : [...prev, opt.value],
                          );
                        }}
                        className={cn(
                          "w-full text-left rounded-xl border-2 px-6 py-4 text-base font-medium transition-all duration-150 outline-none",
                          "hover:border-primary/60 hover:bg-primary/5",
                          isSelected ? "border-primary bg-primary/10 text-primary shadow-sm" : "border-border bg-background text-foreground",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                            isSelected ? "border-primary bg-primary" : "border-border",
                          )}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          {opt.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Press the → key or button to continue</p>
              </div>
            )}

            {/* ── Screen 3: School Context (single write box + record) ── */}
            {screen === 3 && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h1 className="text-4xl font-display font-bold text-foreground leading-tight">
                    Tell us about your community
                  </h1>
                  <p className="text-muted-foreground text-base">Share context about your school community below.</p>
                </div>

                {/* Consider addressing */}
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Consider addressing:</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                    {CONTEXT_PROMPT_QUESTIONS.map((q) => (
                      <li key={q} className="flex items-start gap-2 text-sm text-foreground/80 leading-snug">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Single write box with inline record button */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <Textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Describe the community context, demographics, partnerships, or policies relevant to this experience..."
                    className="text-sm resize-none min-h-[180px] border-0 focus-visible:ring-0 rounded-none shadow-none"
                  />
                  <div className="border-t border-border px-4 py-2.5 flex items-center gap-3 bg-muted/20">
                    {recordingState === "idle" && (
                      <button
                        type="button"
                        onClick={handleStartRecording}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                      >
                        <div className="w-6 h-6 rounded-full bg-red-50 border border-red-200 flex items-center justify-center group-hover:border-red-300 group-hover:bg-red-100 transition-colors">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        </div>
                        <span>Talk it out</span>
                      </button>
                    )}
                    {recordingState === "recording" && (
                      <button
                        type="button"
                        onClick={handleStopRecording}
                        className="flex items-center gap-2 text-sm text-red-600 font-medium"
                      >
                        <div className="w-6 h-6 rounded-full bg-red-100 border border-red-400 flex items-center justify-center animate-pulse">
                          <div className="w-2.5 h-2.5 rounded-sm bg-red-600" />
                        </div>
                        <span>Recording — tap to stop</span>
                        <div className="flex items-center gap-0.5 ml-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-0.5 bg-red-400 rounded-full animate-pulse" style={{ height: `${8 + (i % 3) * 4}px`, animationDelay: `${i * 100}ms` }} />
                          ))}
                        </div>
                      </button>
                    )}
                    {recordingState === "transcribing" && (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        Transcribing your recording...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Floating nav — consistent with System Elements */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        <button
          type="button"
          onClick={goBack}
          disabled={screen === 1}
          title="Previous"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={isSaving}
          title="Next"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
        </button>
      </div>

      <style>{`
        @keyframes schoolFadeIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Aims for Learners Questionnaire (4 sequential sub-screens)
// ---------------------------------------------------------------------------

const OUTCOMES_CONTEXT_QUESTIONS = [
  "Why are these outcomes the most important for the experience you're designing?",
  "What student needs or goals led you to these choices?",
  "How do these connect to the broader vision for this initiative?",
  "Are there outcomes you're still debating or want to learn more about?",
];

const LEAPS_CONTEXT_QUESTIONS = [
  "What kind of learning culture or environment should this experience create?",
  "Why are these learning principles important for this initiative?",
  "Are there tensions or trade-offs between your LEAPs worth flagging?",
  "What would students say about this experience if you succeeded?",
];

const PRACTICES_CONTEXT_QUESTIONS = [
  "Why are these practices the right fit for the experience you're designing?",
  "Are there practices you're already using that you want to deepen or expand?",
  "What conditions or supports would help these practices thrive in this initiative?",
  "Are there trade-offs or tensions between any of the practices you've chosen?",
];

interface ContextCaptureCardsProps {
  contextText: string;
  setContextText: React.Dispatch<React.SetStateAction<string>>;
  /** @deprecated No longer used — upload removed from context pages */
  contextDocs?: { name: string }[];
  questions: string[];
  /** @deprecated No longer used */
  inputId?: string;
  recordingState: RecordingState;
  onStartRecording: () => void;
  onStopRecording: () => void;
  /** @deprecated No longer used */
  isUploadingDoc?: boolean;
  /** @deprecated No longer used */
  onFileChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Optional selected items to show as a compact reference above the textarea */
  selectedItems?: TaxonomySelection[];
}

const TIER_CHIP: Record<string, { label: string; cls: string }> = {
  most_important: { label: "Top Priority", cls: "bg-primary/10 text-primary border-primary/20" },
  important:      { label: "Important",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  nice_to_have:   { label: "Nice to Have", cls: "bg-muted text-muted-foreground border-border" },
};

function ContextCaptureCards({
  contextText, setContextText, questions,
  recordingState, onStartRecording, onStopRecording,
  selectedItems,
}: ContextCaptureCardsProps) {
  const compactItemsBlock = selectedItems && selectedItems.length > 0 ? (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Your selections</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {selectedItems.map((sel) => {
          const chip = TIER_CHIP[sel.importance] ?? TIER_CHIP.nice_to_have;
          return (
            <div key={sel.id} className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-foreground font-medium truncate flex-1">{sel.name}</span>
              <span className={cn("shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap", chip.cls)}>
                {chip.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      {compactItemsBlock}

      {/* Prompt questions */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Consider addressing:</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {questions.map((q) => (
            <li key={q} className="flex items-start gap-2 text-sm text-foreground/80 leading-snug">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
              {q}
            </li>
          ))}
        </ul>
      </div>

      {/* Write area + inline Talk it out */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Textarea
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          placeholder="Share your thinking here..."
          className="text-sm resize-none min-h-[180px] border-0 focus-visible:ring-0 rounded-none shadow-none"
        />
        <div className="border-t border-border px-4 py-2.5 flex items-center gap-3 bg-muted/20">
          {recordingState === "idle" && (
            <button
              type="button"
              onClick={onStartRecording}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
              <div className="w-6 h-6 rounded-full bg-red-50 border border-red-200 flex items-center justify-center group-hover:border-red-300 group-hover:bg-red-100 transition-colors">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              </div>
              <span>Talk it out</span>
            </button>
          )}
          {recordingState === "recording" && (
            <button
              type="button"
              onClick={onStopRecording}
              className="flex items-center gap-2 text-sm text-red-600 font-medium"
            >
              <div className="w-6 h-6 rounded-full bg-red-100 border border-red-400 flex items-center justify-center animate-pulse">
                <div className="w-2.5 h-2.5 rounded-sm bg-red-600" />
              </div>
              <span>Recording — tap to stop</span>
              <div className="flex items-center gap-0.5 ml-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-0.5 bg-red-400 rounded-full animate-pulse" style={{ height: `${8 + (i % 3) * 4}px`, animationDelay: `${i * 100}ms` }} />
                ))}
              </div>
            </button>
          )}
          {recordingState === "transcribing" && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Transcribing your recording...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface AimsForLearnersQuestionnaireProps {
  sessionId: string;
  stepData: Record<string, any>;
  onConfirm: () => void;
  /** "outcomes" = 3-screen outcomes-only; "leaps" = 3-screen leaps-only; "full" = original 6-screen (default). */
  mode?: "full" | "outcomes" | "leaps";
}

function AimsForLearnersQuestionnaire({ sessionId, stepData, onConfirm, mode = "full" }: AimsForLearnersQuestionnaireProps) {
  const { data: taxonomyItems = [], isLoading } = useTaxonomyItems(2);
  const qc = useQueryClient();
  const { toast } = useToast();

  const [screen, setScreen] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [isSaving, setIsSaving] = useState(false);

  const currentData = stepData["2"] || {};

  // v2: When the user is in Path B (specific experience), use the experience
  // name in headings/copy where applicable so the questions feel scoped.
  const isPathB = stepData.designScope === "specific_experience";
  const rawExpNameLocal = (stepData.experience as Record<string, any>)?.name;
  const experienceName: string | null =
    typeof rawExpNameLocal === "string" && rawExpNameLocal.trim() !== "" ? rawExpNameLocal.trim() : null;
  /** Path B copy fallback when experience name omitted */
  const pathBScopeLabel = experienceName ?? "this learning experience";

  // Track initially-prefilled ids so we can show "Pre-filled" badges
  const initialPrefilled = useRef<{ outcomes: Set<number>; leaps: Set<number> }>({
    outcomes: new Set((currentData.selected_outcomes || []).map((s: TaxonomySelection) => s.id)),
    leaps: new Set((currentData.selected_leaps || []).map((s: TaxonomySelection) => s.id)),
  });

  // Selection state — local mirrors of stepData["2"]
  const [selectedOutcomes, setSelectedOutcomes] = useState<TaxonomySelection[]>(
    currentData.selected_outcomes || [],
  );
  const [selectedLeaps, setSelectedLeaps] = useState<TaxonomySelection[]>(
    currentData.selected_leaps || [],
  );

  // Context text state
  const [outcomesContext, setOutcomesContext] = useState<string>(currentData.outcomes_summary || "");
  const [leapsContext, setLeapsContext] = useState<string>(currentData.leaps_summary || "");

  // Once the user makes any manual selection change, stop syncing selections from the server
  // (prevents saveToStepData → invalidateQueries → refetch → useEffect from overwriting local state)
  const userHasEdited = useRef(false);

  // Sync from parent when pre-fill runs while on this step
  useEffect(() => {
    const d = stepData["2"] || {};
    if (!userHasEdited.current) {
      if (d.selected_outcomes) setSelectedOutcomes(d.selected_outcomes);
      if (d.selected_leaps) setSelectedLeaps(d.selected_leaps);
    }
    if (d.outcomes_summary && !outcomesContext) setOutcomesContext(d.outcomes_summary);
    if (d.leaps_summary && !leapsContext) setLeapsContext(d.leaps_summary);
  }, [JSON.stringify(stepData["2"])]);

  // Recording
  const recordingTargetRef = useRef<"outcomes" | "leaps">("outcomes");
  const { recordingState, handleStartRecording: startRecording, handleStopRecording } = useTalkItOut(
    sessionId,
    (text) => {
      if (recordingTargetRef.current === "outcomes") {
        setOutcomesContext((prev: string) => prev ? `${prev}\n\n${text}` : text);
      } else {
        setLeapsContext((prev: string) => prev ? `${prev}\n\n${text}` : text);
      }
    },
  );

  const handleStartRecording = (target: "outcomes" | "leaps") => {
    recordingTargetRef.current = target;
    startRecording();
  };

  // Doc upload
  const [outcomesContextDocs, setOutcomesContextDocs] = useState<{ name: string }[]>([]);
  const [leapsContextDocs, setLeapsContextDocs] = useState<{ name: string }[]>([]);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const contextDocInputRef = useRef<HTMLInputElement>(null);

  const outcomes = taxonomyItems.filter((t) => t.category === "outcome");
  const leaps = taxonomyItems.filter((t) => t.category === "leap");

  // ── Persist helpers ──────────────────────────────────────────────────────

  const saveToStepData = async (patch: Record<string, any>) => {
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then((r) => r.json());
      const sd = { ...(currentProgress.stepData || {}) };
      sd["2"] = { ...(sd["2"] || {}), ...patch };
      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: currentProgress.currentStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: sd,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
  };


  // ── Doc upload ───────────────────────────────────────────────────────────

  const handleContextDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "outcomes" | "leaps") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const doc = await uploadDocumentFile(file, sessionId, 2);
      if (target === "outcomes") {
        setOutcomesContextDocs((prev) => [...prev, { name: file.name }]);
        if (doc.fileContent) setOutcomesContext((prev: string) => prev ? `${prev}\n\n[From ${file.name}]:\n${doc.fileContent}` : `[From ${file.name}]:\n${doc.fileContent}`);
      } else {
        setLeapsContextDocs((prev) => [...prev, { name: file.name }]);
        if (doc.fileContent) setLeapsContext((prev: string) => prev ? `${prev}\n\n[From ${file.name}]:\n${doc.fileContent}` : `[From ${file.name}]:\n${doc.fileContent}`);
      }
      toast({ title: "Document added", description: `${file.name} has been added.` });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingDoc(false);
      if (contextDocInputRef.current) contextDocInputRef.current.value = "";
    }
  };

  // ── Prioritization helpers ────────────────────────────────────────────────

  const setOutcomeTier = (id: number, tier: TaxonomySelection["importance"]) => {
    if (tier === "most_important") {
      const topCount = selectedOutcomes.filter((s) => s.importance === "most_important" && s.id !== id).length;
      if (topCount >= MAX_TOP_PRIORITIES) {
        toast({
          title: "Limit reached",
          description: isPathB
            ? `Max ${MAX_TOP_PRIORITIES} outcomes in highest priority.`
            : `Max ${MAX_TOP_PRIORITIES} top priorities.`,
        });
        return;
      }
    }
    userHasEdited.current = true;
    const next = sortByTier(selectedOutcomes.map((s) => s.id === id ? { ...s, importance: tier } : s));
    setSelectedOutcomes(next);
    saveToStepData({ selected_outcomes: next });
  };

  const moveOutcome = (id: number, dir: "up" | "down") => {
    const arr = [...selectedOutcomes];
    const idx = arr.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= arr.length || arr[idx].importance !== arr[newIdx].importance) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    userHasEdited.current = true;
    setSelectedOutcomes(arr);
    saveToStepData({ selected_outcomes: arr });
  };

  const setLeapTier = (id: number, tier: TaxonomySelection["importance"]) => {
    if (tier === "most_important") {
      const topCount = selectedLeaps.filter((s) => s.importance === "most_important" && s.id !== id).length;
      if (topCount >= MAX_TOP_PRIORITIES) {
        toast({
          title: "Limit reached",
          description: isPathB
            ? `Max ${MAX_TOP_PRIORITIES} LEAPs in highest priority.`
            : `Max ${MAX_TOP_PRIORITIES} top priorities.`,
        });
        return;
      }
    }
    userHasEdited.current = true;
    const next = sortByTier(selectedLeaps.map((s) => s.id === id ? { ...s, importance: tier } : s));
    setSelectedLeaps(next);
    saveToStepData({ selected_leaps: next });
  };

  const moveLeap = (id: number, dir: "up" | "down") => {
    const arr = [...selectedLeaps];
    const idx = arr.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= arr.length || arr[idx].importance !== arr[newIdx].importance) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    userHasEdited.current = true;
    setSelectedLeaps(arr);
    saveToStepData({ selected_leaps: arr });
  };

  // ── Screen nav ───────────────────────────────────────────────────────────

  const goNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (mode === "outcomes") {
        if (screen === 1) { await saveToStepData({ selected_outcomes: selectedOutcomes }); setScreen(2); }
        else if (screen === 2) { await saveToStepData({ selected_outcomes: selectedOutcomes }); setScreen(3); }
        else { await saveToStepData({ outcomes_summary: outcomesContext }); onConfirm(); }
      } else if (mode === "leaps") {
        if (screen === 1) { await saveToStepData({ selected_leaps: selectedLeaps }); setScreen(2); }
        else if (screen === 2) { await saveToStepData({ selected_leaps: selectedLeaps }); setScreen(3); }
        else { await saveToStepData({ leaps_summary: leapsContext }); onConfirm(); }
      } else {
        // full: original 6-screen behavior
        if (screen === 1) { await saveToStepData({ selected_outcomes: selectedOutcomes }); setScreen(2); }
        else if (screen === 2) { await saveToStepData({ selected_outcomes: selectedOutcomes }); setScreen(3); }
        else if (screen === 3) { await saveToStepData({ outcomes_summary: outcomesContext }); setScreen(4); }
        else if (screen === 4) { await saveToStepData({ selected_leaps: selectedLeaps }); setScreen(5); }
        else if (screen === 5) { await saveToStepData({ selected_leaps: selectedLeaps }); setScreen(6); }
        else {
          await saveToStepData({ selected_outcomes: selectedOutcomes, selected_leaps: selectedLeaps, outcomes_summary: outcomesContext, leaps_summary: leapsContext });
          onConfirm();
        }
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const goBack = () => {
    if (screen > 1) setScreen((screen - 1) as 1 | 2 | 3 | 4 | 5 | 6);
  };

  // Global arrow-key navigation — skip when a textarea is focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, isSaving, selectedOutcomes, selectedLeaps, outcomesContext, leapsContext]);

  // ── Sub-step indicator ─────────────────────────────────────────────────────

  const subStepLabels = mode === "outcomes"
    ? ["Select Outcomes", "Prioritize", "Context"]
    : mode === "leaps"
      ? ["Select LEAPs", "Prioritize", "Context"]
      : ["Select Outcomes", "Prioritize Outcomes", "Outcomes Context", "Select LEAPs", "Prioritize LEAPs", "LEAPs Context"];

  const SubStepIndicator = (
    <div className="flex items-center gap-1 flex-wrap">
      {subStepLabels.map((label, i) => {
        const num = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        const isActive = screen === num;
        const isDone = screen > num;
        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              onClick={() => setScreen(num)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors",
                isActive ? "cursor-default" : "hover:bg-muted/60 cursor-pointer",
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shrink-0",
                isActive ? "bg-primary text-white" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {isDone ? <Check className="w-3 h-3" /> : num}
              </div>
              <span className={cn(
                "text-[11px] font-medium whitespace-nowrap",
                isActive ? "text-foreground" : isDone ? "text-primary/70" : "text-muted-foreground",
              )}>
                {label}
              </span>
            </button>
            {i < 5 && <div className="w-4 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );

  // ── Reusable item card for the browse grid ─────────────────────────────────

  const renderBrowseCard = (
    item: TaxonomyItem,
    isSelected: boolean,
    isPrefilled: boolean,
    onToggle: () => void,
  ) => (
    <button
      key={item.id}
      type="button"
      onClick={onToggle}
      className={cn(
        "relative w-full text-left rounded-xl border p-3 transition-all cursor-pointer group flex flex-col",
        "min-h-[88px]",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      {isPrefilled && !isSelected && (
        <span className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium leading-none">
          Pre-filled
        </span>
      )}
      <div className="flex items-start gap-2">
        <div className={cn(
          "mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
          isSelected ? "border-primary bg-primary" : "border-border group-hover:border-primary/50",
        )}>
          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
        <p className="text-sm font-medium leading-snug text-foreground flex-1">{item.name}</p>
      </div>
      {item.description && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs mt-1.5 ml-6 leading-snug line-clamp-2 text-muted-foreground cursor-default">{item.description}</p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">{item.description}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </button>
  );

  // ── Priority row for the prioritize screens ────────────────────────────────

  const renderPriorityRow = (
    sel: TaxonomySelection,
    canMoveUp: boolean,
    canMoveDown: boolean,
    setTier: (id: number, tier: TaxonomySelection["importance"]) => void,
    move: (id: number, dir: "up" | "down") => void,
  ) => {
    const tierColors: Record<string, string> = {
      most_important: "bg-primary text-white border-primary",
      important: "bg-amber-50 text-amber-700 border-amber-200",
      nice_to_have: "bg-muted text-muted-foreground border-border",
    };
    const tiers = ["most_important", "important", "nice_to_have"] as const;
    const tierLabel: Record<string, string> = {
      most_important: isPathB ? "Highest priority" : "Top Priority",
      important: "Important",
      nice_to_have: "Nice to Have",
    };
    return (
      <div key={sel.id} className="flex items-center gap-3 bg-background px-4 py-3">
        {/* Reorder arrows within tier */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={() => move(sel.id, "up")} disabled={!canMoveUp}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors">
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => move(sel.id, "down")} disabled={!canMoveDown}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors">
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        {/* Name */}
        <p className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{sel.name}</p>
        {/* Tier buttons — clicking moves item to that section */}
        <div className="flex items-center gap-1 shrink-0">
          {tiers.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(sel.id, t)}
              className={cn(
                "text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors whitespace-nowrap",
                sel.importance === t
                  ? tierColors[t]
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-primary",
              )}
            >
              {tierLabel[t]}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Reusable "select" screen (Screens 1 and 4) ────────────────────────────

  const renderSelectScreen = (
    kind: "outcomes" | "leaps",
    title: string,
    description: string,
    selected: TaxonomySelection[],
    allItems: TaxonomyItem[],
    prefillSet: Set<number>,
    onToggle: (item: TaxonomyItem) => void,
  ) => {
    const isItemSelected = (item: TaxonomyItem) => selected.some((s) => s.id === item.id);

    const renderGroupedGrid = (items: TaxonomyItem[]) => {
      const cardRow = (group_items: TaxonomyItem[]) => (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
          {group_items.map((item) => renderBrowseCard(item, isItemSelected(item), prefillSet.has(item.id), () => onToggle(item)))}
        </div>
      );

      if (kind === "leaps") return cardRow(items);

      return (
        <div className="space-y-5">
          {OUTCOME_GROUPS.map((group) => {
            const groupItems = items.filter((t) => t.group === group.key);
            if (groupItems.length === 0) return null;
            const GroupIcon = GROUP_ICON_MAP[group.key];
            return (
              <div key={group.key} className="space-y-3">
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  {GroupIcon && <GroupIcon className="w-4 h-4 text-foreground shrink-0" />}
                  <h3 className="text-sm font-bold text-foreground">{group.label}</h3>
                </div>
                {cardRow(groupItems)}
              </div>
            );
          })}
          {(() => {
            const ug = items.filter((t) => !OUTCOME_GROUPS.find((g) => g.key === t.group));
            if (!ug.length) return null;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                  <h3 className="text-sm font-bold text-foreground">Other</h3>
                </div>
                {cardRow(ug)}
              </div>
            );
          })()}
        </div>
      );
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground leading-tight">{title}</h1>
          <p className="text-muted-foreground text-base mt-1.5 leading-relaxed max-w-2xl">{description}</p>
        </div>

        {/* Selection summary — compact pill strip */}
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-muted/20 px-4 py-3">
          <span className="text-sm font-semibold text-foreground shrink-0">
            {selected.length > 0 ? `${selected.length} selected` : "None selected yet"}
          </span>
          {selected.map((sel) => (
            <div key={sel.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs font-medium text-primary">
              <span>{sel.name}</span>
              <button
                type="button"
                onClick={() => { const item = allItems.find((t) => t.id === sel.id); if (item) onToggle(item); }}
                className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-primary/20 transition-colors ml-0.5"
              >
                <X className="w-2 h-2" />
              </button>
            </div>
          ))}
        </div>

        {/* Full grid — all items, toggle in place */}
        {renderGroupedGrid(allItems)}
      </div>
    );
  };

  // ── Reusable "prioritize" screen (Screens 2 and 5) ───────────────────────

  const renderPrioritizeScreen = (
    title: string,
    description: string,
    selected: TaxonomySelection[],
    setTier: (id: number, tier: TaxonomySelection["importance"]) => void,
    move: (id: number, dir: "up" | "down") => void,
  ) => {
    const topTierLabel = isPathB ? "Highest priority" : "Top Priority";
    const TIER_SECTIONS = [
      { key: "most_important" as const, label: topTierLabel, note: `max ${MAX_TOP_PRIORITIES}`, headerCls: "bg-primary/5 border-primary/15", labelCls: "text-primary" },
      { key: "important" as const,      label: "Important",    note: null,                        headerCls: "bg-amber-50 border-amber-200",   labelCls: "text-amber-700" },
      { key: "nice_to_have" as const,   label: "Nice to Have", note: null,                        headerCls: "bg-muted/30 border-border",       labelCls: "text-muted-foreground" },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground leading-tight">{title}</h1>
          <p className="text-muted-foreground text-base mt-1.5 leading-relaxed max-w-2xl">{description}</p>
        </div>

        {selected.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">Nothing selected yet — go back to add some.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {TIER_SECTIONS.map((tier) => {
              const tierItems = selected.filter((s) => s.importance === tier.key);
              return (
                <div key={tier.key} className="rounded-xl border border-border overflow-hidden">
                  <div className={cn("flex items-center gap-2 px-4 py-2.5 border-b border-border", tier.headerCls)}>
                    <span className={cn("text-sm font-semibold", tier.labelCls)}>{tier.label}</span>
                    {tier.note && <span className="text-xs text-muted-foreground ml-0.5">({tier.note})</span>}
                    <span className="ml-auto text-xs text-muted-foreground font-medium tabular-nums">
                      {tierItems.length} item{tierItems.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {tierItems.length === 0 ? (
                    <div className="px-4 py-3 bg-background">
                      <p className="text-sm text-muted-foreground italic">None assigned — use the tier buttons on any item to move it here.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {tierItems.map((sel, posInTier) =>
                        renderPriorityRow(sel, posInTier > 0, posInTier < tierItems.length - 1, setTier, move)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-start min-h-full px-8 py-12">
        <div className="w-full max-w-4xl space-y-8">

          {SubStepIndicator}

          {/* ── Outcomes screens (mode: "outcomes" | "full") ─── */}
          {mode !== "leaps" && screen === 1 && renderSelectScreen(
            "outcomes",
            isPathB ? `What are the target outcomes for ${pathBScopeLabel}?` : "Select your target outcomes",
            isPathB
              ? `Choose and refine the outcomes that define success for ${pathBScopeLabel}. Use your documents as a starting point—add or remove items so the list reflects this experience.`
              : "Review the outcomes identified from your documents, remove any that don't apply, and add any you're missing.",
            selectedOutcomes, outcomes, initialPrefilled.current.outcomes,
            (item) => {
              userHasEdited.current = true;
              const existing = selectedOutcomes.find((s) => s.id === item.id);
              if (existing) {
                const next = selectedOutcomes.filter((s) => s.id !== item.id);
                setSelectedOutcomes(next); saveToStepData({ selected_outcomes: next });
              } else {
                const next = sortByTier([...selectedOutcomes, { id: item.id, name: item.name, importance: "important" as const }]);
                setSelectedOutcomes(next); saveToStepData({ selected_outcomes: next });
              }
            },
          )}

          {mode !== "leaps" && screen === 2 && renderPrioritizeScreen(
            isPathB ? `Prioritize outcomes for ${pathBScopeLabel}` : "Prioritize your outcomes",
            isPathB ? `Assign each outcome a tier for ${pathBScopeLabel}. Use the arrows to reorder within a tier. Max ${MAX_TOP_PRIORITIES} highest priority.` : "Assign a priority tier to each outcome. Use the arrows to reorder within a tier. Max 2 Top Priority.",
            selectedOutcomes, setOutcomeTier, moveOutcome,
          )}

          {mode !== "leaps" && screen === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
                  {isPathB ? `Anything else about the outcomes for ${pathBScopeLabel}?` : "Anything else about your outcomes?"}
                </h1>
                <p className="text-muted-foreground text-base mt-1.5 leading-relaxed">
                  {isPathB ? `Share any context that helps us understand why these outcomes matter for ${pathBScopeLabel}.` : "Share any context that helps us understand why these outcomes matter for the experience you're designing."}
                </p>
              </div>
              <ContextCaptureCards
                contextText={outcomesContext} setContextText={setOutcomesContext}
                contextDocs={outcomesContextDocs} questions={OUTCOMES_CONTEXT_QUESTIONS}
                inputId="aims-outcomes-doc-upload" recordingState={recordingState}
                onStartRecording={() => handleStartRecording("outcomes")} onStopRecording={handleStopRecording}
                isUploadingDoc={isUploadingDoc} onFileChange={(e) => handleContextDocUpload(e, "outcomes")}
                selectedItems={selectedOutcomes}
              />
            </div>
          )}

          {/* ── LEAPs screens (mode: "leaps" uses screens 1-3; "full" uses 4-6) ── */}
          {/* Select LEAPs */}
          {((mode === "leaps" && screen === 1) || (mode === "full" && screen === 4)) && renderSelectScreen(
            "leaps",
            isPathB ? `What are the targeted LEAPs for ${pathBScopeLabel}?` : "Select your LEAPs",
            isPathB
              ? `Choose the learning principles and design moves that best fit ${pathBScopeLabel}. Use your documents as a starting point—add or remove items below.`
              : "Review the LEAPs identified from your documents, remove any that don't apply, and add any you're missing.",
            selectedLeaps, leaps, initialPrefilled.current.leaps,
            (item) => {
              userHasEdited.current = true;
              const existing = selectedLeaps.find((s) => s.id === item.id);
              if (existing) {
                const next = selectedLeaps.filter((s) => s.id !== item.id);
                setSelectedLeaps(next); saveToStepData({ selected_leaps: next });
              } else {
                const next = sortByTier([...selectedLeaps, { id: item.id, name: item.name, importance: "important" as const }]);
                setSelectedLeaps(next); saveToStepData({ selected_leaps: next });
              }
            },
          )}

          {/* Prioritize LEAPs */}
          {((mode === "leaps" && screen === 2) || (mode === "full" && screen === 5)) && renderPrioritizeScreen(
            isPathB ? `Prioritize LEAPs for ${pathBScopeLabel}` : "Prioritize your LEAPs",
            isPathB ? `Assign each LEAP a tier for ${pathBScopeLabel}. Use the arrows to reorder within a tier. Max ${MAX_TOP_PRIORITIES} highest priority.` : "Assign a priority tier to each LEAP. Use the arrows to reorder within a tier. Max 2 Top Priority.",
            selectedLeaps, setLeapTier, moveLeap,
          )}

          {/* LEAPs Context */}
          {((mode === "leaps" && screen === 3) || (mode === "full" && screen === 6)) && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
                  {isPathB ? `Anything else about the LEAPs for ${pathBScopeLabel}?` : "Anything else about your LEAPs?"}
                </h1>
                <p className="text-muted-foreground text-base mt-1.5 leading-relaxed">
                  {isPathB ? `Share additional context about the culture and learner experience you're designing for ${pathBScopeLabel}.` : "Share additional context about the learning experience and culture you're trying to create."}
                </p>
              </div>
              <ContextCaptureCards
                contextText={leapsContext} setContextText={setLeapsContext}
                contextDocs={leapsContextDocs} questions={LEAPS_CONTEXT_QUESTIONS}
                inputId="aims-leaps-doc-upload" recordingState={recordingState}
                onStartRecording={() => handleStartRecording("leaps")} onStopRecording={handleStopRecording}
                isUploadingDoc={isUploadingDoc} onFileChange={(e) => handleContextDocUpload(e, "leaps")}
                selectedItems={selectedLeaps}
              />
            </div>
          )}

        </div>
      </div>

      {/* Floating nav */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        <button type="button" onClick={goBack} disabled={screen === 1} title="Previous"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <button type="button" onClick={goNext} disabled={isSaving} title="Next"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
          {isSaving ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Practices & Experiences Questionnaire
// ---------------------------------------------------------------------------

export type PracticesQuestionnaireHandle = {
  advance: () => Promise<void>;
  retreat: () => void;
};

interface PracticesQuestionnaireProps {
  sessionId: string;
  stepData: Record<string, any>;
  onConfirm: () => void;
  /** Embedded in Path B Define Experience — select additional practices then prioritize (no Practices context screen). */
  variant?: "default" | "pathBExperienceAddition";
  onEmbeddedBack?: () => void;
  /** When set with embed variant, exclude these from additional selection and tier editing (shown as fixed “highest priority”). */
  pathBPrimaryPracticeIds?: number[];
  pathBHideSubStepIndicator?: boolean;
  pathBHideFloatingNav?: boolean;
  /** Parent-driven sub-step inside Define Experience (1 = additional, 2 = prioritize). */
  pathBControlledStep?: 1 | 2;
  onPathBControlledStepChange?: (step: 1 | 2) => void;
}

const PracticesQuestionnaire = forwardRef<PracticesQuestionnaireHandle, PracticesQuestionnaireProps>(function PracticesQuestionnaire({
  sessionId,
  stepData,
  onConfirm,
  variant = "default",
  onEmbeddedBack,
  pathBPrimaryPracticeIds,
  pathBHideSubStepIndicator = false,
  pathBHideFloatingNav = false,
  pathBControlledStep,
  onPathBControlledStepChange,
}, ref) {
  const { data: taxonomyItemsRaw = [], isLoading } = useTaxonomyItems(3);
  const qc = useQueryClient();
  const { toast } = useToast();
  const embedPathB = variant === "pathBExperienceAddition";
  const primaryIdSet = useMemo(
    () => new Set(pathBPrimaryPracticeIds ?? []),
    [pathBPrimaryPracticeIds],
  );
  const pathBPartitionPractices = embedPathB && primaryIdSet.size > 0;
  const isControlledEmbed =
    embedPathB && pathBControlledStep != null && onPathBControlledStepChange != null;

  // 3 sub-screens normally: Select → Prioritize → Context. Path-B embed skips Context.
  const [internalScreen, setInternalScreen] = useState<1 | 2 | 3>(1);
  const screen = isControlledEmbed ? pathBControlledStep! : internalScreen;
  const [isSaving, setIsSaving] = useState(false);

  const currentData = stepData["3"] || {};

  // Track initially-prefilled ids for "Pre-filled" badges
  const initialPrefilled = useRef<Set<number>>(
    new Set((currentData.selected_practices || []).map((s: TaxonomySelection) => s.id)),
  );

  const [selectedPractices, setSelectedPractices] = useState<TaxonomySelection[]>(
    currentData.selected_practices || [],
  );
  const [practicesContext, setPracticesContext] = useState<string>(currentData.practices_summary || "");

  // Once the user makes any manual selection change, stop syncing selections from the server
  const userHasEdited = useRef(false);

  // Sync from parent if pre-fill runs while on this step.
  // Also remap stale taxonomy IDs (e.g., after a re-seed) by matching on name.
  useEffect(() => {
    const d = stepData["3"] || {};
    if (!userHasEdited.current && d.selected_practices) {
      if (taxonomyItemsRaw.length > 0) {
        const nameToItem: Record<string, TaxonomyItem> = {};
        taxonomyItemsRaw.forEach((t) => { nameToItem[t.name.toLowerCase()] = t; });
        const remapped: TaxonomySelection[] = d.selected_practices.map((s: TaxonomySelection) => {
          // If the stored ID exists in the current taxonomy, keep it
          const exists = taxonomyItemsRaw.some((t) => t.id === s.id);
          if (exists) return s;
          // Otherwise look up by name and use the current ID
          const match = nameToItem[s.name.toLowerCase()];
          return match ? { ...s, id: match.id } : s;
        });
        setSelectedPractices(remapped);
        // Keep initialPrefilled in sync with the remapped IDs
        initialPrefilled.current = new Set(remapped.map((s) => s.id));
        // Persist the remapped IDs back to the server so they stay fixed
        if (remapped.some((s: TaxonomySelection, i: number) => s.id !== d.selected_practices[i].id)) {
          saveToStepData({ selected_practices: remapped });
        }
      } else {
        setSelectedPractices(d.selected_practices);
      }
    }
    if (d.practices_summary && !practicesContext) setPracticesContext(d.practices_summary);
  }, [JSON.stringify(stepData["3"]), taxonomyItemsRaw.length]);

  // Recording
  const { recordingState, handleStartRecording, handleStopRecording } = useTalkItOut(
    sessionId,
    (text) => setPracticesContext((prev: string) => prev ? `${prev}\n\n${text}` : text),
  );

  // Doc upload
  const [practicesContextDocs, setPracticesContextDocs] = useState<{ name: string }[]>([]);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const practices = taxonomyItemsRaw.filter((t) => t.category === "practice");

  // ── Persist helper ─────────────────────────────────────────────────────────

  const saveToStepData = async (patch: Record<string, any>) => {
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then((r) => r.json());
      const sd = { ...(currentProgress.stepData || {}) };
      sd["3"] = { ...(sd["3"] || {}), ...patch };
      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: currentProgress.currentStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: sd,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
  };

  // ── Doc upload ─────────────────────────────────────────────────────────────

  const handleContextDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const doc = await uploadDocumentFile(file, sessionId, 3);
      setPracticesContextDocs((prev) => [...prev, { name: file.name }]);
      if (doc.fileContent) {
        setPracticesContext((prev: string) =>
          prev ? `${prev}\n\n[From ${file.name}]:\n${doc.fileContent}` : `[From ${file.name}]:\n${doc.fileContent}`,
        );
      }
      toast({ title: "Document added", description: `${file.name} has been added.` });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // ── Prioritization helpers ─────────────────────────────────────────────────

  const setPracticeTier = (id: number, tier: TaxonomySelection["importance"]) => {
    if (primaryIdSet.has(id)) return;
    if (tier === "most_important") {
      const topCount = selectedPractices.filter(
        (s) =>
          s.importance === "most_important"
          && s.id !== id
          && (!pathBPartitionPractices || !primaryIdSet.has(s.id)),
      ).length;
      if (topCount >= MAX_TOP_PRIORITIES) {
        toast({
          title: "Limit reached",
          description: embedPathB
            ? `You can mark at most ${MAX_TOP_PRIORITIES} additional practices as highest priority (your primary practices are already fixed).`
            : `Max ${MAX_TOP_PRIORITIES} top priorities.`,
        });
        return;
      }
    }
    userHasEdited.current = true;
    const next = sortByTier(selectedPractices.map((s) => s.id === id ? { ...s, importance: tier } : s));
    setSelectedPractices(next);
    saveToStepData({ selected_practices: next });
  };

  const movePractice = (id: number, dir: "up" | "down") => {
    if (primaryIdSet.has(id)) return;
    const arr = [...selectedPractices];
    const idx = arr.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= arr.length || arr[idx].importance !== arr[newIdx].importance) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    userHasEdited.current = true;
    setSelectedPractices(arr);
    saveToStepData({ selected_practices: arr });
  };

  const goNext = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      if (screen === 1) {
        await saveToStepData({ selected_practices: selectedPractices });
        if (isControlledEmbed) {
          onPathBControlledStepChange!(2);
        } else {
          setInternalScreen(2);
        }
      } else if (screen === 2) {
        await saveToStepData({ selected_practices: selectedPractices });
        if (embedPathB) {
          onConfirm();
        } else {
          setInternalScreen(3);
        }
      } else {
        await saveToStepData({ selected_practices: selectedPractices, practices_summary: practicesContext });
        onConfirm();
      }
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const goBack = () => {
    if (embedPathB && screen === 1 && onEmbeddedBack) {
      onEmbeddedBack();
      return;
    }
    if (screen > 1) {
      if (isControlledEmbed && screen === 2) {
        onPathBControlledStepChange!(1);
        return;
      }
      setInternalScreen((s) => (s - 1) as 1 | 2 | 3);
    }
  };

  const navHandlersRef = useRef({ goNext, goBack });
  navHandlersRef.current = { goNext, goBack };
  useImperativeHandle(ref, () => ({
    advance: () => navHandlersRef.current.goNext(),
    retreat: () => navHandlersRef.current.goBack(),
  }), []);

  // Global arrow-key navigation — skip when a textarea is focused
  useEffect(() => {
    if (pathBHideFloatingNav) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft")  { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screen, isSaving, selectedPractices, practicesContext, embedPathB, pathBHideFloatingNav]);

  // ── Sub-step indicator ─────────────────────────────────────────────────────

  const practicesSubStepLabels = embedPathB
    ? ["Additional practices", "Prioritize practices"]
    : ["Select Practices", "Prioritize Practices", "Practices Context"];

  const PracticesSubStepIndicator = !pathBHideSubStepIndicator ? (
    <div className="flex items-center gap-1 flex-wrap">
      {practicesSubStepLabels.map((label, i) => {
        const num = (i + 1) as 1 | 2 | 3;
        const isActive = screen === num;
        const isDone = screen > num;
        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              onClick={() => {
                if (isControlledEmbed && (num === 1 || num === 2)) onPathBControlledStepChange!(num);
                else setInternalScreen(num);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors",
                isActive ? "cursor-default" : "hover:bg-muted/60 cursor-pointer",
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shrink-0",
                isActive ? "bg-primary text-white" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {isDone ? <Check className="w-3 h-3" /> : num}
              </div>
              <span className={cn(
                "text-[11px] font-medium whitespace-nowrap",
                isActive ? "text-foreground" : isDone ? "text-primary/70" : "text-muted-foreground",
              )}>
                {label}
              </span>
            </button>
            {i < practicesSubStepLabels.length - 1 && <div className="w-4 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  ) : null;

  // ── Browse card ────────────────────────────────────────────────────────────

  const renderBrowseCard = (item: TaxonomyItem, isSelected: boolean, isPrefilled: boolean, onToggle: () => void) => (
    <button
      key={item.id}
      type="button"
      onClick={onToggle}
      className={cn(
        "relative w-full text-left rounded-xl border p-3 transition-all cursor-pointer group flex flex-col min-h-[88px]",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      {isPrefilled && !isSelected && (
        <span className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium leading-none">
          Pre-filled
        </span>
      )}
      <div className="flex items-start gap-2">
        <div className={cn(
          "mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
          isSelected ? "border-primary bg-primary" : "border-border group-hover:border-primary/50",
        )}>
          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
        </div>
        <p className="text-sm font-medium leading-snug text-foreground flex-1">{item.name}</p>
      </div>
      {item.description && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs mt-1.5 ml-6 leading-snug line-clamp-2 text-muted-foreground cursor-default">{item.description}</p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">{item.description}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </button>
  );

  // ── Priority row ───────────────────────────────────────────────────────────

  const practiceTierTopLabel = embedPathB ? "Highest priority" : "Top Priority";

  const renderPriorityRow = (sel: TaxonomySelection, canMoveUp: boolean, canMoveDown: boolean) => {
    const tierColors: Record<string, string> = {
      most_important: "bg-primary text-white border-primary",
      important: "bg-amber-50 text-amber-700 border-amber-200",
      nice_to_have: "bg-muted text-muted-foreground border-border",
    };
    const tierLabel: Record<string, string> = {
      most_important: practiceTierTopLabel,
      important: "Important",
      nice_to_have: "Nice to Have",
    };
    const tiers = ["most_important", "important", "nice_to_have"] as const;
    return (
      <div key={sel.id} className="flex items-center gap-3 bg-background px-4 py-3">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button type="button" onClick={() => movePractice(sel.id, "up")} disabled={!canMoveUp}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors">
            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => movePractice(sel.id, "down")} disabled={!canMoveDown}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-20 transition-colors">
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm font-medium text-foreground flex-1 min-w-0 truncate">{sel.name}</p>
        <div className="flex items-center gap-1 shrink-0">
          {tiers.map((t) => (
            <button key={t} type="button" onClick={() => setPracticeTier(sel.id, t)}
              className={cn(
                "text-[10px] font-semibold px-2 py-1 rounded-full border transition-colors whitespace-nowrap",
                sel.importance === t
                  ? tierColors[t]
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-primary",
              )}
            >
              {tierLabel[t]}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  const primaryRows = pathBPartitionPractices
    ? selectedPractices.filter((s) => primaryIdSet.has(s.id))
    : [];
  const additionalPracticesForTiers = pathBPartitionPractices
    ? selectedPractices.filter((s) => !primaryIdSet.has(s.id))
    : selectedPractices;
  const additionalSelectedList = pathBPartitionPractices
    ? selectedPractices.filter((s) => !primaryIdSet.has(s.id))
    : selectedPractices;

  const isPracticeSelected = (item: TaxonomyItem) =>
    selectedPractices.some((s) => s.id === item.id || s.name.toLowerCase() === item.name.toLowerCase());

  const handlePracticeToggle = (item: TaxonomyItem) => {
    if (primaryIdSet.has(item.id)) return;
    userHasEdited.current = true;
    if (isPracticeSelected(item)) {
      const next = selectedPractices.filter((s) => s.id !== item.id);
      setSelectedPractices(next);
      saveToStepData({ selected_practices: next });
    } else {
      const next = sortByTier([...selectedPractices, { id: item.id, name: item.name, importance: "important" as const }]);
      setSelectedPractices(next);
      saveToStepData({ selected_practices: next });
    }
  };

  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-start min-h-full px-8 py-12">
        <div className="w-full max-w-4xl space-y-8">

          {PracticesSubStepIndicator}

          {/* Screen 1: Select Practices */}
          {screen === 1 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
                  {embedPathB ? (
                    (() => {
                      const n = typeof stepData.experience?.name === "string" ? stepData.experience.name.trim() : "";
                      return n ? `Any other practices you want "${n}" to include?` : "Any other practices you want your model to include?";
                    })()
                  ) : (
                    "Select your practices & experiences"
                  )}
                </h1>
                <p className="text-muted-foreground text-base mt-1.5 leading-relaxed max-w-2xl">
                  {embedPathB
                    ? "Your primary practices are already set. Add any other practices you want the model to consider — they’ll appear on the next step for prioritization."
                    : "Review the practices identified from your documents, then add or remove any to match this initiative."}
                </p>
              </div>

              {/* Compact selection summary */}
              <div className="flex items-center gap-3 flex-wrap rounded-xl border border-border bg-muted/20 px-4 py-3">
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {additionalSelectedList.length > 0
                    ? `${additionalSelectedList.length} additional selected`
                    : pathBPartitionPractices
                      ? "No additional practices yet"
                      : "None selected yet"}
                </span>
                {additionalSelectedList.map((sel) => (
                  <div key={sel.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-xs font-medium text-primary">
                    <span>{sel.name}</span>
                    <button type="button"
                      onClick={() => handlePracticeToggle(practices.find((t) => t.id === sel.id) ?? { id: sel.id, name: sel.name } as TaxonomyItem)}
                      className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-primary/20 transition-colors ml-0.5">
                      <X className="w-2 h-2" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Full grid — all practices, toggle in place */}
              <div className="space-y-5">
                {PRACTICE_GROUPS.map((group) => {
                  const groupItems = practices.filter((t) => t.group === group.key && !primaryIdSet.has(t.id));
                  if (groupItems.length === 0) return null;
                  const GroupIcon = GROUP_ICON_MAP[group.key];
                  return (
                    <div key={group.key} className="space-y-3">
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                        {GroupIcon && <GroupIcon className="w-4 h-4 text-foreground shrink-0" />}
                        <h3 className="text-sm font-bold text-foreground">{group.label}</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
                        {groupItems.map((item) => renderBrowseCard(
                          item,
                          isPracticeSelected(item),
                          initialPrefilled.current.has(item.id) && !primaryIdSet.has(item.id),
                          () => handlePracticeToggle(item),
                        ))}
                      </div>
                    </div>
                  );
                })}
                {(() => {
                  const ungrouped = practices.filter((t) => !PRACTICE_GROUPS.find((g) => g.key === t.group) && !primaryIdSet.has(t.id));
                  if (!ungrouped.length) return null;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                        <h3 className="text-sm font-bold text-foreground">Other</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
                        {ungrouped.map((item) => renderBrowseCard(
                          item,
                          isPracticeSelected(item),
                          initialPrefilled.current.has(item.id) && !primaryIdSet.has(item.id),
                          () => handlePracticeToggle(item),
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Screen 2: Prioritize Practices */}
          {screen === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
                  Prioritize your practices
                </h1>
                <p className="text-muted-foreground text-base mt-1.5 leading-relaxed max-w-2xl">
                  {pathBPartitionPractices
                    ? `Your primary practices are fixed at highest priority (not shown below). Assign ${practiceTierTopLabel.toLowerCase()}, important, or nice to have only to additional practices. Max ${MAX_TOP_PRIORITIES} additional in ${practiceTierTopLabel.toLowerCase()}.`
                    : embedPathB
                      ? `Assign each practice a priority tier. Use the arrows to reorder within a tier. Max ${MAX_TOP_PRIORITIES} ${practiceTierTopLabel.toLowerCase()}.`
                      : `Assign each practice a priority tier. Use the arrows to reorder within a tier. Max ${MAX_TOP_PRIORITIES} top priority.`}
                </p>
              </div>

              {pathBPartitionPractices && primaryRows.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden bg-muted/10">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-primary/5">
                    <span className="text-sm font-semibold text-primary">Primary practices (fixed)</span>
                    <span className="text-xs text-muted-foreground">Highest priority — set on Experience details</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {primaryRows.map((sel) => (
                      <li key={sel.id} className="px-4 py-3 text-sm font-medium text-foreground bg-background">
                        {sel.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedPractices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
                  <p className="text-sm text-muted-foreground">Nothing selected yet — go back to add some.</p>
                </div>
              ) : pathBPartitionPractices && additionalPracticesForTiers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No additional practices to prioritize — your primaries are enough. Continue when ready.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(
                    [
                      {
                        key: "most_important" as const,
                        label: practiceTierTopLabel,
                        note: `max ${MAX_TOP_PRIORITIES}${pathBPartitionPractices ? " additional" : ""}`,
                        headerCls: "bg-primary/5 border-primary/15",
                        labelCls: "text-primary",
                      },
                      { key: "important" as const, label: "Important", note: null, headerCls: "bg-amber-50 border-amber-200", labelCls: "text-amber-700" },
                      { key: "nice_to_have" as const, label: "Nice to Have", note: null, headerCls: "bg-muted/30 border-border", labelCls: "text-muted-foreground" },
                    ] as const
                  ).map((tier) => {
                    const tierItems = additionalPracticesForTiers.filter((s) => s.importance === tier.key);
                    return (
                      <div key={tier.key} className="rounded-xl border border-border overflow-hidden">
                        <div className={cn("flex items-center gap-2 px-4 py-2.5 border-b border-border", tier.headerCls)}>
                          <span className={cn("text-sm font-semibold", tier.labelCls)}>{tier.label}</span>
                          {tier.note && <span className="text-xs text-muted-foreground ml-0.5">({tier.note})</span>}
                          <span className="ml-auto text-xs text-muted-foreground font-medium tabular-nums">
                            {tierItems.length} item{tierItems.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {tierItems.length === 0 ? (
                          <div className="px-4 py-3 bg-background">
                            <p className="text-sm text-muted-foreground italic">None assigned — use the tier buttons on any item to move it here.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-border">
                            {tierItems.map((sel, posInTier) =>
                              renderPriorityRow(sel, posInTier > 0, posInTier < tierItems.length - 1),
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Screen 3: Practices Context (Path A standalone step only) */}
          {!embedPathB && screen === 3 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-display font-bold text-foreground leading-tight">Anything else about your practices?</h1>
                <p className="text-muted-foreground text-base mt-1.5 leading-relaxed">
                  Share any context that helps us understand why these practices matter for this experience.
                </p>
              </div>
              <ContextCaptureCards
                contextText={practicesContext}
                setContextText={setPracticesContext}
                contextDocs={practicesContextDocs}
                questions={PRACTICES_CONTEXT_QUESTIONS}
                inputId="practices-context-doc-upload"
                recordingState={recordingState}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                isUploadingDoc={isUploadingDoc}
                onFileChange={handleContextDocUpload}
                selectedItems={selectedPractices}
              />
            </div>
          )}

        </div>
      </div>

      {/* Floating nav */}
      {!pathBHideFloatingNav && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
          <button type="button" onClick={goBack} disabled={screen === 1 && !embedPathB} title="Previous"
            className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <button type="button" onClick={goNext} disabled={isSaving} title="Next"
            className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
            {isSaving ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
          </button>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Step 8 — Model Conversation Panel
// ---------------------------------------------------------------------------

interface ModelConversationPanelProps {
  sessionId: string;
  stepData: Record<string, any>;
}

function ModelConversationPanel({ sessionId, stepData }: ModelConversationPanelProps) {
  const step8Data = stepData["8"] || {};
  const selectedModelId = step8Data.selectedModelId;

  const { data: model } = useQuery<any>({
    queryKey: [api.models.get.path, selectedModelId],
    queryFn: async () => {
      if (!selectedModelId) return null;
      const url = buildUrl(api.models.get.path, { id: selectedModelId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedModelId,
  });

  if (!selectedModelId) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/20">
        <div className="text-center space-y-3 max-w-sm px-8">
          <Bot className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <h3 className="font-semibold text-foreground">No model selected</h3>
          <p className="text-sm text-muted-foreground">
            Go back to Step 7 and click "Explore This Model" on a recommendation to start a conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Model hero header */}
      {model && (
        <div className="shrink-0 border-b border-border bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            {model.imageUrl ? (
              <img src={model.imageUrl} alt={model.name} className="w-14 h-14 rounded-lg object-cover border border-border/50 shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <LayoutGrid className="w-6 h-6 text-primary/50" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-display font-bold text-foreground">{model.name}</h2>
                {model.grades && (
                  <Badge variant="secondary" className="text-xs shrink-0">{model.grades}</Badge>
                )}
                <Badge className="text-xs bg-primary/10 text-primary border-primary/20 shrink-0">
                  <Bot className="w-3 h-3 mr-1" /> Exploring
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{model.description}</p>
            </div>
            <Link href={`/models/${selectedModelId}`}>
              <Button variant="outline" size="sm" className="shrink-0">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Full Profile
              </Button>
            </Link>
          </div>
        </div>
      )}
      {/* Full-width chat */}
      <div className="flex-1 min-h-0">
        <StepChat
          sessionId={sessionId}
          stepNumber={8}
          modelName={model?.name}
        />
      </div>
    </div>
  );
}

interface StepChatProps {
  sessionId: string;
  stepNumber: number;
  onAiSuggestions?: (data: StepChatResponse) => void;
  modelName?: string;
}

function StepChat({ sessionId, stepNumber, onAiSuggestions, modelName }: StepChatProps) {
  const [input, setInput] = useState("");
  const [optimisticUserMsg, setOptimisticUserMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: messages = [], isLoading: isLoadingMessages } = useStepConversation(sessionId, stepNumber);

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(api.chat.stepAdvisor.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, stepNumber, message }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json() as Promise<StepChatResponse>;
    },
    onSuccess: (data) => {
      setOptimisticUserMsg(null);
      qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, stepNumber] });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
      // Pass AI suggestions to the parent for any step with taxonomy
      if (onAiSuggestions && (data.suggested_outcomes || data.suggested_leaps || data.suggested_taxonomy_ids)) {
        onAiSuggestions(data);
      }
    },
    onError: () => {
      setOptimisticUserMsg(null);
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending, optimisticUserMsg]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, []);

  const [greetingTriggered, setGreetingTriggered] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setInput("");
  }, [stepNumber]);

  useEffect(() => {
    if (!isLoadingMessages && messages.length === 0 && !chatMutation.isPending && !greetingTriggered[stepNumber]) {
      setGreetingTriggered(prev => ({ ...prev, [stepNumber]: true }));
      chatMutation.mutate("__greeting__");
    }
  }, [isLoadingMessages, messages.length, stepNumber, greetingTriggered]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    const msg = input;
    setOptimisticUserMsg(msg);
    setInput("");
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    chatMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChatFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadDocumentFile(file, sessionId, stepNumber);
      qc.invalidateQueries({ queryKey: [api.workflow.getDocuments.path, sessionId, stepNumber] });
      chatMutation.mutate(`I've attached a document: "${file.name}". Please review it and incorporate relevant information for this step.`);
    } catch (err) {
      toast({ title: "Upload failed", description: "Could not attach file.", variant: "destructive" });
    }
    e.target.value = "";
  };

  const step = WORKFLOW_STEPS.find(s => s.number === stepNumber)!;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="p-4 border-b border-border bg-white/50 backdrop-blur-sm shrink-0">
        <h2 className="text-base font-bold font-display text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Step {stepNumber}: {step.label}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Chat with the advisor to work through this step
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4 scroll-smooth">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-sm text-muted-foreground">Preparing step guidance...</span>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3 max-w-[90%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <Avatar className="w-7 h-7 shrink-0">
                  {msg.role === "assistant" ? (
                    <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                      <User className="w-3.5 h-3.5" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className={cn(
                  "p-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-none"
                    : "bg-muted text-foreground rounded-tl-none border border-border/50"
                )}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
          
          {/* Show user message immediately while waiting for AI */}
          {optimisticUserMsg && (
            <div className="flex gap-3 max-w-[90%] ml-auto flex-row-reverse">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                  <User className="w-3.5 h-3.5" />
                </AvatarFallback>
              </Avatar>
              <div className="p-3 rounded-2xl text-sm leading-relaxed shadow-sm bg-primary text-primary-foreground rounded-tr-none">
                {optimisticUserMsg}
              </div>
            </div>
          )}

          {chatMutation.isPending && (
            <div className="flex gap-3 mr-auto max-w-[80%]">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
              <div className="bg-muted p-3 rounded-2xl rounded-tl-none flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-3 border-t border-border bg-white shrink-0">
        <input
          ref={chatFileRef}
          type="file"
          onChange={handleChatFileAttach}
          className="hidden"
          accept=".txt,.csv,.xlsx,.xls,.md,.json,.pdf,.doc,.docx,.pptx,.ppt"
          data-testid="input-chat-file"
        />
        <div className="relative flex items-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => chatFileRef.current?.click()}
            disabled={chatMutation.isPending}
            data-testid="button-chat-attach"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              resizeTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 min-h-[44px] max-h-[200px] resize-none py-2.5 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring overflow-y-auto"
            disabled={chatMutation.isPending}
            rows={1}
            data-testid="input-step-chat"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || chatMutation.isPending}
            data-testid="button-send-step-chat"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// === REFERENCE DOCS CARD ===

function ReferenceDocsCard({ entries }: { entries: KnowledgeBaseEntry[] }) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-amber-900">
          <BookOpen className="w-4 h-4" />
          Design Kit Reference
        </CardTitle>
        <p className="text-xs text-amber-700">
          Start here — download and review the reference documents, or upload your design docs and the AI will auto-select relevant items for you.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map((entry) => {
            const canDownload = !!entry.fileMimeType;
            if (canDownload) {
              return (
                <a
                  key={entry.id}
                  href={`/api/kb/${entry.id}/download`}
                  download
                  className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 transition-colors group"
                >
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-amber-100 text-amber-700 group-hover:bg-amber-200 transition-colors shrink-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                    {entry.fileName && (
                      <p className="text-xs text-muted-foreground truncate">{entry.fileName}</p>
                    )}
                  </div>
                  <span className="text-xs font-medium text-amber-700 shrink-0">Download</span>
                </a>
              );
            }
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white"
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted text-muted-foreground shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                  {entry.fileName && (
                    <p className="text-xs text-muted-foreground truncate">{entry.fileName}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">Re-upload to enable download</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// === Detail textarea (local state, saves on blur) ===
function DetailTextarea({ initialValue, onSave, description }: { initialValue: string; onSave: (text: string) => void; description?: string | null }) {
  const [text, setText] = useState(initialValue);
  return (
    <div className="ml-8 mr-2 mt-1 mb-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== initialValue) onSave(text); }}
        placeholder="Optional: Add context or details about how this aim will be pursued..."
        className="text-xs min-h-[60px] resize-none"
      />
      {description && (
        <p className="text-[10px] text-muted-foreground mt-1 italic">{description}</p>
      )}
    </div>
  );
}

// === AIMS EXPLORER PANEL (Step 2 redesign — ranked selections + visual catalog) ===

// Color palette for outcome groups
const GROUP_COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  content_career: { bg: "bg-blue-50", border: "border-blue-200", badge: "bg-blue-100 text-blue-700", text: "text-blue-700" },
  cross_cutting: { bg: "bg-emerald-50", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-700" },
  postsecondary_assets: { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  postsecondary_transition: { bg: "bg-rose-50", border: "border-rose-200", badge: "bg-rose-100 text-rose-700", text: "text-rose-700" },
};
const DEFAULT_GROUP_COLOR = { bg: "bg-gray-50", border: "border-gray-200", badge: "bg-gray-100 text-gray-700", text: "text-gray-700" };

// Color palette for practice groups (Step 3)
const PRACTICE_GROUP_COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  academic_integration: { bg: "bg-teal-50", border: "border-teal-200", badge: "bg-teal-100 text-teal-700", text: "text-teal-700" },
  advising: { bg: "bg-indigo-50", border: "border-indigo-200", badge: "bg-indigo-100 text-indigo-700", text: "text-indigo-700" },
  work_based_learning: { bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-700", text: "text-orange-700" },
  career_college_prep: { bg: "bg-pink-50", border: "border-pink-200", badge: "bg-pink-100 text-pink-700", text: "text-pink-700" },
};

/** Default importance for newly added items */
const DEFAULT_IMPORTANCE: TaxonomySelection["importance"] = "important";
const MAX_TOP_PRIORITIES = 2;

/** Tier ordering for sorting: top priority first, then important, then nice to have */
const TIER_ORDER: Record<string, number> = { most_important: 0, important: 1, nice_to_have: 2 };

/** Sort selections by tier, preserving within-tier order */
function sortByTier(selections: TaxonomySelection[]): TaxonomySelection[] {
  return [...selections].sort((a, b) => (TIER_ORDER[a.importance] ?? 1) - (TIER_ORDER[b.importance] ?? 1));
}

function importanceLabel(imp: string) {
  if (imp === "most_important") return "Top Priority";
  if (imp === "important") return "Important";
  return "Nice to Have";
}

function importanceBadgeColor(imp: string) {
  if (imp === "most_important") return "bg-primary/15 text-primary border-primary/30";
  if (imp === "important") return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-gray-100 text-gray-500 border-gray-200";
}

interface AimsExplorerPanelProps {
  sessionId: string;
  stepData: Record<string, any>;
  pendingSuggestions: { outcomes: number[]; leaps: number[]; taxonomyIds: number[] } | null;
  onSuggestionsApplied: () => void;
}

function AimsExplorerPanel({ sessionId, stepData, pendingSuggestions, onSuggestionsApplied }: AimsExplorerPanelProps) {
  const { data: taxonomyItems = [], isLoading } = useTaxonomyItems(2);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedDetails, setExpandedDetails] = useState<Record<number, boolean>>({});

  const currentData = stepData["2"] || {};

  const outcomes = taxonomyItems.filter(t => t.category === "outcome");
  const leaps = taxonomyItems.filter(t => t.category === "leap");

  const selectedOutcomes: TaxonomySelection[] = currentData.selected_outcomes || [];
  const selectedLeaps: TaxonomySelection[] = currentData.selected_leaps || [];

  // Detail notes per item (stored in stepData["2"].selection_details)
  const selectionDetails: Record<number, string> = currentData.selection_details || {};

  const saveToServer = async (patch: Record<string, any>) => {
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then(r => r.json());

      const sd = { ...(currentProgress.stepData || {}) };
      sd["2"] = { ...(sd["2"] || {}), ...patch };

      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: currentProgress.currentStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: sd,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch (err) {
      console.error("Failed to save:", err);
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
  };

  // Apply AI suggestions
  useEffect(() => {
    if (!pendingSuggestions) return;
    let changed = false;
    const newOutcomes = [...selectedOutcomes];
    const newLeaps = [...selectedLeaps];

    for (const id of pendingSuggestions.outcomes) {
      if (!newOutcomes.find(s => s.id === id)) {
        const item = outcomes.find(t => t.id === id);
        if (item) { newOutcomes.push({ id: item.id, name: item.name, importance: DEFAULT_IMPORTANCE }); changed = true; }
      }
    }
    for (const id of pendingSuggestions.leaps) {
      if (!newLeaps.find(s => s.id === id)) {
        const item = leaps.find(t => t.id === id);
        if (item) { newLeaps.push({ id: item.id, name: item.name, importance: DEFAULT_IMPORTANCE }); changed = true; }
      }
    }

    if (changed) {
      saveToServer({ selected_outcomes: sortByTier(newOutcomes), selected_leaps: sortByTier(newLeaps) });
      toast({ title: "AI suggestions applied", description: "Items have been added to your list." });
    }
    onSuggestionsApplied();
  }, [pendingSuggestions]);

  const addItem = (item: TaxonomyItem, catKey: "outcome" | "leap") => {
    const current = catKey === "outcome" ? [...selectedOutcomes] : [...selectedLeaps];
    if (current.find(s => s.id === item.id)) return;
    current.push({ id: item.id, name: item.name, importance: DEFAULT_IMPORTANCE });
    saveToServer({ [catKey === "outcome" ? "selected_outcomes" : "selected_leaps"]: sortByTier(current) });
  };

  const removeItem = (itemId: number, catKey: "outcome" | "leap") => {
    const key = catKey === "outcome" ? "selected_outcomes" : "selected_leaps";
    const current = (catKey === "outcome" ? [...selectedOutcomes] : [...selectedLeaps]).filter(s => s.id !== itemId);
    saveToServer({ [key]: current });
  };

  const moveItem = (itemId: number, catKey: "outcome" | "leap", direction: "up" | "down") => {
    const key = catKey === "outcome" ? "selected_outcomes" : "selected_leaps";
    const current = catKey === "outcome" ? [...selectedOutcomes] : [...selectedLeaps];
    const idx = current.findIndex(s => s.id === itemId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= current.length) return;
    // Only allow reorder within the same tier
    if (current[idx].importance !== current[newIdx].importance) return;
    [current[idx], current[newIdx]] = [current[newIdx], current[idx]];
    saveToServer({ [key]: current });
  };

  const setTier = (itemId: number, catKey: "outcome" | "leap", tier: TaxonomySelection["importance"]) => {
    const key = catKey === "outcome" ? "selected_outcomes" : "selected_leaps";
    const current = catKey === "outcome" ? [...selectedOutcomes] : [...selectedLeaps];
    const item = current.find(s => s.id === itemId);
    if (!item) return;
    if (tier === "most_important") {
      const topCount = current.filter(s => s.importance === "most_important" && s.id !== itemId).length;
      if (topCount >= MAX_TOP_PRIORITIES) {
        toast({ title: "Limit reached", description: `You can have at most ${MAX_TOP_PRIORITIES} top priorities.` });
        return;
      }
    }
    item.importance = tier;
    saveToServer({ [key]: sortByTier(current) });
  };

  const saveDetail = (itemId: number, text: string) => {
    const updated = { ...selectionDetails, [itemId]: text };
    saveToServer({ selection_details: updated });
  };

  const toggleDetail = (itemId: number) => {
    setExpandedDetails(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading aims taxonomy...</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render a single ranked item ──
  const renderRankedItem = (sel: TaxonomySelection, idx: number, total: number, catKey: "outcome" | "leap") => {
    const item = taxonomyItems.find(t => t.id === sel.id);
    const imp = sel.importance || "important";
    const isExpanded = expandedDetails[sel.id] || false;
    const detailText = selectionDetails[sel.id] || "";
    // Can this item move up/down? Only within same tier.
    const canMoveUp = idx > 0 && (catKey === "outcome" ? selectedOutcomes : selectedLeaps)[idx - 1]?.importance === imp;
    const canMoveDown = idx < total - 1 && (catKey === "outcome" ? selectedOutcomes : selectedLeaps)[idx + 1]?.importance === imp;

    return (
      <div key={sel.id} className="group">
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
          imp === "most_important" ? "border-primary/40 bg-primary/5" :
          imp === "important" ? "border-blue-200 bg-blue-50/50" :
          "border-gray-200 bg-gray-50/50"
        )}>
          {/* Rank number */}
          <span className={cn(
            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
            imp === "most_important" ? "bg-primary text-white" :
            imp === "important" ? "bg-blue-500 text-white" :
            "bg-gray-300 text-gray-600"
          )}>
            {idx + 1}
          </span>

          {/* Name + group pill */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate block">{sel.name}</span>
            {item?.group && (
              <span className="text-[9px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground">
                {OUTCOME_GROUPS.find(g => g.key === item.group)?.label || item.group}
              </span>
            )}
          </div>

          {/* Importance dropdown */}
          <Select
            value={imp}
            onValueChange={(v) => setTier(sel.id, catKey, v as TaxonomySelection["importance"])}
          >
            <SelectTrigger className={cn("h-6 w-auto min-w-[110px] text-[10px] px-2 py-0 border shrink-0", importanceBadgeColor(imp))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most_important" className="text-xs">Top Priority</SelectItem>
              <SelectItem value="important" className="text-xs">Important</SelectItem>
              <SelectItem value="nice_to_have" className="text-xs">Nice to Have</SelectItem>
            </SelectContent>
          </Select>

          {/* Expand detail */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
            onClick={() => toggleDetail(sel.id)}
            title="Add details"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>

          {/* Reorder within tier */}
          <div className="flex flex-col shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-5 p-0"
              disabled={!canMoveUp}
              onClick={() => moveItem(sel.id, catKey, "up")}
            >
              <ArrowUp className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-5 p-0"
              disabled={!canMoveDown}
              onClick={() => moveItem(sel.id, catKey, "down")}
            >
              <ArrowDown className="w-3 h-3" />
            </Button>
          </div>

          {/* Remove */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(sel.id, catKey)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Expandable detail textarea */}
        {isExpanded && (
          <DetailTextarea
            key={sel.id}
            initialValue={detailText}
            onSave={(text) => saveDetail(sel.id, text)}
            description={item?.description}
          />
        )}
      </div>
    );
  };

  // ── Render a catalog item (unselected) ──
  const renderCatalogItem = (item: TaxonomyItem, catKey: "outcome" | "leap", isSelected: boolean) => {
    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
              isSelected
                ? "border-primary/30 bg-primary/5 opacity-50 cursor-default"
                : "border-border bg-background hover:shadow-sm hover:-translate-y-0.5 hover:border-primary/40"
            )}
            onClick={() => !isSelected && addItem(item, catKey)}
          >
            {!isSelected && (
              <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            {isSelected && (
              <Check className="w-3.5 h-3.5 text-primary shrink-0" />
            )}
            <span className={cn(
              "text-xs font-medium flex-1",
              isSelected ? "text-muted-foreground line-through" : "text-foreground"
            )}>
              {item.name}
            </span>
            {catKey === "leap" && (item as any).detailContent && (
              <Link
                href={`/leaps/${item.id}`}
                onClick={e => e.stopPropagation()}
                className="text-[10px] text-primary hover:underline shrink-0"
              >
                Learn more
              </Link>
            )}
          </div>
        </TooltipTrigger>
        {item.description && (
          <TooltipContent side="right" className="max-w-xs text-xs">
            {item.description}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  // ── Render a section (Outcomes or LEAPs) ──
  const renderSection = (
    title: string,
    catKey: "outcome" | "leap",
    items: TaxonomyItem[],
    selections: TaxonomySelection[],
    summaryKey: string,
    summaryColor: string,
    groups?: readonly { key: string; label: string }[],
  ) => {
    const selectedIds = new Set(selections.map(s => s.id));
    const unselectedItems = items.filter(t => !selectedIds.has(t.id));

    return (
      <div className="space-y-4">
        {/* ── Ranked selections ── */}
        {selections.length > 0 && (
          <Card className="border-primary/20 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">Your Ranked {title}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{selections.length} selected</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Click the badge to change priority tier (max {MAX_TOP_PRIORITIES} top priorities). Arrows reorder within a tier.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {selections.map((sel, idx) => renderRankedItem(sel, idx, selections.length, catKey))}
            </CardContent>
          </Card>
        )}

        {selections.length === 0 && (
          <div className="flex items-center justify-center py-6 px-4 border border-dashed rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground text-center">
              No {title.toLowerCase()} selected yet. Chat with the AI advisor or click items below to add them.
            </p>
          </div>
        )}

        {/* ── Catalog of all items ── */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                Browse All {title}
              </CardTitle>
              <span className="text-[10px] text-muted-foreground">Click to add</span>
            </div>
          </CardHeader>
          <CardContent>
            {groups ? (
              <div className="space-y-4">
                {groups.map(group => {
                  const groupItems = items.filter(t => t.group === group.key);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={group.key}>
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="text-xs font-semibold text-muted-foreground">{group.label}</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {groupItems.map(item => renderCatalogItem(item, catKey, selectedIds.has(item.id)))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {items.map(item => renderCatalogItem(item, catKey, selectedIds.has(item.id)))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Section header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-display font-bold text-foreground">Aims for Learners</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            The AI auto-selects from your chat and uploads. Reorder to set priority. Use the detail icon to add context.
          </p>
        </div>

        {/* ── Tabs: Outcomes | LEAPs ── */}
        <Tabs defaultValue="outcomes" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="outcomes" className="text-sm">
              Outcomes
              {selectedOutcomes.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 h-4">{selectedOutcomes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="leaps" className="text-sm">
              LEAPs
              {selectedLeaps.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 h-4">{selectedLeaps.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outcomes" className="mt-4">
            {renderSection(
              "Outcomes",
              "outcome",
              outcomes,
              selectedOutcomes,
              "outcomes_summary",
              "bg-primary/5 border-primary/15",
              OUTCOME_GROUPS,
            )}
          </TabsContent>

          <TabsContent value="leaps" className="mt-4">
            {renderSection(
              "LEAPs",
              "leap",
              leaps,
              selectedLeaps,
              "leaps_summary",
              "bg-violet-500/5 border-violet-500/15",
            )}
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// === PRACTICES EXPLORER PANEL (Step 3 redesign — same ranked + catalog pattern as Step 2) ===

interface PracticesExplorerPanelProps {
  sessionId: string;
  stepData: Record<string, any>;
  pendingSuggestions: { outcomes: number[]; leaps: number[]; taxonomyIds: number[] } | null;
  onSuggestionsApplied: () => void;
}

function PracticesExplorerPanel({ sessionId, stepData, pendingSuggestions, onSuggestionsApplied }: PracticesExplorerPanelProps) {
  const { data: taxonomyItems = [], isLoading } = useTaxonomyItems(3);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expandedDetails, setExpandedDetails] = useState<Record<number, boolean>>({});

  const currentData = stepData["3"] || {};

  // All practices, split by group
  const allPractices = taxonomyItems.filter(t => t.category === "practice");
  const practicesByGroup: Record<string, TaxonomyItem[]> = {};
  for (const p of allPractices) {
    const gk = p.group || "_ungrouped";
    if (!practicesByGroup[gk]) practicesByGroup[gk] = [];
    practicesByGroup[gk].push(p);
  }

  const selectedPractices: TaxonomySelection[] = currentData.selected_practices || [];
  const selectionDetails: Record<number, string> = currentData.selection_details || {};

  const saveToServer = async (patch: Record<string, any>) => {
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then(r => r.json());

      const sd = { ...(currentProgress.stepData || {}) };
      sd["3"] = { ...(sd["3"] || {}), ...patch };

      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: currentProgress.currentStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: sd,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch (err) {
      console.error("Failed to save:", err);
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    }
  };

  // Apply AI suggestions (taxonomyIds from chat)
  useEffect(() => {
    if (!pendingSuggestions) return;
    let changed = false;
    const newPractices = [...selectedPractices];

    for (const id of pendingSuggestions.taxonomyIds) {
      const item = allPractices.find(t => t.id === id);
      if (item && !newPractices.find(s => s.id === id)) {
        newPractices.push({ id: item.id, name: item.name, importance: DEFAULT_IMPORTANCE });
        changed = true;
      }
    }

    if (changed) {
      saveToServer({ selected_practices: sortByTier(newPractices) });
      toast({ title: "AI suggestions applied", description: "Practices have been added to your list." });
    }
    onSuggestionsApplied();
  }, [pendingSuggestions]);

  const addItem = (item: TaxonomyItem) => {
    const current = [...selectedPractices];
    if (current.find(s => s.id === item.id)) return;
    current.push({ id: item.id, name: item.name, importance: DEFAULT_IMPORTANCE });
    saveToServer({ selected_practices: sortByTier(current) });
  };

  const removeItem = (itemId: number) => {
    const current = selectedPractices.filter(s => s.id !== itemId);
    saveToServer({ selected_practices: current });
  };

  const moveItem = (itemId: number, direction: "up" | "down") => {
    const current = [...selectedPractices];
    const idx = current.findIndex(s => s.id === itemId);
    if (idx < 0) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= current.length) return;
    if (current[idx].importance !== current[newIdx].importance) return;
    [current[idx], current[newIdx]] = [current[newIdx], current[idx]];
    saveToServer({ selected_practices: current });
  };

  const setTier = (itemId: number, tier: TaxonomySelection["importance"]) => {
    const current = [...selectedPractices];
    const item = current.find(s => s.id === itemId);
    if (!item) return;
    if (tier === "most_important") {
      const topCount = current.filter(s => s.importance === "most_important" && s.id !== itemId).length;
      if (topCount >= MAX_TOP_PRIORITIES) {
        toast({ title: "Limit reached", description: `You can have at most ${MAX_TOP_PRIORITIES} top priorities.` });
        return;
      }
    }
    item.importance = tier;
    saveToServer({ selected_practices: sortByTier(current) });
  };

  const saveDetail = (itemId: number, text: string) => {
    const updated = { ...selectionDetails, [itemId]: text };
    saveToServer({ selection_details: updated });
  };

  const toggleDetail = (itemId: number) => {
    setExpandedDetails(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading practices taxonomy...</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render a single ranked item ──
  const renderRankedItem = (sel: TaxonomySelection, idx: number, total: number) => {
    const item = allPractices.find(t => t.id === sel.id);
    const imp = sel.importance || "important";
    const isExpanded = expandedDetails[sel.id] || false;
    const detailText = selectionDetails[sel.id] || "";
    const canMoveUp = idx > 0 && selectedPractices[idx - 1]?.importance === imp;
    const canMoveDown = idx < total - 1 && selectedPractices[idx + 1]?.importance === imp;

    return (
      <div key={sel.id} className="group">
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
          imp === "most_important" ? "border-primary/40 bg-primary/5" :
          imp === "important" ? "border-blue-200 bg-blue-50/50" :
          "border-gray-200 bg-gray-50/50"
        )}>
          {/* Rank number */}
          <span className={cn(
            "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0",
            imp === "most_important" ? "bg-primary text-white" :
            imp === "important" ? "bg-blue-500 text-white" :
            "bg-gray-300 text-gray-600"
          )}>
            {idx + 1}
          </span>

          {/* Name + group pill */}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground truncate block">{sel.name}</span>
            {item?.group && (
              <span className="text-[9px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground">
                {PRACTICE_GROUPS.find(g => g.key === item.group)?.label || item.group}
              </span>
            )}
          </div>

          {/* Importance dropdown */}
          <Select
            value={imp}
            onValueChange={(v) => setTier(sel.id, v as TaxonomySelection["importance"])}
          >
            <SelectTrigger className={cn("h-6 w-auto min-w-[110px] text-[10px] px-2 py-0 border shrink-0", importanceBadgeColor(imp))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most_important" className="text-xs">Top Priority</SelectItem>
              <SelectItem value="important" className="text-xs">Important</SelectItem>
              <SelectItem value="nice_to_have" className="text-xs">Nice to Have</SelectItem>
            </SelectContent>
          </Select>

          {/* Expand detail */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
            onClick={() => toggleDetail(sel.id)}
            title="Add details"
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </Button>

          {/* Reorder within tier */}
          <div className="flex flex-col shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-5 p-0"
              disabled={!canMoveUp}
              onClick={() => moveItem(sel.id, "up")}
            >
              <ArrowUp className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-5 p-0"
              disabled={!canMoveDown}
              onClick={() => moveItem(sel.id, "down")}
            >
              <ArrowDown className="w-3 h-3" />
            </Button>
          </div>

          {/* Remove */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => removeItem(sel.id)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Expandable detail textarea */}
        {isExpanded && (
          <DetailTextarea
            key={sel.id}
            initialValue={detailText}
            onSave={(text) => saveDetail(sel.id, text)}
            description={item?.description}
          />
        )}
      </div>
    );
  };

  // ── Render a catalog item ──
  const renderCatalogItem = (item: TaxonomyItem, isSelected: boolean) => {
    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "relative flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all",
              isSelected
                ? "border-primary/30 bg-primary/5 opacity-50 cursor-default"
                : "border-border bg-background hover:shadow-sm hover:-translate-y-0.5 hover:border-primary/40"
            )}
            onClick={() => !isSelected && addItem(item)}
          >
            {!isSelected && <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
            <span className={cn(
              "text-xs font-medium flex-1",
              isSelected ? "text-muted-foreground line-through" : "text-foreground"
            )}>
              {item.name}
            </span>
          </div>
        </TooltipTrigger>
        {(item.description || item.examples) && (
          <TooltipContent side="right" className="max-w-xs text-xs space-y-1">
            {item.description && <p>{item.description}</p>}
            {item.examples && <p className="italic text-muted-foreground">e.g. {item.examples}</p>}
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  const selectedIds = new Set(selectedPractices.map(s => s.id));

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Section header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-display font-bold text-foreground">Learning Experience & Practices</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Select and rank practices that describe the intended learning experience. Reorder to set priority. Use the detail icon to add context.
          </p>
        </div>

        {/* ── Ranked selections (single list across all groups) ── */}
        {selectedPractices.length > 0 && (
          <Card className="border-primary/20 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">Your Ranked Practices</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{selectedPractices.length} selected</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Click the badge to change priority tier (max {MAX_TOP_PRIORITIES} top priorities). Arrows reorder within a tier.
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {selectedPractices.map((sel, idx) => renderRankedItem(sel, idx, selectedPractices.length))}
            </CardContent>
          </Card>
        )}

        {selectedPractices.length === 0 && (
          <div className="flex items-center justify-center py-6 px-4 border border-dashed rounded-lg bg-muted/30">
            <p className="text-sm text-muted-foreground text-center">
              No practices selected yet. Chat with the AI advisor or click items below to add them.
            </p>
          </div>
        )}

        {/* ── Catalog grouped by practice category ── */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                Browse All Practices
              </CardTitle>
              <span className="text-[10px] text-muted-foreground">Click to add</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {PRACTICE_GROUPS.map(group => {
                const groupItems = allPractices.filter(t => t.group === group.key);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group.key}>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-xs font-semibold text-muted-foreground">{group.label}</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {groupItems.map(item => renderCatalogItem(item, selectedIds.has(item.id)))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// === TAXONOMY SELECTION PANEL (generic for any step with structured taxonomy — kept for rollback) ===

interface TaxonomySelectionPanelProps {
  sessionId: string;
  stepNumber: number;
  stepData: Record<string, any>;
  config: StepTaxonomyConfig;
  pendingSuggestions: { outcomes: number[]; leaps: number[]; taxonomyIds: number[] } | null;
  onSuggestionsApplied: () => void;
}

function TaxonomySelectionPanel({ sessionId, stepNumber, stepData, config, pendingSuggestions, onSuggestionsApplied }: TaxonomySelectionPanelProps) {
  const { data: taxonomyItems = [], isLoading } = useTaxonomyItems(stepNumber);
  const qc = useQueryClient();
  const { toast } = useToast();

  // Fetch KB entries for this step (to show downloadable reference docs)
  const { data: kbEntries = [] } = useQuery<KnowledgeBaseEntry[]>({
    queryKey: ["/api/admin/knowledge-base", stepNumber],
    queryFn: async () => {
      const res = await fetch(`/api/admin/knowledge-base?stepNumber=${stepNumber}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });
  // KB entries with files — show all, but only those with fileMimeType are downloadable
  const referenceKbEntries = kbEntries.filter((e) => e.fileName);
  const downloadableKbEntries = referenceKbEntries; // show all with fileName; download link works only if fileData exists

  // Custom group labels (editable in admin)
  const { data: outcomeLabels = [] } = useQuery<{ groupKey: string; label: string }[]>({
    queryKey: [api.admin.getTaxonomyGroupLabels.path, "outcome"],
    queryFn: async () => {
      const url = buildUrl(api.admin.getTaxonomyGroupLabels.path, { category: "outcome" });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });
  const { data: practiceLabels = [] } = useQuery<{ groupKey: string; label: string }[]>({
    queryKey: [api.admin.getTaxonomyGroupLabels.path, "practice"],
    queryFn: async () => {
      const url = buildUrl(api.admin.getTaxonomyGroupLabels.path, { category: "practice" });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });
  const labelByKey: Record<string, string> = {
    ...Object.fromEntries(outcomeLabels.map((l) => [l.groupKey, l.label])),
    ...Object.fromEntries(practiceLabels.map((l) => [l.groupKey, l.label])),
  };
  const getGroupLabel = (groups: readonly { key: string; label: string }[], key: string) =>
    labelByKey[key] ?? groups.find((g) => g.key === key)?.label ?? key;

  const currentData = stepData[String(stepNumber)] || {};

  // Build selections map by category key (e.g., "outcome" -> selected_outcomes, "practice" -> selected_practices)
  const getSelectionsKey = (catKey: string) => `selected_${catKey}s`;
  const getSelections = (catKey: string): TaxonomySelection[] =>
    currentData[getSelectionsKey(catKey)] || [];

  // Items by category
  const itemsByCategory = (catKey: string) => taxonomyItems.filter((t) => t.category === catKey);

  // Apply AI suggestions when they arrive
  useEffect(() => {
    if (!pendingSuggestions) return;

    const patch: Record<string, TaxonomySelection[]> = {};
    let changed = false;

    for (const catConfig of config.categories) {
      const catKey = catConfig.key;
      const current = [...getSelections(catKey)];
      const items = itemsByCategory(catKey);

      // Determine which IDs apply to this category
      let suggestedIds: number[] = [];
      if (stepNumber === 2) {
        // Step 2 uses legacy suggested_outcomes / suggested_leaps
        if (catKey === "outcome") suggestedIds = pendingSuggestions.outcomes;
        else if (catKey === "leap") suggestedIds = pendingSuggestions.leaps;
      } else {
        // Other steps use generic suggested_taxonomy_ids — filter to selectable items in this category
        // Level 1 items (no parent, but have children) are headers and NOT selectable
        const parentIds = new Set(items.filter((t) => t.parentId).map((t) => t.parentId));
        const selectableIds = new Set(
          items.filter((t) => t.parentId || !parentIds.has(t.id)).map((t) => t.id)
        );
        suggestedIds = pendingSuggestions.taxonomyIds.filter((id) => selectableIds.has(id));
      }

      for (const id of suggestedIds) {
        if (!current.find((s) => s.id === id)) {
          const item = items.find((t) => t.id === id);
          if (item) {
            current.push({ id: item.id, name: item.name, importance: "important" });
            changed = true;
          }
        }
      }
      patch[getSelectionsKey(catKey)] = current;
    }

    if (changed) {
      saveSelectionsGeneric(patch);
      toast({
        title: "AI suggestions applied",
        description: "Review the auto-selected items and adjust importance levels as needed.",
      });
    }

    onSuggestionsApplied();
  }, [pendingSuggestions]);

  const saveSelectionsGeneric = async (patch: Record<string, TaxonomySelection[]>) => {
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then((r) => r.json());

      const currentStepData = { ...(currentProgress.stepData || {}) };
      currentStepData[String(stepNumber)] = {
        ...(currentStepData[String(stepNumber)] || {}),
        ...patch,
      };

      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: currentProgress.currentStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: currentStepData,
        }),
        credentials: "include",
      });

      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch (err) {
      console.error("Failed to save selections:", err);
      toast({ title: "Error", description: "Failed to save selections.", variant: "destructive" });
    }
  };

  const toggleSelection = (item: TaxonomyItem, catKey: string) => {
    const current = [...getSelections(catKey)];
    const existingIdx = current.findIndex((s) => s.id === item.id);

    if (existingIdx >= 0) {
      current.splice(existingIdx, 1);
    } else {
      current.push({ id: item.id, name: item.name, importance: "important" });
    }

    saveSelectionsGeneric({ [getSelectionsKey(catKey)]: current });
  };

  const updateImportance = (itemId: number, catKey: string, importance: TaxonomySelection["importance"]) => {
    const current = [...getSelections(catKey)];
    const idx = current.findIndex((s) => s.id === itemId);
    if (idx >= 0) {
      current[idx] = { ...current[idx], importance };
      saveSelectionsGeneric({ [getSelectionsKey(catKey)]: current });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading taxonomy items...</p>
        </CardContent>
      </Card>
    );
  }

  if (taxonomyItems.length === 0) {
    const Icon = config.icon;
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Icon className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground mb-1">No Taxonomy Items Configured</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              An admin needs to add taxonomy items for this step first. Go to Settings to configure them, or upload knowledge base documents to auto-extract items.
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/admin/settings">
                <Settings className="w-4 h-4 mr-2" /> Go to Settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const renderCompactItem = (
    item: TaxonomyItem,
    selections: TaxonomySelection[],
    catKey: string,
  ) => {
    const selection = selections.find((s) => s.id === item.id);
    const isSelected = !!selection;

    const itemContent = (
      <div
        key={item.id}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer",
          isSelected
            ? "border-primary/30 bg-primary/5"
            : "border-border/40 bg-white hover:border-border hover:bg-muted/30"
        )}
        onClick={() => toggleSelection(item, catKey)}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => toggleSelection(item, catKey)}
          className="h-3.5 w-3.5"
          data-testid={`checkbox-taxonomy-${item.id}`}
        />
        <span className={cn("text-xs font-medium select-none flex-1", isSelected && "text-primary")}>
          {item.name}
        </span>
        {catKey === "leap" && (item as any).detailContent && (
          <Link
            href={`/leaps/${item.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            Learn more
          </Link>
        )}
        {catKey === "practice" && (item.description || item.examples) && (
          <Link
            href={`/practices/${item.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] text-primary hover:underline shrink-0"
          >
            Learn more
          </Link>
        )}
        {isSelected && (
          <Select
            value={selection!.importance}
            onValueChange={(val) => {
              updateImportance(item.id, catKey, val as TaxonomySelection["importance"]);
            }}
          >
            <SelectTrigger
              className="h-5 w-[100px] text-[10px] ml-auto border-0 bg-transparent p-0 px-1 shadow-none focus:ring-0"
              onClick={(e) => e.stopPropagation()}
              data-testid={`select-importance-${item.id}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="most_important" className="text-xs">Most Important</SelectItem>
              <SelectItem value="important" className="text-xs">Important</SelectItem>
              <SelectItem value="nice_to_have" className="text-xs">Nice to Have</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
    );

    const hasTooltip = item.description || (item as any).examples;
    const tooltipBody = [
      item.description,
      (item as any).examples && `Examples: ${(item as any).examples}`,
    ].filter(Boolean).join("\n\n");

    if (hasTooltip) {
      return (
        <Tooltip key={item.id}>
          <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-sm text-xs whitespace-pre-wrap">
            {tooltipBody}
          </TooltipContent>
        </Tooltip>
      );
    }

    return itemContent;
  };

  const Icon = config.icon;

  return (
    <TooltipProvider delayDuration={300}>

      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-base font-display font-bold text-foreground">{config.title}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {config.description}
      </p>

      {/* Each category gets its own card */}
      {config.categories.map((catConfig) => {
        const catKey = catConfig.key;
        const items = itemsByCategory(catKey);
        const selections = getSelections(catKey);

        if (items.length === 0) return null;

        // For grouped categories (outcomes, practices), group by item.group field
        const isGrouped = catConfig.grouped && catConfig.groups;
        const groups = catConfig.groups || OUTCOME_GROUPS;
        const groupedItems = isGrouped
          ? groups.map((g) => ({
              ...g,
              items: items.filter((item) => item.group === g.key),
            })).filter((g) => g.items.length > 0)
          : null;

        return (
          <Card key={catKey} className={cn("border", catConfig.summaryColor ? catConfig.summaryColor.replace("bg-", "border-").split(" ")[0] : "")}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold">{catConfig.label}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {selections.length} selected
                </Badge>
              </div>
              {/* Editable summary */}
              {catConfig.summaryKey && (
                <EditableSummary
                  sessionId={sessionId}
                  stepNumber={stepNumber}
                  fieldKey={catConfig.summaryKey}
                  label={`${catConfig.label} Overview`}
                  value={currentData[catConfig.summaryKey] || ""}
                  colorClass={catConfig.summaryColor || "bg-muted/50 border-border"}
                />
              )}
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Grouped rendering (Step 2 outcomes, Step 3 practices) */}
              {groupedItems ? (
                groupedItems.map((group) => (
                  <div key={group.key} className="space-y-1">
                    <h4 className="text-xs font-semibold text-foreground pl-1">{getGroupLabel(groups, group.key)}</h4>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-1">
                      {group.items.map((item) => renderCompactItem(item, selections, catKey))}
                    </div>
                  </div>
                ))
              ) : (() => {
                // Hierarchical rendering: Level 1 = headers (no parent), Level 2/3 = selectable
                const rootItems = items.filter((i) => !i.parentId);
                const childrenOf = (parentId: number) => items.filter((i) => i.parentId === parentId);
                const hasChildren = rootItems.some((r) => childrenOf(r.id).length > 0);

                if (!hasChildren) {
                  // Flat list — no hierarchy
                  return (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-1">
                      {items.map((item) => renderCompactItem(item, selections, catKey))}
                    </div>
                  );
                }

                // Tree rendering
                return (
                  <div className="space-y-3">
                    {rootItems.map((l1) => {
                      const l2Items = childrenOf(l1.id);
                      return (
                        <div key={l1.id} className="space-y-1">
                          <h4 className="text-xs font-semibold text-foreground pl-1">{l1.name}</h4>
                          {l1.description && (
                            <p className="text-[10px] text-muted-foreground pl-1 -mt-0.5">{l1.description}</p>
                          )}
                          <div className="space-y-0.5">
                            {l2Items.map((l2) => {
                              const l3Items = childrenOf(l2.id);
                              return (
                                <div key={l2.id}>
                                  {renderCompactItem(l2, selections, catKey)}
                                  {l3Items.length > 0 && (
                                    <div className="ml-6 mt-0.5 space-y-0.5">
                                      {l3Items.map((l3) => renderCompactItem(l3, selections, catKey))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        );
      })}
    </TooltipProvider>
  );
}

interface StepDocumentsPanelProps {
  sessionId: string;
  stepNumber: number;
}

function StepDocumentsPanel({ sessionId, stepNumber }: StepDocumentsPanelProps) {
  const { data: docs = [], refetch } = useStepDocuments(sessionId, stepNumber);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const url = `/api/sessions/${sessionId}/workflow/documents/${stepNumber}/upload`;
      const res = await fetch(url, { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Document uploaded", description: "The document has been added to this step." });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Failed to upload document. Please try again.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: number) => {
      const url = `/api/sessions/${sessionId}/workflow/documents/${docId}`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => refetch(),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = "";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Uploaded Documents
          </CardTitle>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              accept=".txt,.csv,.xlsx,.xls,.md,.json,.pdf,.doc,.docx,.pptx,.ppt"
              data-testid="input-file-upload"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              data-testid="button-upload-document"
            >
              {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Document
            </Button>
          </div>
        </div>
      </CardHeader>
      {docs.length > 0 && (
        <CardContent>
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-4 p-2 rounded-md bg-muted/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">{doc.fileName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(doc.id)}
                  className="shrink-0"
                  data-testid={`button-delete-doc-${doc.id}`}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared helper: save a patch to a specific step's data
// ---------------------------------------------------------------------------
function useStepDataSaver(sessionId: string, stepNumber: number) {
  const qc = useQueryClient();
  return useCallback(async (patch: Record<string, any>) => {
    try {
      const currentProgress = await fetch(
        buildUrl(api.workflow.getProgress.path, { sessionId }),
        { credentials: "include" },
      ).then((r) => r.json());
      const currentStepData = { ...(currentProgress.stepData || {}) };
      currentStepData[String(stepNumber)] = {
        ...(currentStepData[String(stepNumber)] || {}),
        ...patch,
      };
      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: currentProgress.currentStep,
          stepsCompleted: currentProgress.stepsCompleted,
          stepData: currentStepData,
        }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch (err) {
      console.error("Failed to save step data:", err);
    }
  }, [sessionId, stepNumber, qc]);
}

// ---------------------------------------------------------------------------
// Step 1 — School Context Panel
// ---------------------------------------------------------------------------
const STEP1_TEXT_FIELDS = [
  { key: "school_name", label: "School Name" },
  { key: "district", label: "District" },
  { key: "state", label: "State" },
];

const GRADE_BAND_OPTIONS = [
  { value: "K-5", label: "Elementary School (K-5)" },
  { value: "6-8", label: "Middle School (6-8)" },
  { value: "9-12", label: "High School (9-12)" },
  { value: "Post-secondary", label: "Post-secondary" },
];

function SchoolContextPanel({ sessionId, stepData }: { sessionId: string; stepData: Record<string, any> }) {
  const data = stepData["1"] || {};
  const save = useStepDataSaver(sessionId, 1);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [localBands, setLocalBands] = useState<string[]>([]);

  // Sync from server data when it changes
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of STEP1_TEXT_FIELDS) {
      next[f.key] = data[f.key] ?? "";
    }
    next.context = data.context ?? "";
    setLocal(next);
    // Resolve grade_bands (new) or grade_band (legacy)
    const bands: string[] = Array.isArray(data.grade_bands)
      ? data.grade_bands
      : data.grade_band
        ? [data.grade_band].filter((b: string) => GRADE_BAND_OPTIONS.some(o => o.value === b))
        : [];
    setLocalBands(bands);
  }, [JSON.stringify(data)]);

  const handleBlur = (key: string) => {
    if ((local[key] ?? "") !== (data[key] ?? "")) {
      save({ [key]: local[key] });
    }
  };

  const handleBandToggle = (value: string) => {
    const next = localBands.includes(value)
      ? localBands.filter((b) => b !== value)
      : [...localBands, value];
    setLocalBands(next);
    save({ grade_bands: next });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <School className="w-4 h-4 text-primary" />
          School Context
        </CardTitle>
        <p className="text-xs text-muted-foreground">These fields are populated by the AI chat and can be edited directly.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {STEP1_TEXT_FIELDS.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
              <Input
                value={local[f.key] ?? ""}
                onChange={(e) => setLocal(prev => ({ ...prev, [f.key]: e.target.value }))}
                onBlur={() => handleBlur(f.key)}
                placeholder={f.label}
                className="h-8 text-sm"
              />
            </div>
          ))}
          {/* Grade Band multi-select */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Grade Band (select all that apply)</Label>
            <div className="flex flex-wrap gap-2">
              {GRADE_BAND_OPTIONS.map(o => {
                const isSelected = localBands.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => handleBandToggle(o.value)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                      isSelected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:border-primary/50"
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Context textarea */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Context</Label>
          <Textarea
            value={local.context ?? ""}
            onChange={(e) => setLocal(prev => ({ ...prev, context: e.target.value }))}
            onBlur={() => handleBlur("context")}
            placeholder="Community overview, demographics, partnerships, policy considerations..."
            className="text-sm min-h-[80px]"
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — System Elements (legacy panel, kept for backward compat)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Step 4 — System Elements config & questionnaire
// ---------------------------------------------------------------------------

type QuestionType = "choice" | "number" | "dollar" | "conditional_dollar";

interface QuestionOption { value: string; label: string; }

interface QuestionConfig {
  key: string;
  text: string;
  type: QuestionType;
  options?: QuestionOption[];
  conditionalKey?: string; // for conditional_dollar: stores the amount
  hint?: string;
  multiSelect?: boolean; // allow multiple selections (stored as comma-separated values)
  detailKey?: string;    // key for an optional follow-up text stored in stepData
  detailTrigger?: string; // answer value that reveals the optional detail textarea
}

interface SystemElementGroup {
  key: string;
  label: string;
  questions: QuestionConfig[];
  contextKey: string;
  contextTitle: string;
  contextPrompts: string[];
}

const SYSTEM_ELEMENT_GROUPS: SystemElementGroup[] = [
  {
    key: "curriculum",
    label: "Curriculum, Instruction & Assessment",
    questions: [],
    contextKey: "curriculum_context",
    contextTitle: "Tell us about your curriculum & assessment context",
    contextPrompts: [
      "Are there any mandated curriculum programs or instructional models you must keep?",
      "Are there assessment structures (grading systems, exams, GPA requirements, etc.) that cannot change?",
      "Is there anything about your instructional approach that would make certain types of models a non-starter?",
    ],
  },
  {
    key: "family",
    label: "Family & Community Partnerships",
    questions: [
      {
        key: "family_schedule_flexible",
        text: "Is your annual schedule (school calendar) flexible?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "A little", label: "A little" },
          { value: "Unknown", label: "Unknown" },
        ],
      },
      {
        key: "family_outreach_staff",
        text: "Do you have staff members capable of outreach?",
        type: "choice",
        options: [
          { value: "Definitely", label: "Definitely" },
          { value: "No", label: "No" },
          { value: "Depends", label: "Depends" },
          { value: "Unknown", label: "Unknown" },
        ],
        detailTrigger: "Depends",
        detailKey: "family_outreach_staff_detail",
      },
      {
        key: "family_restrict_partnerships",
        text: "Do you have any legal or policy-related restrictions on partnerships?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
        detailTrigger: "Yes",
        detailKey: "family_restrict_partnerships_detail",
      },
      {
        key: "family_restrict_data",
        text: "Do you have any legal or policy-related restrictions on data sharing?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
        detailTrigger: "Yes",
        detailKey: "family_restrict_data_detail",
      },
      {
        key: "family_restrict_involvement",
        text: "Do you have any legal or policy-related restrictions on family involvement?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
        detailTrigger: "Yes",
        detailKey: "family_restrict_involvement_detail",
      },
    ],
    contextKey: "family_context",
    contextTitle: "Tell us more about family & community partnerships",
    contextPrompts: [
      "Do you already have partnerships in place?",
      "What family engagement structures do you have?",
    ],
  },
  {
    key: "scheduling",
    label: "Scheduling & Use of Time",
    questions: [
      {
        key: "scheduling_seat_time",
        text: "How rigid is your seat time policy, and is there flexibility to reallocate subject or grade level instructional minutes?",
        type: "choice",
        options: [
          { value: "Must comply with seat time policy strictly", label: "Must comply strictly" },
          { value: "Some flexibility (e.g., district waivers possible)", label: "Some flexibility (e.g., district waivers possible)" },
          { value: "Full flexibility", label: "Full flexibility" },
        ],
      },
      {
        key: "scheduling_flex_blocks",
        text: "Are you able to integrate flex or choice blocks?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
      },
    ],
    contextKey: "scheduling_context",
    contextTitle: "Tell us more about your scheduling & use of time",
    contextPrompts: [],
  },
  {
    key: "technology",
    label: "Technology & Tech Infrastructure",
    questions: [
      {
        key: "technology_device_access",
        text: "What is the highest level of student device access available?",
        type: "choice",
        multiSelect: false,
        options: [
          { value: "1:1", label: "1:1 (every student has a device)" },
          { value: "Shared classroom devices", label: "Shared classroom devices" },
          { value: "Limited access", label: "Limited access" },
          { value: "No reliable device access", label: "No reliable device access" },
        ],
      },
      {
        key: "technology_device_capability",
        text: "What is the highest level of device capability available?",
        type: "choice",
        multiSelect: false,
        options: [
          { value: "High performance devices (e.g., Workstation Laptops, Engineering CAD, Media Production Workstation)", label: "High performance devices" },
          { value: "Standard Laptop", label: "Standard Laptop" },
          { value: "Basic web-based (e.g., Chromebook Class)", label: "Basic web-based (e.g., Chromebook)" },
          { value: "None", label: "None / No devices" },
        ],
      },
      {
        key: "technology_specialized_hardware",
        text: "Do you have access to any specialized hardware (e.g., robotics kits)?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
        ],
      },
    ],
    contextKey: "technology_context",
    contextTitle: "Tell us more about your technology & infrastructure",
    contextPrompts: [],
  },
  {
    key: "adult_roles",
    label: "Adult Roles, Hiring & Development",
    questions: [
      {
        key: "can_commit_pd",
        text: "Can you commit to required professional development for a new model?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
      },
    ],
    contextKey: "adult_roles_context",
    contextTitle: "Tell us more about adult roles & development",
    contextPrompts: [
      "What are your current coaching and feedback structures?",
      "How often do teachers receive feedback on their instruction?",
    ],
  },
  {
    key: "budget",
    label: "Budget & Operations",
    questions: [
      {
        key: "budget_available",
        text: "Do you have budget available for a paid solution?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
      },
      {
        key: "budget_transportation",
        text: "Will the district offer transportation services for off-site learning?",
        type: "choice",
        options: [
          { value: "Yes", label: "Yes" },
          { value: "No", label: "No" },
          { value: "Unknown", label: "Unknown" },
        ],
      },
    ],
    contextKey: "budget_context",
    contextTitle: "Tell us more about your budget & operations",
    contextPrompts: [],
  },
];

// Keep old CONSTRAINT_DOMAINS for backward-compat display in DecisionFramePanel for legacy sessions
const CONSTRAINT_DOMAINS = [
  { key: "constraint_curriculum", label: "Curriculum, Instruction & Assessment" },
  { key: "constraint_community", label: "School Community & Culture" },
  { key: "constraint_staffing", label: "Adult Roles, Hiring & Learning" },
  { key: "constraint_schedule", label: "Schedule & Use of Time" },
  { key: "constraint_family", label: "Family & Community Partnerships" },
  { key: "constraint_technology", label: "Technology & Infrastructure" },
  { key: "constraint_improvement", label: "Continuous Improvement Practices" },
];

interface SystemElementsQuestionnaireProps {
  sessionId: string;
  stepData: Record<string, any>;
  onConfirm: () => void;
}

function SystemElementsQuestionnaire({ sessionId, stepData, onConfirm }: SystemElementsQuestionnaireProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // v2: When user is in Path B, show experience name in context-page headings.
  const isPathB = stepData.designScope === "specific_experience";
  const rawExpNameLocal = (stepData.experience as Record<string, any>)?.name;
  const experienceName: string | null =
    typeof rawExpNameLocal === "string" && rawExpNameLocal.trim() !== "" ? rawExpNameLocal.trim() : null;

  const [groupIdx, setGroupIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [isContext, setIsContext] = useState(SYSTEM_ELEMENT_GROUPS[0].questions.length === 0);
  const [animKey, setAnimKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Local copies of answers and context texts
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [contextTexts, setContextTexts] = useState<Record<string, string>>({});
  const [contextDocs, setContextDocs] = useState<Record<string, { name: string }[]>>({});

  // Once the user has interacted with any answer, stop overwriting answers from server refetches.
  // This prevents the saveToStepData → invalidateQueries → useEffect cycle from reverting
  // in-progress multi-select or other rapid-fire selections.
  const userHasAnswered = useRef(false);

  // Ref always holds the latest answers so multi-select toggles on rapid clicks
  // never base themselves on a stale closure value.
  const latestAnswersRef = useRef<Record<string, string>>({});

  // Recording
  const [activeContextKey, setActiveContextKey] = useState<string>("");
  const activeContextKeyRef = useRef<string>("");
  // "context" = writes to contextTexts, "detail" = writes to answers
  const recordingTargetRef = useRef<"context" | "detail">("context");
  const { recordingState, handleStartRecording: startRecording, handleStopRecording } = useTalkItOut(
    sessionId,
    (text) => {
      if (recordingTargetRef.current === "detail") {
        const key = activeContextKeyRef.current;
        userHasAnswered.current = true;
        setAnswers((prev) => ({
          ...prev,
          [key]: prev[key] ? `${prev[key]}\n\n${text}` : text,
        }));
      } else {
        setContextTexts((prev) => ({
          ...prev,
          [activeContextKeyRef.current]: prev[activeContextKeyRef.current]
            ? `${prev[activeContextKeyRef.current]}\n\n${text}` : text,
        }));
      }
    },
  );

  const handleStartRecording = (contextGroupKey: string) => {
    recordingTargetRef.current = "context";
    activeContextKeyRef.current = contextGroupKey;
    setActiveContextKey(contextGroupKey);
    startRecording();
  };

  const handleStartDetailRecording = (detailKey: string) => {
    recordingTargetRef.current = "detail";
    activeContextKeyRef.current = detailKey;
    setActiveContextKey(detailKey);
    startRecording();
  };

  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [isUploadingDetailDoc, setIsUploadingDetailDoc] = useState(false);
  const detailDocInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleDetailDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, detailKey: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDetailDoc(true);
    try {
      const doc = await uploadDocumentFile(file, sessionId, 4);
      if (doc.fileContent) {
        userHasAnswered.current = true;
        setAnswers((prev) => ({
          ...prev,
          [detailKey]: prev[detailKey]
            ? `${prev[detailKey]}\n\n[From ${file.name}]:\n${doc.fileContent}`
            : `[From ${file.name}]:\n${doc.fileContent}`,
        }));
      }
      toast({ title: "Document added", description: `${file.name} has been added.` });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingDetailDoc(false);
      if (e.target) e.target.value = "";
    }
  };

  // Sync from stepData on mount/update.
  // Once the user has touched any answer, skip the answers sync to prevent server
  // refetches from overwriting in-progress multi-select or rapid-fire selections.
  useEffect(() => {
    const d = stepData["4"] || {};
    const newAnswers: Record<string, string> = {};
    const newContextTexts: Record<string, string> = {};
    for (const g of SYSTEM_ELEMENT_GROUPS) {
      for (const q of g.questions) {
        if (d[q.key] !== undefined) newAnswers[q.key] = d[q.key];
        if (q.conditionalKey && d[q.conditionalKey] !== undefined) newAnswers[q.conditionalKey] = d[q.conditionalKey];
        if (q.detailKey && d[q.detailKey] !== undefined) newAnswers[q.detailKey] = d[q.detailKey];
      }
      if (d[g.contextKey]) newContextTexts[g.key] = d[g.contextKey];
    }
    if (!userHasAnswered.current) {
      const merged = { ...newAnswers };
      latestAnswersRef.current = merged;
      setAnswers((prev) => ({ ...merged, ...prev }));
    }
    setContextTexts((prev) => ({ ...newContextTexts, ...prev }));
  }, [JSON.stringify(stepData["4"])]);

  const currentGroup = SYSTEM_ELEMENT_GROUPS[groupIdx];
  const currentQuestion = !isContext && currentGroup ? currentGroup.questions[questionIdx] : null;

  // ── Persist helpers ─────────────────────────────────────────────────────────

  // silent=true suppresses the error toast (used for intermediate answer saves that auto-fire on click)
  const saveToStepData = async (patch: Record<string, any>, silent = false) => {
    try {
      const prog = await fetch(buildUrl(api.workflow.getProgress.path, { sessionId }), { credentials: "include" }).then((r) => r.json());
      const sd = { ...(prog.stepData || {}) };
      sd["4"] = { ...(sd["4"] || {}), ...patch };
      await fetch(buildUrl(api.workflow.updateProgress.path, { sessionId }), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: prog.currentStep, stepsCompleted: prog.stepsCompleted, stepData: sd }),
        credentials: "include",
      });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    } catch (err) {
      if (!silent) toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
      else console.error("SystemElements silent save failed:", err);
    }
  };

  // ── Navigation ─────────────────────────────────────────────────────────────

  const navigate = (newGroupIdx: number, newQuestionIdx: number, newIsContext: boolean) => {
    setGroupIdx(newGroupIdx);
    setQuestionIdx(newQuestionIdx);
    setIsContext(newIsContext);
    setAnimKey((k) => k + 1);
  };

  const goNext = async () => {
    if (!isContext) {
      // Save current question answer — silent, user already sees it highlighted.
      // All keys are merged into one patch to avoid concurrent fetch-write races.
      if (currentQuestion) {
        const patch: Record<string, any> = {
          [currentQuestion.key]: answers[currentQuestion.key] || "",
        };
        if (currentQuestion.conditionalKey) {
          patch[currentQuestion.conditionalKey] = answers[currentQuestion.conditionalKey] || "";
        }
        if (currentQuestion.detailKey) {
          patch[currentQuestion.detailKey] = answers[currentQuestion.detailKey] || "";
        }
        saveToStepData(patch, true);
      }
      const hasMoreQuestions = questionIdx < currentGroup.questions.length - 1;
      if (hasMoreQuestions) {
        navigate(groupIdx, questionIdx + 1, false);
      } else {
        navigate(groupIdx, questionIdx, true);
      }
    } else {
      // Context text save IS important — show error if it fails
      const isLastGroup = groupIdx === SYSTEM_ELEMENT_GROUPS.length - 1;
      setIsSaving(true);
      try {
        await saveToStepData({ [currentGroup.contextKey]: contextTexts[currentGroup.key] || "" });
        if (isLastGroup) {
          onConfirm();
        } else {
          navigate(groupIdx + 1, 0, SYSTEM_ELEMENT_GROUPS[groupIdx + 1].questions.length === 0);
        }
      } finally {
        setIsSaving(false);
      }
    }
  };

  const goBack = () => {
    if (isContext) {
      const qs = currentGroup.questions;
      if (qs.length > 0) {
        navigate(groupIdx, qs.length - 1, false);
      } else if (groupIdx > 0) {
        navigate(groupIdx - 1, 0, true);
      }
    } else {
      if (questionIdx > 0) {
        navigate(groupIdx, questionIdx - 1, false);
      } else if (groupIdx > 0) {
        navigate(groupIdx - 1, 0, true);
      }
    }
  };

  const canGoBack = groupIdx > 0 || questionIdx > 0 || isContext;

  // Toggle a value within a comma-separated multi-select answer
  const toggleMultiValue = (current: string, value: string): string => {
    const parts = current ? current.split(", ").filter(Boolean) : [];
    const idx = parts.indexOf(value);
    if (idx >= 0) {
      parts.splice(idx, 1);
    } else {
      parts.push(value);
    }
    return parts.join(", ");
  };

  // Choice selection — auto-advances for single-select, toggles for multi-select
  // All saves here are silent: the user already sees their selection highlighted locally;
  // a background save failure shouldn't interrupt the interaction with an error toast.
  const handleChoiceSelect = async (q: QuestionConfig, value: string) => {
    userHasAnswered.current = true;
    if (q.multiSelect) {
      // Always base toggle on the ref so rapid clicks don't use a stale closure value.
      const current = latestAnswersRef.current[q.key] || "";
      const parts = current.split(", ").filter(Boolean);
      let next: string;
      if (value === "None") {
        // "None" is mutually exclusive — toggle it off if already selected, otherwise select only None.
        next = parts.includes("None") ? "" : "None";
      } else {
        // Selecting any real option clears "None", then toggles the chosen value.
        const filtered = parts.filter(p => p !== "None");
        const idx = filtered.indexOf(value);
        if (idx >= 0) filtered.splice(idx, 1);
        else filtered.push(value);
        next = filtered.join(", ");
      }
      latestAnswersRef.current = { ...latestAnswersRef.current, [q.key]: next };
      setAnswers({ ...latestAnswersRef.current });
      saveToStepData({ [q.key]: next }, true); // fire-and-forget, silent
      return;
    }
    const updated = { ...latestAnswersRef.current, [q.key]: value };
    latestAnswersRef.current = updated;
    setAnswers(updated);
    saveToStepData({ [q.key]: value }, true); // fire-and-forget, silent
    // If this answer reveals an optional follow-up textarea, don't auto-advance —
    // let the user type (or skip) and press → themselves.
    if (q.detailKey && q.detailTrigger && value === q.detailTrigger) return;
    // Slight delay so the user sees the selection highlight before advancing
    setTimeout(() => {
      const hasMoreQuestions = questionIdx < currentGroup.questions.length - 1;
      if (hasMoreQuestions) {
        navigate(groupIdx, questionIdx + 1, false);
      } else {
        navigate(groupIdx, questionIdx, true);
      }
    }, 120);
  };

  // ── Doc upload ─────────────────────────────────────────────────────────────

  const handleContextDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, groupKey: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const doc = await uploadDocumentFile(file, sessionId, 4);
      setContextDocs((prev) => ({ ...prev, [groupKey]: [...(prev[groupKey] || []), { name: file.name }] }));
      if (doc.fileContent) {
        setContextTexts((prev) => ({
          ...prev,
          [groupKey]: prev[groupKey] ? `${prev[groupKey]}\n\n[From ${file.name}]:\n${doc.fileContent}` : `[From ${file.name}]:\n${doc.fileContent}`,
        }));
      }
      toast({ title: "Document added", description: `${file.name} has been added.` });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  // Group indicator at the top
  const GroupIndicator = (
    <div className="flex items-center gap-1 flex-wrap">
      {SYSTEM_ELEMENT_GROUPS.map((g, i) => {
        const isActive = i === groupIdx;
        const isDone = i < groupIdx || (i === groupIdx && isContext && groupIdx === SYSTEM_ELEMENT_GROUPS.length - 1);
        const isPast = i < groupIdx;
        return (
          <div key={g.key} className="flex items-center">
            <button
              type="button"
              onClick={() => navigate(i, 0, SYSTEM_ELEMENT_GROUPS[i].questions.length === 0)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors",
                isActive ? "cursor-default" : "hover:bg-muted/60 cursor-pointer",
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shrink-0",
                isActive ? "bg-primary text-white" : isPast ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
              )}>
                {isPast ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={cn(
                "text-[11px] font-medium whitespace-nowrap",
                isActive ? "text-foreground" : isPast ? "text-primary/70" : "text-muted-foreground",
              )}>
                {g.label}
              </span>
            </button>
            {i < SYSTEM_ELEMENT_GROUPS.length - 1 && <div className="w-4 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );

  // Within-group progress bar (always shown; context counts as the final numbered step)
  const totalScreens = currentGroup.questions.length + 1; // questions + context
  const currentScreenNum = isContext ? totalScreens : questionIdx + 1;
  const progressPct = Math.round((currentScreenNum / totalScreens) * 100);
  const ProgressBar = (
    <div className="w-full space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{currentGroup.label}</span>
        <span>
          {currentScreenNum} of {totalScreens}
          {isContext && <span className="ml-1 text-primary font-semibold">· Context</span>}
        </span>
      </div>
      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );

  // Choice question render
  const renderChoiceQuestion = (q: QuestionConfig) => {
    const selectedValues = q.multiSelect
      ? (answers[q.key] || "").split(", ").filter(Boolean)
      : [];

    return (
      <div className="space-y-4">
        {q.multiSelect && (
          <p className="text-sm text-muted-foreground font-medium">Select all that apply</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          {q.options?.map((opt) => {
            const isSelected = q.multiSelect
              ? selectedValues.includes(opt.value)
              : answers[q.key] === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChoiceSelect(q, opt.value)}
                className={cn(
                  "relative text-left rounded-xl border-2 px-5 py-4 transition-all duration-150 group outline-none",
                  "hover:border-primary/60 hover:bg-primary/5",
                  isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-5 h-5 flex items-center justify-center shrink-0 transition-colors",
                    q.multiSelect ? "rounded border-2" : "rounded-full border-2",
                    isSelected ? "border-primary bg-primary" : "border-border group-hover:border-primary/50",
                  )}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-foreground")}>
                    {opt.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {q.multiSelect && (
          <p className="text-xs text-muted-foreground pt-1">
            When done, press <span className="font-semibold">→</span> to continue.
          </p>
        )}

        {/* Optional follow-up detail textarea with record / upload */}
        {q.detailKey && q.detailTrigger && answers[q.key] === q.detailTrigger && (
          <div className="mt-4 space-y-2 max-w-2xl">
            <label className="text-sm font-medium text-foreground">
              Can you tell us more? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={answers[q.detailKey] || ""}
              onChange={(e) => {
                userHasAnswered.current = true;
                setAnswers((prev) => ({ ...prev, [q.detailKey!]: e.target.value }));
              }}
              placeholder="Add any additional context here..."
              rows={3}
              className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-sm resize-none focus:border-primary focus:outline-none transition-colors"
            />
            {/* Mic + Upload action row */}
            <div className="flex items-center gap-2">
              {/* Mic button */}
              {recordingState === "idle" && (
                <button type="button"
                  onClick={() => handleStartDetailRecording(q.detailKey!)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  Record
                </button>
              )}
              {recordingState === "recording" && activeContextKey === q.detailKey && (
                <button type="button"
                  onClick={handleStopRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-xs text-red-600 font-medium hover:bg-red-100 transition-colors">
                  <div className="w-3 h-3 rounded-sm bg-red-500" />
                  Stop
                </button>
              )}
              {recordingState === "transcribing" && activeContextKey === q.detailKey && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Transcribing...
                </span>
              )}
              {/* Upload button */}
              <input
                ref={(el) => { detailDocInputRefs.current[q.detailKey!] = el; }}
                type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                onChange={(e) => handleDetailDocUpload(e, q.detailKey!)}
              />
              <button type="button"
                onClick={() => detailDocInputRefs.current[q.detailKey!]?.click()}
                disabled={isUploadingDetailDoc}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50">
                {isUploadingDetailDoc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                Upload doc
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Number input question render
  const renderNumberQuestion = (q: QuestionConfig) => (
    <div className="space-y-6 max-w-sm">
      <div className="space-y-2">
        <Input
          type="number"
          min="0"
          value={answers[q.key] || ""}
          onChange={(e) => { userHasAnswered.current = true; setAnswers((prev) => ({ ...prev, [q.key]: e.target.value })); }}
          onKeyDown={(e) => { if (e.key === "Enter") goNext(); }}
          placeholder="Enter a number..."
          className="text-2xl h-14 text-center font-semibold border-2 focus:border-primary"
          autoFocus
        />
        {q.hint && <p className="text-xs text-muted-foreground text-center">{q.hint}</p>}
        <p className="text-xs text-muted-foreground text-center pt-1">Press Enter or <span className="font-semibold">→</span> to continue</p>
      </div>
    </div>
  );

  // Dollar input question render
  const renderDollarQuestion = (q: QuestionConfig) => (
    <div className="space-y-6 max-w-sm">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold text-muted-foreground">$</span>
          <Input
            type="text"
            value={answers[q.key] === "Unknown" ? "" : (answers[q.key] || "")}
            onChange={(e) => {
              userHasAnswered.current = true;
              const raw = e.target.value.replace(/[^0-9.]/g, "");
              const formatted = raw ? Number(raw).toLocaleString() : "";
              setAnswers((prev) => ({ ...prev, [q.key]: formatted }));
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && answers[q.key]) goNext(); }}
            placeholder="0"
            className="text-2xl h-14 font-semibold border-2 focus:border-primary"
            autoFocus
          />
        </div>
        {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
        <p className="text-xs text-muted-foreground pt-1">Press Enter or <span className="font-semibold">→</span> to continue</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => { setAnswers((prev) => ({ ...prev, [q.key]: "Unknown" })); setTimeout(goNext, 100); }}
        className={cn("self-start", answers[q.key] === "Unknown" ? "border-primary text-primary bg-primary/5" : "")}
      >
        Unknown
      </Button>
    </div>
  );

  // Conditional dollar question render (choice + optional amount)
  const renderConditionalDollarQuestion = (q: QuestionConfig) => {
    const selectedValue = answers[q.key];
    const amountKey = q.conditionalKey || `${q.key}_amount`;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg">
          {q.options?.map((opt) => {
            const isSelected = selectedValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [q.key]: opt.value }))}
                className={cn(
                  "relative text-left rounded-xl border-2 px-5 py-4 transition-all duration-150 group",
                  "hover:border-primary/60 hover:bg-primary/5",
                  isSelected ? "border-primary bg-primary/8 shadow-sm" : "border-border bg-background",
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "border-primary bg-primary" : "border-border group-hover:border-primary/50",
                  )}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className={cn("text-sm font-medium", isSelected ? "text-primary" : "text-foreground")}>{opt.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedValue === "Yes" && (
          <div className="space-y-2 max-w-sm">
            <p className="text-sm font-medium text-foreground">How much?</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-muted-foreground">$</span>
              <Input
                type="text"
                value={answers[amountKey] || ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, "");
                  const formatted = raw ? Number(raw).toLocaleString() : "";
                  setAnswers((prev) => ({ ...prev, [amountKey]: formatted }));
                }}
                placeholder="0"
                className="text-xl h-12 font-semibold border-2 focus:border-primary"
                autoFocus
              />
            </div>
          </div>
        )}

        {selectedValue && (
          <p className="text-xs text-muted-foreground pt-1">Press <span className="font-semibold">→</span> to continue</p>
        )}
        {!selectedValue && (
          <p className="text-xs text-muted-foreground pt-1">Select an option above or press <span className="font-semibold">→</span> to skip</p>
        )}
      </div>
    );
  };

  // Context capture screen
  const renderContextScreen = () => {
    const gKey = currentGroup.key;
    // In Path B, swap "your" → experience name in the heading where it makes sense.
    // Falls back to the v1 title if no experience name has been entered.
    const renderedTitle = (() => {
      if (!isPathB || !experienceName) return currentGroup.contextTitle;
      return currentGroup.contextTitle.replace(/your\b/i, `${experienceName}'s`);
    })();
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-display font-bold text-foreground leading-tight">
          {renderedTitle}
        </h1>

        <ContextCaptureCards
          contextText={contextTexts[gKey] || ""}
          setContextText={(val) => {
            if (typeof val === "function") {
              setContextTexts((prev) => ({ ...prev, [gKey]: (val as (p: string) => string)(prev[gKey] || "") }));
            } else {
              setContextTexts((prev) => ({ ...prev, [gKey]: val }));
            }
          }}
          contextDocs={contextDocs[gKey] || []}
          questions={currentGroup.contextPrompts.length > 0 ? currentGroup.contextPrompts : [`Tell us anything else about ${currentGroup.label} that might affect your model selection.`]}
          inputId={`system-elements-${gKey}-doc-upload`}
          recordingState={recordingState}
          onStartRecording={() => handleStartRecording(gKey)}
          onStopRecording={handleStopRecording}
          isUploadingDoc={isUploadingDoc}
          onFileChange={(e) => handleContextDocUpload(e, gKey)}
        />

      </div>
    );
  };

  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-start min-h-full px-8 py-12">
        <div className="w-full max-w-5xl space-y-8">

          {GroupIndicator}

          {ProgressBar}

          {/* Animated question / context screen */}
          <div
            key={animKey}
            className="space-y-6"
            style={{ animation: "sysElFadeIn 0.25s ease forwards" }}
          >
            {!isContext && currentQuestion ? (
              <div className="space-y-6">
                {/* Question number + text */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    {currentGroup.label}
                  </p>
                  <h1 className="text-3xl font-display font-bold text-foreground leading-tight max-w-2xl">
                    {currentQuestion.text}
                  </h1>
                </div>

                {currentQuestion.type === "choice" && renderChoiceQuestion(currentQuestion)}
                {currentQuestion.type === "number" && renderNumberQuestion(currentQuestion)}
                {currentQuestion.type === "dollar" && renderDollarQuestion(currentQuestion)}
                {currentQuestion.type === "conditional_dollar" && renderConditionalDollarQuestion(currentQuestion)}
              </div>
            ) : (
              renderContextScreen()
            )}
          </div>

        </div>
      </div>

      {/* Typeform-style floating nav — centered at bottom */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          title="Previous"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-foreground" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={isSaving}
          title="Next"
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
        </button>
      </div>

      {/* CSS keyframe for the fade/slide-in animation */}
      <style>{`
        @keyframes sysElFadeIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Legacy ConstraintsPanel kept for reference / admin display ─────────────

function ConstraintsPanel({ sessionId, stepData }: { sessionId: string; stepData: Record<string, any> }) {
  const data = stepData["4"] || {};
  const save = useStepDataSaver(sessionId, 4);
  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    // Support both new flat keys and legacy nested "constraints" object
    const legacy = data.constraints || {};
    for (const d of CONSTRAINT_DOMAINS) {
      next[d.key] = data[d.key] ?? legacy[d.label] ?? legacy[d.key] ?? "";
    }
    setLocal(next);
  }, [JSON.stringify(data)]);

  const handleBlur = (key: string) => {
    if ((local[key] ?? "") !== (data[key] ?? "")) {
      save({ [key]: local[key] });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Constraints by Domain
        </CardTitle>
        <p className="text-xs text-muted-foreground">Summarize constraints for each area. The AI will populate these as you discuss them in chat.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {CONSTRAINT_DOMAINS.map((d, i) => (
          <div key={d.key} className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">{i + 1}. {d.label}</Label>
            <Textarea
              value={local[d.key] ?? ""}
              onChange={(e) => setLocal(prev => ({ ...prev, [d.key]: e.target.value }))}
              onBlur={() => handleBlur(d.key)}
              placeholder="No constraints noted"
              className="text-sm min-h-[48px] resize-y"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Model Preferences Questionnaire (full-screen, matches steps 1–4 style)
// ---------------------------------------------------------------------------

interface ModelPreferencesQuestionnaireProps {
  sessionId: string;
  stepData: Record<string, any>;
  onConfirm: () => void;
}

// Standalone OptionButton — defined outside parent so React doesn't remount it on every render
interface PrefOptionButtonProps {
  isSelected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  hasError?: boolean;
}
function PrefOptionButton({ isSelected, onClick, label, sublabel, hasError }: PrefOptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-xl border-2 px-5 py-4 transition-all duration-150 group",
        "hover:border-primary/60 hover:bg-primary/5",
        isSelected ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background",
        hasError && !isSelected ? "ring-2 ring-destructive/60" : "",
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors mt-0.5",
          isSelected ? "border-primary bg-primary" : "border-border group-hover:border-primary/50",
        )}>
          {isSelected && <Check className="w-3 h-3 text-white" />}
        </div>
        <div>
          <span className={cn("text-sm font-medium block", isSelected ? "text-primary" : "text-foreground")}>
            {label}
          </span>
          {sublabel && (
            <span className="text-xs text-muted-foreground mt-0.5 block">{sublabel}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function ModelPreferencesQuestionnaire({ sessionId, stepData, onConfirm }: ModelPreferencesQuestionnaireProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [screenIdx, setScreenIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [missingKeys, setMissingKeys] = useState<string[]>([]);
  const save = useStepDataSaver(sessionId, 5);

  const data = stepData["5"] || {};

  const handleChange = (key: string, value: string) => {
    setMissingKeys((prev) => prev.filter((k) => k !== key));
    save({ [key]: value });
  };

  const navigate = (idx: number) => {
    setScreenIdx(idx);
    setAnimKey((k) => k + 1);
    setMissingKeys([]);
  };

  const goNext = async () => {
    if (isSaving) return;
    if (screenIdx === 0) {
      // Auto-save any IMPL_SUPPORTS that were never touched (default to "no_preference")
      const patch: Record<string, string> = {};
      for (const impl of IMPL_SUPPORTS) {
        if (!data[impl.key]) patch[impl.key] = "no_preference";
      }
      if (Object.keys(patch).length > 0) save(patch);
      navigate(1);
    } else if (screenIdx === 1) {
      if (!data.evidence_threshold) {
        setMissingKeys(["evidence_threshold"]);
        return;
      }
      navigate(2);
    } else {
      if (!data.open_to_stitching) {
        setMissingKeys(["open_to_stitching"]);
        return;
      }
      setIsSaving(true);
      try {
        await save({ ...data });
        onConfirm();
      } catch {
        toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
      } finally {
        setIsSaving(false);
      }
    }
  };

  const goBack = () => {
    if (screenIdx > 0) navigate(screenIdx - 1);
  };

  const canGoBack = screenIdx > 0;

  // Count explicitly answered questions for the progress label
  const answeredCount = [
    ...IMPL_SUPPORTS.map((s) => data[s.key]),
    data.evidence_threshold,
    data.open_to_stitching,
  ].filter(Boolean).length;
  const totalCount = IMPL_SUPPORTS.length + 2;

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); goNext(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [screenIdx, isSaving, data]);

  const SCREEN_LABELS = ["Implementation Supports", "Evidence", "Model Mix"];

  const renderScreen = () => {
    if (screenIdx === 0) {
      return (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Sliders className="w-4 h-4 text-foreground shrink-0" />
              <h2 className="text-base font-bold text-foreground">Implementation Supports</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-2">How important is each of these support types when adopting a new model?</p>
          </div>
          <div className="space-y-6">
            {IMPL_SUPPORTS.map((impl) => (
              <div key={impl.key} className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{impl.label}</p>
                <div className="flex flex-wrap gap-3">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <PrefOptionButton
                      key={opt.value}
                      isSelected={(data[impl.key] ?? "no_preference") === opt.value}
                      onClick={() => handleChange(impl.key, opt.value)}
                      label={opt.label}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (screenIdx === 1) {
      const hasError = missingKeys.includes("evidence_threshold");
      return (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <ClipboardCheck className="w-4 h-4 text-foreground shrink-0" />
              <h2 className="text-base font-bold text-foreground">How proven does it need to be?</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-2">What level of research backing do you require?</p>
          </div>
          {hasError && (
            <p className="text-sm text-destructive">Please make a selection to continue.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <PrefOptionButton
              isSelected={data.evidence_threshold === "established"}
              onClick={() => handleChange("evidence_threshold", "established")}
              label="Established models only"
              sublabel="Models with established research & implementation track records"
              hasError={hasError}
            />
            <PrefOptionButton
              isSelected={data.evidence_threshold === "open_to_emerging"}
              onClick={() => handleChange("evidence_threshold", "open_to_emerging")}
              label="Open to emerging models"
              sublabel="Newer models with pilot results or early proof points"
              hasError={hasError}
            />
          </div>
        </div>
      );
    }

    // screenIdx === 2
    const hasError = missingKeys.includes("open_to_stitching");
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <LayoutGrid className="w-4 h-4 text-foreground shrink-0" />
            <h2 className="text-base font-bold text-foreground">Do you want one model or a mix?</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Can we combine multiple models, or do you prefer a single comprehensive approach?</p>
        </div>
        {hasError && (
          <p className="text-sm text-destructive">Please make a selection to continue.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <PrefOptionButton
            isSelected={data.open_to_stitching === "yes"}
            onClick={() => handleChange("open_to_stitching", "yes")}
            label="Yes — open to combining compatible models"
            hasError={hasError}
          />
          <PrefOptionButton
            isSelected={data.open_to_stitching === "no"}
            onClick={() => handleChange("open_to_stitching", "no")}
            label="No — prefer a single comprehensive model"
            hasError={hasError}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full overflow-auto bg-background">
      <div className="flex flex-col items-center justify-start min-h-full px-8 py-12">
        <div className="w-full max-w-4xl space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground leading-tight">Model Preferences</h1>
            <p className="text-muted-foreground text-base mt-1.5 leading-relaxed max-w-2xl">
              Tell us what matters most in how a model is supported, how proven it should be, and whether you're open to combining solutions.
            </p>
            <p className="text-xs text-muted-foreground mt-2">{answeredCount} of {totalCount} answered</p>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === screenIdx ? "w-6 bg-primary" : i < screenIdx ? "w-2 bg-primary/40" : "w-2 bg-border",
                )}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">{SCREEN_LABELS[screenIdx]}</span>
          </div>

          {/* Animated screen */}
          <div key={animKey} style={{ animation: "schoolFadeIn 0.25s ease forwards" }}>
            {renderScreen()}
          </div>

        </div>
      </div>

      {/* Floating nav */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-row gap-2 z-50">
        {canGoBack && (
          <button type="button" onClick={goBack} title="Go back"
            className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
        )}
        <button type="button" onClick={goNext} disabled={isSaving} title={screenIdx === 2 ? "Confirm & Continue" : "Next"}
          className="w-10 h-10 rounded-lg border border-border bg-background shadow-md flex items-center justify-center hover:bg-muted disabled:opacity-30 transition-colors">
          {isSaving ? <Loader2 className="w-4 h-4 text-foreground animate-spin" /> : <ChevronRight className="w-4 h-4 text-foreground" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
const IMPL_SUPPORTS = [
  { key: "impl_coaching", label: "1:1 Coaching & Consulting" },
  { key: "impl_pd", label: "Professional Development (PD)" },
  { key: "impl_selfserve", label: "Self-serve Resources" },
  { key: "impl_observation", label: "Observation Opportunities" },
];

const PRIORITY_OPTIONS = [
  { value: "need_to_have", label: "Need to Have" },
  { value: "nice_to_have", label: "Nice to Have" },
  { value: "no_preference", label: "No Preference" },
];

// ---------------------------------------------------------------------------
// Editable Summary — reusable for outcomes_summary, leaps_summary, etc.
// ---------------------------------------------------------------------------
function EditableSummary({ sessionId, stepNumber, fieldKey, label, value, colorClass }: {
  sessionId: string; stepNumber: number; fieldKey: string; label: string; value: string; colorClass: string;
}) {
  const save = useStepDataSaver(sessionId, stepNumber);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  const handleBlur = () => {
    if (localValue !== value) {
      save({ [fieldKey]: localValue });
    }
  };

  return (
    <div className={cn("p-3 rounded-md border mt-2", colorClass)}>
      <p className="text-xs font-semibold text-foreground mb-1.5">{label}</p>
      <Textarea
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        placeholder={`AI-generated summary will appear here. You can also type your own.`}
        className="text-sm min-h-[56px] bg-white/60 border-0 resize-y p-2"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Experience Summary — shown below taxonomy for Step 3
// ---------------------------------------------------------------------------
function ExperienceSummaryCard({ sessionId, stepData }: { sessionId: string; stepData: Record<string, any> }) {
  const data = stepData["3"] || {};
  return (
    <Card className="border-emerald-500/15">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Experience Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <EditableSummary
          sessionId={sessionId}
          stepNumber={3}
          fieldKey="experience_summary"
          label="Intended Learning Experience"
          value={data.experience_summary || ""}
          colorClass="bg-emerald-500/5 border-emerald-500/15"
        />
      </CardContent>
    </Card>
  );
}

function StepDataPanel({ currentStepData }: { currentStepData: any }) {
  if (currentStepData && Object.keys(currentStepData).length > 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary" />
            Captured Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(currentStepData).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {key.replace(/_/g, " ")}
                </p>
                <div className="text-sm text-foreground">
                  {Array.isArray(value) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {(value as string[]).map((v, i) => (
                        <Badge key={i} variant="secondary">{String(v)}</Badge>
                      ))}
                    </div>
                  ) : typeof value === 'object' && value !== null ? (
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    <p>{String(value)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="py-12 text-center">
        <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
          <FileText className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No information captured yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Use the chat on the left to work through this step. The advisor will help gather all the needed inputs.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Decision Frame Review (full-screen, no chat)
// ---------------------------------------------------------------------------

interface DecisionFrameReviewProps {
  stepData: Record<string, any>;
  stepsCompleted: number[];
  onGoToStep: (step: number) => void;
  onConfirm: () => void;
  isConfirming: boolean;
  designScope?: DesignScope;
}

function DecisionFrameReview({ stepData, stepsCompleted, onGoToStep, onConfirm, isConfirming, designScope }: DecisionFrameReviewProps) {
  const isPathB = designScope === "specific_experience";
  const s1 = stepData["1"] || {};
  const s2 = stepData["2"] || {};
  const s3 = stepData["3"] || {};
  const s4 = stepData["4"] || {};
  const s5 = stepData["5"] || {};

  const priorSteps = WORKFLOW_STEPS.filter(s => s.number >= 1 && s.number <= 5);
  const hasPriorData = priorSteps.some(s => stepData[String(s.number)] && Object.keys(stepData[String(s.number)]).length > 0);

  const renderRow = (label: string, value: string | undefined) =>
    value ? (
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5 uppercase tracking-wider">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
      </div>
    ) : null;

  const renderBadges = (label: string, items: any[]) =>
    items.length > 0 ? (
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5 uppercase tracking-wider">{label}</span>
        <div className="flex flex-wrap gap-1">
          {items.map((v: any, i: number) => {
            const name = v?.name || String(v);
            const imp = v?.importance;
            return (
              <Badge key={i} variant="secondary" className="text-xs">
                {name}{imp === "most_important" ? " *" : ""}
              </Badge>
            );
          })}
        </div>
      </div>
    ) : null;

  const implLabel = (val: string | undefined) => {
    if (val === "need_to_have") return "Need to Have";
    if (val === "nice_to_have") return "Nice to Have";
    return "No Preference";
  };

  const SectionCard = ({
    stepNum,
    title,
    icon: Icon,
    children,
    hasData,
  }: {
    stepNum: number;
    title: string;
    icon: any;
    children: React.ReactNode;
    hasData: boolean;
  }) => {
    const isConfirmedStep = stepsCompleted.includes(stepNum);
    return (
      <div className="bg-white border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isConfirmedStep ? "bg-primary/10" : "bg-muted"
            )}>
              <Icon className={cn("w-4 h-4", isConfirmedStep ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                {isConfirmedStep && <Check className="w-3.5 h-3.5 text-primary" />}
              </div>
              <span className="text-xs text-muted-foreground">Step {stepNum}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={() => onGoToStep(stepNum)}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </Button>
        </div>
        {hasData ? (
          <div className="space-y-2">{children}</div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No information captured yet.</p>
        )}
      </div>
    );
  };

  // Derive Path B experience data for the Decision Frame card
  const exp = isPathB ? ((stepData.experience as Record<string, any>) || {}) : {};
  const primaryPracticeIds = new Set<number>(
    ((exp.primaryPractices || []) as TaxonomySelection[]).map((p) => p.id)
  );
  const primaryPractices: TaxonomySelection[] = isPathB ? (exp.primaryPractices || []) : [];
  const additionalPractices: TaxonomySelection[] = isPathB
    ? ((s3.selected_practices || []) as TaxonomySelection[]).filter((p) => !primaryPracticeIds.has(p.id))
    : [];
  const expHasData = !!(exp.name || exp.description || (exp.targetedGradeBands?.length ?? 0) > 0 || primaryPractices.length > 0 || additionalPractices.length > 0 || s3.selected_practices?.length > 0);

  return (
    <div className="w-full h-full overflow-hidden flex flex-col bg-muted/30">
      <ScrollArea className="flex-1 min-h-0">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-6 pb-32">

          {/* Page header */}
          <div className="text-center space-y-2 pb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <ClipboardCheck className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground">Experience Summary</h1>
            <p className="text-base text-muted-foreground max-w-md mx-auto">
              Review your inputs before we match you with models. Edit any section if something needs adjusting.
            </p>
          </div>

          {!hasPriorData && (
            <div className="bg-white border border-dashed border-border rounded-xl p-8 text-center">
              <ClipboardCheck className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold text-foreground mb-1">Nothing to review yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Complete steps 1 through 5 first. Return here when you're ready to review before generating recommendations.
              </p>
            </div>
          )}

          {hasPriorData && (
            <>
              {/* Step 1 — School Context */}
              <SectionCard stepNum={1} title="School Context" icon={School} hasData={Object.keys(s1).length > 0}>
                {renderRow("School", s1.school_name)}
                {renderRow("District", s1.district)}
                {renderRow("State", s1.state)}
                {renderRow("Grade Band", Array.isArray(s1.grade_bands) ? s1.grade_bands.join(", ") : s1.grade_band)}
                {renderRow("Context", s1.context)}
              </SectionCard>

              {/* Path B — Define Experience card (replaces Practices in Path B) */}
              {isPathB && (
                <SectionCard stepNum={2} title="Define Experience" icon={BookOpen} hasData={expHasData}>
                  {renderRow("Experience", exp.name)}
                  {renderRow("Description", exp.description)}
                  {renderRow("Grade Levels", Array.isArray(exp.targetedGradeBands) && exp.targetedGradeBands.length > 0 ? exp.targetedGradeBands.join(", ") : undefined)}
                  {renderBadges("Primary Practices", primaryPractices)}
                  {renderBadges("Additional Practices", additionalPractices)}
                  {/* Fallback: show all practices if experience hasn't been split yet */}
                  {primaryPractices.length === 0 && additionalPractices.length === 0 && renderBadges("Practices", s3.selected_practices || [])}
                  {renderRow("Experience Summary", s3.experience_summary)}
                </SectionCard>
              )}

              {/* Outcomes */}
              <SectionCard
                stepNum={isPathB ? 3 : 2}
                title="Outcomes"
                icon={Target}
                hasData={!!(s2.selected_outcomes?.length || s2.outcomes_summary)}
              >
                {renderRow("Summary", s2.outcomes_summary)}
                {renderBadges("Selected", s2.selected_outcomes || [])}
              </SectionCard>

              {/* LEAPs */}
              <SectionCard
                stepNum={9}
                title="LEAPs"
                icon={Zap}
                hasData={!!(s2.selected_leaps?.length || s2.leaps_summary)}
              >
                {renderRow("Summary", s2.leaps_summary)}
                {renderBadges("Selected", s2.selected_leaps || [])}
              </SectionCard>

              {/* Path A only — Learning Experience & Practices */}
              {!isPathB && (
                <SectionCard stepNum={3} title="Learning Experience & Practices" icon={BookOpen} hasData={Object.keys(s3).length > 0}>
                  {renderRow("Experience Summary", s3.experience_summary)}
                  {renderRow("Practices Summary", s3.practices_summary)}
                  {renderBadges("Practices", s3.selected_practices || [])}
                </SectionCard>
              )}

              {/* Step 4 — System Elements */}
              <SectionCard stepNum={4} title="System Elements" icon={Layers} hasData={Object.keys(s4).length > 0}>
                {SYSTEM_ELEMENT_GROUPS.map((g) => {
                  const entries: { label: string; value: string }[] = [];
                  for (const q of g.questions) {
                    const val = s4[q.key];
                    if (val) entries.push({ label: q.text.length > 60 ? q.text.slice(0, 60) + "…" : q.text, value: val });
                    if (q.conditionalKey && s4[q.conditionalKey]) {
                      entries.push({ label: "Amount", value: `$${s4[q.conditionalKey]}` });
                    }
                  }
                  const ctx = s4[g.contextKey];
                  if (ctx) entries.push({ label: "Additional context", value: ctx });
                  if (entries.length === 0) return null;
                  return (
                    <div key={g.key} className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</p>
                      <div className="space-y-1 pl-2">
                        {entries.map((e, i) => (
                          <div key={i}>{renderRow(e.label, e.value)}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {/* Legacy fallback */}
                {SYSTEM_ELEMENT_GROUPS.every((g) => !s4[g.contextKey] && g.questions.every((q) => !s4[q.key])) &&
                  CONSTRAINT_DOMAINS.some((d) => !!s4[d.key]) && (
                    <div className="space-y-1.5">
                      {CONSTRAINT_DOMAINS.map((d) => {
                        const val = s4[d.key];
                        return val ? <div key={d.key}>{renderRow(d.label, val)}</div> : null;
                      })}
                    </div>
                  )}
              </SectionCard>

              {/* Step 5 — Model Preferences */}
              <SectionCard stepNum={5} title="Model Preferences" icon={Sliders} hasData={Object.keys(s5).length > 0}>
                {IMPL_SUPPORTS.map(impl => {
                  const val = s5[impl.key];
                  return val && val !== "no_preference" ? <div key={impl.key}>{renderRow(impl.label, implLabel(val))}</div> : null;
                })}
                {renderRow("Evidence", s5.evidence_threshold === "established" ? "Established models only" : s5.evidence_threshold === "open_to_emerging" ? "Open to emerging models" : undefined)}
                {renderRow("Stitching", s5.open_to_stitching === "yes" ? "Open to combining models" : s5.open_to_stitching === "no" ? "Prefer single model" : undefined)}
              </SectionCard>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Sticky confirmation footer */}
      <div className="shrink-0 border-t border-border bg-white px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Everything look right?</p>
            <p className="text-xs text-muted-foreground">You can always come back and edit individual steps later.</p>
          </div>
          <Button
            size="lg"
            onClick={onConfirm}
            disabled={isConfirming || !hasPriorData}
            className="shrink-0 gap-2"
          >
            {isConfirming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate Model Recommendations
          </Button>
        </div>
      </div>
    </div>
  );
}

function DecisionFramePanel({ stepData, stepsCompleted }: { stepData: Record<string, any>; stepsCompleted: number[] }) {
  const priorSteps = WORKFLOW_STEPS.filter(s => s.number <= 5);
  const hasPriorData = priorSteps.some(s => stepData[String(s.number)] && Object.keys(stepData[String(s.number)]).length > 0);

  if (!hasPriorData) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="py-8 text-center">
          <ClipboardCheck className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">Experience Summary</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Complete steps 1 through 5 first. The decision frame will synthesize all your inputs into a consolidated summary for review before generating recommendations.
          </p>
        </CardContent>
      </Card>
    );
  }

  const s1 = stepData["1"] || {};
  const s2 = stepData["2"] || {};
  const s3 = stepData["3"] || {};
  const s4 = stepData["4"] || {};
  const s5 = stepData["5"] || {};

  const renderRow = (label: string, value: string | undefined) =>
    value ? (
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5 uppercase tracking-wider">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
      </div>
    ) : null;

  const renderBadges = (label: string, items: any[]) =>
    items.length > 0 ? (
      <div className="flex items-start gap-3">
        <span className="text-xs text-muted-foreground min-w-[110px] shrink-0 pt-0.5 uppercase tracking-wider">{label}</span>
        <div className="flex flex-wrap gap-1">
          {items.map((v: any, i: number) => {
            const name = v?.name || String(v);
            const imp = v?.importance;
            return (
              <Badge key={i} variant="secondary" className="text-xs">
                {name}{imp === "most_important" ? " *" : ""}
              </Badge>
            );
          })}
        </div>
      </div>
    ) : null;

  const sectionHeader = (num: number, label: string) => {
    const isDone = stepsCompleted.includes(num);
    return (
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={isDone ? "default" : "secondary"} className="text-xs">{num}</Badge>
        <span className="text-sm font-semibold">{label}</span>
        {isDone && <Check className="w-3.5 h-3.5 text-primary" />}
      </div>
    );
  };

  const implLabel = (val: string | undefined) => {
    if (val === "need_to_have") return "Need to Have";
    if (val === "nice_to_have") return "Nice to Have";
    return "No Preference";
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          Experience Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Review all inputs gathered from prior steps. Use the chat to confirm or adjust before generating recommendations.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {/* Step 1 — School Context */}
          <div className="p-4 rounded-md bg-white border border-border/50">
            {sectionHeader(1, "School Context")}
            <div className="space-y-1.5">
              {renderRow("School", s1.school_name)}
              {renderRow("District", s1.district)}
              {renderRow("State", s1.state)}
              {renderRow("Grade Band", Array.isArray(s1.grade_bands) ? s1.grade_bands.join(", ") : s1.grade_band)}
              {renderRow("Context", s1.context)}
            </div>
          </div>

          {/* Outcomes */}
          <div className="p-4 rounded-md bg-white border border-border/50">
            {sectionHeader(2, "Outcomes")}
            <div className="space-y-1.5">
              {renderRow("Summary", s2.outcomes_summary)}
              {renderBadges("Selected", s2.selected_outcomes || [])}
            </div>
          </div>

          {/* LEAPs */}
          <div className="p-4 rounded-md bg-white border border-border/50">
            {sectionHeader(9, "LEAPs")}
            <div className="space-y-1.5">
              {renderRow("Summary", s2.leaps_summary)}
              {renderBadges("Selected", s2.selected_leaps || [])}
            </div>
          </div>

          {/* Step 3 — Practices */}
          <div className="p-4 rounded-md bg-white border border-border/50">
            {sectionHeader(3, "Learning Experience & Practices")}
            <div className="space-y-1.5">
              {renderRow("Experience Summary", s3.experience_summary)}
              {renderRow("Practices Summary", s3.practices_summary)}
              {renderBadges("Practices", s3.selected_practices || [])}
            </div>
          </div>

          {/* Step 4 — System Elements */}
          <div className="p-4 rounded-md bg-white border border-border/50">
            {sectionHeader(4, "System Elements")}
            <div className="space-y-2.5">
              {SYSTEM_ELEMENT_GROUPS.map((g) => {
                // Collect all answers + context for this group
                const entries: { label: string; value: string }[] = [];
                for (const q of g.questions) {
                  const val = s4[q.key];
                  if (val) entries.push({ label: q.text.length > 60 ? q.text.slice(0, 60) + "…" : q.text, value: val });
                  if (q.conditionalKey && s4[q.conditionalKey]) {
                    entries.push({ label: "Amount", value: `$${s4[q.conditionalKey]}` });
                  }
                }
                const ctx = s4[g.contextKey];
                if (ctx) entries.push({ label: "Additional context", value: ctx });
                if (entries.length === 0) return null;
                return (
                  <div key={g.key}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">{g.label}</p>
                    <div className="space-y-0.5 pl-2">
                      {entries.map((e) => renderRow(e.label, e.value))}
                    </div>
                  </div>
                );
              })}
              {/* Legacy fallback for old sessions */}
              {SYSTEM_ELEMENT_GROUPS.every((g) => !s4[g.contextKey] && g.questions.every((q) => !s4[q.key])) &&
               CONSTRAINT_DOMAINS.some((d) => !!s4[d.key]) && (
                <div>
                  {CONSTRAINT_DOMAINS.map((d) => {
                    const val = s4[d.key];
                    return val ? renderRow(d.label, val) : null;
                  })}
                </div>
              )}
              {SYSTEM_ELEMENT_GROUPS.every((g) => !s4[g.contextKey] && g.questions.every((q) => !s4[q.key])) &&
               CONSTRAINT_DOMAINS.every((d) => !s4[d.key]) && (
                <p className="text-sm text-muted-foreground italic">No system elements captured yet.</p>
              )}
            </div>
          </div>

          {/* Step 5 — Preferences */}
          <div className="p-4 rounded-md bg-white border border-border/50">
            {sectionHeader(5, "Model Preferences")}
            <div className="space-y-1.5">
              {IMPL_SUPPORTS.map(impl => {
                const val = s5[impl.key];
                return val && val !== "no_preference" ? renderRow(impl.label, implLabel(val)) : null;
              })}
              {renderRow("Evidence", s5.evidence_threshold === "established" ? "Established models only" : s5.evidence_threshold === "open_to_emerging" ? "Open to emerging models" : undefined)}
              {renderRow("Stitching", s5.open_to_stitching === "yes" ? "Open to combining models" : s5.open_to_stitching === "no" ? "Prefer single model" : undefined)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Recommendations (full-screen, no chat split panel)
// ---------------------------------------------------------------------------

interface LocalChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  modelId?: number; // stamped so stale cross-model messages can be detected
  streaming?: boolean; // true while tokens are still arriving
}

// --- Pill color helper ---
function pillStyle(matched: number, total: number, isActive: boolean) {
  if (total === 0) return cn(
    "border text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none",
    "bg-muted text-muted-foreground border-border hover:bg-muted/70",
    isActive && "ring-2 ring-offset-1 ring-muted-foreground"
  );
  const ratio = matched / total;
  if (ratio >= 0.6) return cn(
    "border text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none",
    isActive ? "bg-emerald-200 text-emerald-900 border-emerald-300" : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
  );
  if (ratio >= 0.3) return cn(
    "border text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none",
    isActive ? "bg-amber-200 text-amber-900 border-amber-300" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
  );
  return cn(
    "border text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none",
    isActive ? "bg-red-200 text-red-900 border-red-300" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
  );
}

function watchoutPillStyle(count: number, isActive: boolean) {
  if (count === 0) return cn(
    "border text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none",
    isActive ? "bg-muted text-foreground border-border" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
  );
  return cn(
    "border text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer transition-colors select-none",
    isActive ? "bg-amber-200 text-amber-900 border-amber-300" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
  );
}

// --- MatchList sub-component ---
function MatchList({ matches }: { matches: { name: string; importance: string; matched: boolean }[] }) {
  if (!matches || matches.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No selections to compare.</p>;
  }
  return (
    <div className="space-y-1">
      {matches.map((m, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {m.matched ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
          )}
          <span className={cn("flex-1", m.matched ? "text-foreground" : "text-muted-foreground")}>
            {m.name}
          </span>
          <span className="text-[10px] text-muted-foreground/60 shrink-0">
            {m.importance === "most_important" ? "Must Have" : m.importance === "important" ? "Important" : "Nice to Have"}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- ModelCard sub-component ---
type ActivePill = "outcomes" | "leaps" | "practices" | "watchouts" | null;

interface ModelCardProps {
  rec: any;
  stepData: Record<string, any>;
  sessionId: string;
  onExplore: (modelId: number) => void;
  onAskAI: (modelId: number, topic: string) => void;
  isExploring: boolean;
  rank: number;
}

function ModelCard({ rec, stepData, sessionId, onExplore, onAskAI, isExploring, rank }: ModelCardProps) {
  const [activePill, setActivePill] = useState<ActivePill>(null);

  const m = rec.model || {};
  const align = rec.alignment || {};
  const constraintFlags: { domain: string; detail: string }[] = align.constraintFlags || [];
  const gradeBandMatch = align.gradeBandMatch !== false;

  // Use separate score breakdowns directly (group-level for outcomes & practices, individual for leaps)
  const outcomeMatches = (align.outcomesScore?.matches || []) as any[];
  const leapMatches = (align.leapsScore?.matches || []) as any[];
  const practiceMatches = (align.practicesScore?.matches || []) as any[];

  const togglePill = (pill: ActivePill) => {
    setActivePill(prev => prev === pill ? null : pill);
  };

  const modelName = m.name ?? `Model ${rank}`;
  const desc = (m.description ?? "").slice(0, 150);
  const imageUrl = m.imageUrl ?? "";
  const grades = m.grades ?? "";

  return (
    <div className={cn(
      "bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md",
      isExploring ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
    )}>
      {/* Image banner */}
      <div className="relative aspect-[4/1] bg-gradient-to-br from-primary/10 to-primary/5 overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={modelName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <LayoutGrid className="w-8 h-8 text-primary/20" />
          </div>
        )}
        {/* Rank badge for top models */}
        {rank <= 3 && (
          <div className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">
            #{rank}
          </div>
        )}
        {/* Match score badge */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded-full cursor-default select-none">
                Match: {Math.round(align.totalPoints ?? 0)}
              </div>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p className="text-xs">Matching score based on outcomes, LEAPs & practices alignment</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {!gradeBandMatch && (
          <div className="absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-600 text-white">
            Grade mismatch
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-foreground text-base leading-snug">{modelName}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {grades && <Badge variant="secondary" className="text-[10px] font-normal">{grades}</Badge>}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/models/${rec.modelId}?session=${sessionId}`}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">View full model profile</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
          {desc}{desc.length >= 150 ? "…" : ""}
        </p>
        {/* Pill row */}
        <div className="flex flex-wrap gap-2 mb-3">
          {/* Outcomes pill */}
          {outcomeMatches.length > 0 && (
            <button
              type="button"
              className={pillStyle(outcomeMatches.filter((m: any) => m.matched).length, outcomeMatches.length, activePill === "outcomes")}
              onClick={() => togglePill("outcomes")}
            >
              Outcomes ({outcomeMatches.filter((m: any) => m.matched).length}/{outcomeMatches.length})
            </button>
          )}

          {/* LEAPs pill */}
          {leapMatches.length > 0 && (
            <button
              type="button"
              className={pillStyle(leapMatches.filter((m: any) => m.matched).length, leapMatches.length, activePill === "leaps")}
              onClick={() => togglePill("leaps")}
            >
              LEAPs ({leapMatches.filter((m: any) => m.matched).length}/{leapMatches.length})
            </button>
          )}

          {/* Practices pill */}
          {practiceMatches.length > 0 && (
            <button
              type="button"
              className={pillStyle(practiceMatches.filter((m: any) => m.matched).length, practiceMatches.length, activePill === "practices")}
              onClick={() => togglePill("practices")}
            >
              Practices ({practiceMatches.filter((m: any) => m.matched).length}/{practiceMatches.length})
            </button>
          )}

          {/* Watchouts pill */}
          <button
            type="button"
            className={watchoutPillStyle(constraintFlags.length, activePill === "watchouts")}
            onClick={() => togglePill("watchouts")}
          >
            {constraintFlags.length > 0 ? `Watchouts (${constraintFlags.length})` : "No watchouts"}
          </button>
        </div>

        {/* Expanded pill detail */}
        {activePill && (
          <div className="mb-4 p-3 bg-muted/40 rounded-lg border border-border/50 animate-in fade-in slide-in-from-top-1 duration-150">
            {activePill === "outcomes" && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Outcomes Alignment</p>
                <MatchList matches={outcomeMatches} />
              </>
            )}
            {activePill === "leaps" && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">LEAPs Alignment</p>
                <MatchList matches={leapMatches} />
              </>
            )}
            {activePill === "practices" && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Practices Alignment</p>
                <MatchList matches={practiceMatches} />
              </>
            )}
            {activePill === "watchouts" && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Watchouts</p>
                {constraintFlags.length > 0 ? (
                  <div className="space-y-1.5">
                    {constraintFlags.map((flag: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span className="font-medium text-foreground">{flag.domain}:</span>{" "}
                          <span className="text-muted-foreground">{flag.detail}</span>
                        </div>
                        <button type="button" onClick={() => onAskAI(rec.modelId, `watchout:${flag.domain}`)} className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 transition-colors shrink-0">
                          <Sparkles className="w-2.5 h-2.5" /> Ask AI
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No watchouts detected for this model.</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer action */}
        <Button
          size="sm"
          variant={isExploring ? "secondary" : "default"}
          className="gap-2"
          onClick={() => onExplore(rec.modelId)}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {isExploring ? "Currently Exploring" : "Explore with AI"}
        </Button>
      </div>
    </div>
  );
}

// --- Topic Tree for guided chat ---
const TOPIC_TREE = {
  root: [
    { id: "model", label: "Let's talk about the model", icon: "LayoutGrid" },
    { id: "watchouts", label: "Let's talk about watch outs", icon: "AlertTriangle" },
  ],
  model: [
    { id: "model:executive_summary", label: "Executive Summary" },
    { id: "model:summary", label: "Program Overview" },
    { id: "model:core_approach", label: "Core Approach" },
    { id: "model:resources_provided", label: "Resources Provided" },
    { id: "model:impact", label: "Impact" },
    { id: "model:cost_and_access", label: "Cost & Access" },
    { id: "model:pd_requirements", label: "Professional Development Requirements" },
    { id: "model:technology_needs", label: "Technology Needs" },
    { id: "model:scheduling_impact", label: "Scheduling Impact" },
    { id: "model:off_site_learning", label: "Off-Site Learning" },
    { id: "model:partnerships", label: "Partnerships" },
    { id: "model:family_involvement", label: "Family Involvement" },
    { id: "model:data_sharing", label: "Data Sharing" },
  ],
} as const;

const TOPIC_LABELS: Record<string, string> = {
  "model:executive_summary": "Give me an executive summary of this model.",
  "model:summary": "Tell me about this program.",
  "model:core_approach": "How does this program actually work?",
  "model:resources_provided": "What resources does this program provide?",
  "model:impact": "What is the impact of this program?",
  "model:cost_and_access": "What does this program cost and how do we access it?",
  "model:pd_requirements": "What professional development is required?",
  "model:technology_needs": "What technology does this program require?",
  "model:scheduling_impact": "How does this program affect our schedule?",
  "model:off_site_learning": "Does this program require off-site learning?",
  "model:partnerships": "Does this program require partnerships?",
  "model:family_involvement": "Does this program require family involvement?",
  "model:data_sharing": "What is this program's data sharing policy?",
};

function TopicTreeSelector({
  onSelectTopic,
  constraintFlags,
  forceBranch,
  onClearForceBranch,
  startExpanded = true,
}: {
  onSelectTopic: (topic: string) => void;
  constraintFlags: { domain: string; detail: string }[];
  forceBranch?: string | null;
  onClearForceBranch?: () => void;
  startExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(startExpanded);
  const [branch, setBranch] = useState<"root" | "model" | "watchouts">("root");

  useEffect(() => {
    if (forceBranch && (forceBranch === "model" || forceBranch === "watchouts")) {
      setBranch(forceBranch);
      setIsExpanded(true);
      onClearForceBranch?.();
    }
  }, [forceBranch, onClearForceBranch]);

  const handleSelectAndCollapse = (topic: string) => {
    onSelectTopic(topic);
    setIsExpanded(false);
    setBranch("root");
  };

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => { setIsExpanded(true); setBranch("root"); }}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/30"
      >
        <span className="font-medium">Explore a topic</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    );
  }

  if (branch === "root") {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] text-muted-foreground font-medium">What would you like to explore?</p>
          <button type="button" onClick={() => { setIsExpanded(false); setBranch("root"); }} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
        {TOPIC_TREE.root.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "watchouts" && constraintFlags.length === 0) return;
              setBranch(item.id as "model" | "watchouts");
            }}
            className={cn(
              "w-full text-left text-xs p-2.5 rounded-lg border transition-colors leading-snug flex items-center gap-2.5",
              item.id === "watchouts" && constraintFlags.length === 0
                ? "border-border/50 bg-muted/10 text-muted-foreground/50 cursor-not-allowed"
                : "border-border bg-muted/20 hover:bg-muted/50 text-foreground"
            )}
          >
            {item.icon === "LayoutGrid" && <LayoutGrid className="w-4 h-4 text-primary shrink-0" />}
            {item.icon === "AlertTriangle" && <AlertTriangle className={cn("w-4 h-4 shrink-0", constraintFlags.length > 0 ? "text-amber-600" : "text-muted-foreground/40")} />}
            <span>{item.label}</span>
            {item.id === "watchouts" && constraintFlags.length === 0 && (
              <span className="ml-auto text-[9px] text-muted-foreground/60">None flagged</span>
            )}
            {item.id === "watchouts" && constraintFlags.length > 0 && (
              <span className="ml-auto text-[9px] text-amber-600 font-semibold">{constraintFlags.length}</span>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (branch === "watchouts") {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-2 mb-1">
          <button type="button" onClick={() => setBranch("root")} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">&larr; Back</button>
          <p className="text-[10px] text-muted-foreground">Which watch out do you want to focus on?</p>
        </div>
        {constraintFlags.map((flag, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleSelectAndCollapse(`watchout:${flag.domain}`)}
            className="w-full text-left text-xs p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-foreground transition-colors leading-snug flex items-start gap-2"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">{flag.domain}</span>
              <span className="text-muted-foreground ml-1">— {flag.detail}</span>
            </div>
          </button>
        ))}
      </div>
    );
  }

  const items = TOPIC_TREE.model;
  const prompt = "What would you like to explore?";

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={() => setBranch("root")} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">&larr; Back</button>
        <p className="text-[10px] text-muted-foreground">{prompt}</p>
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => handleSelectAndCollapse(item.id)}
          className="w-full text-left text-xs p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-foreground transition-colors leading-snug"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// --- ModelChatPanel sub-component ---
interface ModelChatPanelProps {
  sessionId: string;
  exploredModelIds: number[];
  activeChatModelId: number;
  recommendations: any[];
  chatHistories: Record<number, LocalChatMessage[]>;
  pendingModelId: number | null;
  optimisticMessages: Record<number, string | null>;
  activeTopic: string | null;
  suggestedFollowUps: Record<number, string[]>;
  forceBranch: string | null;
  onSwitchModel: (modelId: number) => void;
  onCloseTab: (modelId: number) => void;
  onClose: () => void;
  onSendMessage: (modelId: number, message: string, topic?: string | null) => void;
  onSetTopic: (topic: string | null) => void;
  onClearConversation: (modelId: number) => void;
  onClearForceBranch: () => void;
}

function ModelChatPanel({
  sessionId,
  exploredModelIds,
  activeChatModelId,
  recommendations,
  chatHistories,
  pendingModelId,
  optimisticMessages,
  activeTopic,
  suggestedFollowUps,
  forceBranch,
  onSwitchModel,
  onCloseTab,
  onClose,
  onSendMessage,
  onSetTopic,
  onClearConversation,
  onClearForceBranch,
}: ModelChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeRec = recommendations.find((r: any) => r.modelId === activeChatModelId);
  const activeMessages = chatHistories[activeChatModelId] || [];
  const isPending = pendingModelId === activeChatModelId;
  const isStreaming = activeMessages.some(m => m.streaming);
  const isBusy = isPending || isStreaming;
  const optimisticMsg = optimisticMessages[activeChatModelId] ?? null;
  const activeFollowUps = suggestedFollowUps[activeChatModelId] ?? [];
  const constraintFlags: { domain: string; detail: string }[] = activeRec?.alignment?.constraintFlags || [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMessages, isPending, optimisticMsg]);

  useEffect(() => {
    setInput("");
  }, [activeChatModelId]);

  const handleSend = () => {
    if (!input.trim() || isPending) return;
    const msg = input;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    onSendMessage(activeChatModelId, msg, activeTopic);
  };

  const handleTopicSelect = (topic: string) => {
    onSetTopic(topic);
    const label = TOPIC_LABELS[topic];
    if (label) {
      onSendMessage(activeChatModelId, label, topic);
    } else if (topic.startsWith("watchout:")) {
      const domain = topic.slice("watchout:".length);
      onSendMessage(activeChatModelId, `Let's discuss the watch out for ${domain}.`, topic);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Panel header */}
      <div className="shrink-0 border-b border-border px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-primary" />
            </div>
            <span className="text-xs font-semibold text-foreground">Explore with AI</span>
          </div>
          <div className="flex items-center gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onClearConversation(activeChatModelId)}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">Reset conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        {/* Model tabs */}
        <div className="flex gap-1 flex-wrap">
          {exploredModelIds.map(modelId => {
            const rec = recommendations.find((r: any) => r.modelId === modelId);
            const name = rec?.model?.name ?? `Model ${modelId}`;
            const isActive = modelId === activeChatModelId;
            return (
              <div
                key={modelId}
                className={cn(
                  "flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-[11px] font-medium",
                  isActive
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 cursor-pointer"
                )}
              >
                <button
                  type="button"
                  className="max-w-[100px] truncate"
                  onClick={() => onSwitchModel(modelId)}
                >
                  {name}
                </button>
                <button
                  type="button"
                  className={cn("p-0.5 rounded hover:bg-black/10 transition-colors", isActive ? "text-white/80" : "text-muted-foreground/60")}
                  onClick={(e) => { e.stopPropagation(); onCloseTab(modelId); }}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active model context sub-header */}
      {activeRec && (
        <div className="shrink-0 px-3 py-2 bg-muted/20 border-b border-border/50">
          <p className="text-xs font-semibold text-foreground truncate">{activeRec.model?.name}</p>
          {activeRec.model?.grades && (
            <p className="text-[10px] text-muted-foreground">{activeRec.model.grades}</p>
          )}
        </div>
      )}

      {/* Persistent topic branches */}
      <div className="shrink-0 px-3 py-2 border-b border-border/50 bg-muted/10">
        <TopicTreeSelector
          onSelectTopic={handleTopicSelect}
          constraintFlags={constraintFlags}
          forceBranch={forceBranch}
          onClearForceBranch={onClearForceBranch}
          startExpanded={activeMessages.length === 0}
        />
      </div>

      {/* Message thread */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 scroll-smooth">
        {activeMessages.length === 0 && !isBusy ? (
          <p className="text-[10px] text-muted-foreground text-center">
            Ask anything about this model, or choose a topic above.
          </p>
        ) : (
          <>
            {activeMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2 max-w-[92%]",
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  msg.role === "assistant" ? "bg-primary/10" : "bg-muted"
                )}>
                  {msg.role === "assistant"
                    ? <Sparkles className="w-3 h-3 text-primary" />
                    : <User className="w-3 h-3 text-muted-foreground" />}
                </div>
                <div className={cn(
                  "px-3 py-2 rounded-xl text-xs leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-none"
                    : "bg-muted text-foreground rounded-tl-none border border-border/50"
                )}>
                  {msg.streaming && !msg.content ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                    </span>
                  ) : (
                    <>
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                      {msg.streaming && (
                        <span className="inline-block w-0.5 h-3 bg-foreground/70 ml-0.5 animate-pulse align-middle" />
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Suggested follow-up chips — shown after a topic-specific response completes */}
            {activeFollowUps.length > 0 && !isBusy && activeMessages.length > 1 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] text-muted-foreground text-center">Suggested follow-ups</p>
                {activeFollowUps.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSendMessage(activeChatModelId, s, activeTopic)}
                    className="w-full text-left text-xs p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-foreground transition-colors leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {optimisticMsg && (
              <div className="flex gap-2 max-w-[92%] ml-auto flex-row-reverse">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="px-3 py-2 rounded-xl text-xs bg-primary text-primary-foreground rounded-tr-none">
                  {optimisticMsg}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Input + disclaimer */}
      <div className="shrink-0 border-t border-border bg-white">
        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this model…"
            className="flex-1 min-h-[36px] max-h-[120px] resize-none py-2 px-2.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring overflow-y-auto"
            rows={1}
            disabled={isBusy}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={!input.trim() || isBusy}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
        <p className="text-[9px] text-muted-foreground text-center mt-1.5">
          Model Advisor is AI-powered and can make mistakes. Please double-check responses.
        </p>
      </div>
    </div>
  );
}

// --- RecommendationsView (full-screen, step 7 entry point) ---
function RecommendationsView({ sessionId, stepData, forceRefreshKey = 0 }: { sessionId: string; stepData: Record<string, any>; forceRefreshKey?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const hasAutoGenerated = useRef(false);
  const lastForceRefreshKey = useRef(0);
  const [lastGenStepData, setLastGenStepData] = useState<string>("");

  // ---- Data fetching (same logic as RecommendationsPanel) ----
  const { data: models = [], isLoading: isLoadingModels } = useQuery<any[]>({
    queryKey: ['/api/models'],
    queryFn: async () => {
      const res = await fetch('/api/models', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    },
  });

  const { data: recommendations = [], isLoading: isLoadingRecs } = useQuery<any[]>({
    queryKey: [api.models.getRecommendations.path, sessionId],
    queryFn: async () => {
      const url = buildUrl(api.models.getRecommendations.path, { sessionId });
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.models.recommend.path, { sessionId });
      const res = await fetch(url, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate recommendations');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.models.getRecommendations.path, sessionId] });
      setLastGenStepData(JSON.stringify(stepData));
      toast({ title: "Recommendations generated", description: "Model matches have been computed from your decision frame." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate recommendations.", variant: "destructive" });
    },
  });

  const currentStepDataStr = JSON.stringify(stepData);
  const isStale = recommendations.length > 0 && lastGenStepData !== "" && currentStepDataStr !== lastGenStepData;

  useEffect(() => {
    if (recommendations.length > 0 && lastGenStepData === "") {
      setLastGenStepData(JSON.stringify(stepData));
    }
  }, [recommendations.length, stepData, lastGenStepData]);

  // Triggered when the user clicks "Generate Model Recommendations" from the Decision Frame
  useEffect(() => {
    if (forceRefreshKey > 0 && forceRefreshKey !== lastForceRefreshKey.current && !generateMutation.isPending) {
      lastForceRefreshKey.current = forceRefreshKey;
      generateMutation.mutate();
    }
  }, [forceRefreshKey, generateMutation.isPending]);

  useEffect(() => {
    if (
      !!sessionId &&
      models.length > 0 &&
      !isLoadingModels &&
      !isLoadingRecs &&
      recommendations.length === 0 &&
      !hasAutoGenerated.current &&
      !generateMutation.isPending
    ) {
      hasAutoGenerated.current = true;
      generateMutation.mutate();
    }
  }, [sessionId, models.length, isLoadingModels, isLoadingRecs, recommendations.length, generateMutation.isPending]);

  // ---- UI state ----
  const [showAll, setShowAll] = useState(false);
  const [exploredModelIds, setExploredModelIds] = useState<number[]>([]);
  const [activeChatModelId, setActiveChatModelId] = useState<number | null>(null);
  const [chatHistories, setChatHistories] = useState<Record<number, LocalChatMessage[]>>({});
  const [pendingModelId, setPendingModelId] = useState<number | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Record<number, string | null>>({});
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<Record<number, string[]>>({});

  // ---- Chat message sender (streaming) ----
  const sendModelMessage = useCallback(async (modelId: number, message: string, topic?: string | null) => {
    const isGreeting = message === "__greeting__";
    if (!isGreeting) {
      setOptimisticMessages(prev => ({ ...prev, [modelId]: message }));
    }
    setPendingModelId(modelId);

    const assistantMsgId = crypto.randomUUID();
    const userMsg: LocalChatMessage | null = isGreeting ? null : {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      modelId,
    };

    // Insert placeholder assistant message immediately so the UI shows a streaming state
    const placeholderMsg: LocalChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      modelId,
      streaming: true,
    };
    setChatHistories(prev => ({
      ...prev,
      [modelId]: [...(prev[modelId] || []), ...(userMsg ? [userMsg] : []), placeholderMsg],
    }));
    setOptimisticMessages(prev => ({ ...prev, [modelId]: null }));

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

        // Process complete SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.token !== undefined) {
              setChatHistories(prev => {
                const history = prev[modelId] ?? [];
                return {
                  ...prev,
                  [modelId]: history.map(m =>
                    m.id === assistantMsgId
                      ? { ...m, content: m.content + payload.token }
                      : m
                  ),
                };
              });
            } else if (payload.suggestedFollowUps) {
              setSuggestedFollowUps(prev => ({ ...prev, [modelId]: payload.suggestedFollowUps }));
            } else if (payload.done || payload.error) {
              setChatHistories(prev => {
                const history = prev[modelId] ?? [];
                return {
                  ...prev,
                  [modelId]: history.map(m =>
                    m.id === assistantMsgId ? { ...m, streaming: false } : m
                  ),
                };
              });
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch {
      // Remove the placeholder on error
      setChatHistories(prev => {
        const history = prev[modelId] ?? [];
        return {
          ...prev,
          [modelId]: history.filter(m => m.id !== assistantMsgId),
        };
      });
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
    } finally {
      setPendingModelId(null);
    }
  }, [sessionId, toast]);

  const handleExploreModel = useCallback((modelId: number) => {
    const existing = chatHistories[modelId] ?? [];
    const isStale = existing.length > 0 && existing.some(m => m.modelId === undefined || m.modelId !== modelId);
    if (isStale) {
      setChatHistories(prev => { const n = { ...prev }; delete n[modelId]; return n; });
    }
    if (!exploredModelIds.includes(modelId)) {
      setExploredModelIds(prev => [...prev, modelId]);
    }
    if (!existing.length || isStale) {
      sendModelMessage(modelId, "__greeting__");
    }
    setActiveChatModelId(modelId);
  }, [exploredModelIds, chatHistories, sendModelMessage]);

  const [forceBranch, setForceBranch] = useState<string | null>(null);

  const handleAskAI = useCallback((modelId: number, topic: string) => {
    const existing = chatHistories[modelId] ?? [];
    const isStale = existing.length > 0 && existing.some(m => m.modelId === undefined || m.modelId !== modelId);
    if (isStale) {
      setChatHistories(prev => { const n = { ...prev }; delete n[modelId]; return n; });
    }
    if (!exploredModelIds.includes(modelId)) {
      setExploredModelIds(prev => [...prev, modelId]);
    }
    setActiveChatModelId(modelId);

    if (topic === "model") {
      setForceBranch(topic);
    } else if (topic.startsWith("watchout:")) {
      const domain = topic.slice("watchout:".length);
      setActiveTopic(topic);
      sendModelMessage(modelId, `Let's discuss the watch out for ${domain}.`, topic);
    }
  }, [exploredModelIds, chatHistories, sendModelMessage]);

  const handleCloseChat = useCallback(() => {
    setActiveChatModelId(null);
    setActiveTopic(null);
  }, []);

  const handleClearConversation = useCallback(async (modelId: number) => {
    // Clear server-side conversation history for this model
    await fetch(`/api/sessions/${sessionId}/chat/model-conversation/${modelId}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => {}); // best-effort
    // Clear local chat state for this model
    setChatHistories(prev => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
    // Trigger a fresh greeting
    sendModelMessage(modelId, "__greeting__");
  }, [sessionId, sendModelMessage]);

  const handleCloseTab = useCallback((modelId: number) => {
    setExploredModelIds(prev => {
      const remaining = prev.filter(id => id !== modelId);
      if (activeChatModelId === modelId) {
        setActiveChatModelId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
      }
      return remaining;
    });
  }, [activeChatModelId]);

  // ---- Loading / empty states ----
  if (models.length === 0 && !isLoadingModels) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30">
        <div className="text-center max-w-sm px-6">
          <LayoutGrid className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Models Available</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Import learning models first via admin settings, then return here.
          </p>
          <Link href="/admin/import">
            <Button variant="outline" size="sm" data-testid="link-import-models-cta">
              <Upload className="w-4 h-4 mr-2" /> Import Models
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoadingModels || isLoadingRecs || generateMutation.isPending) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {generateMutation.isPending ? "Finding your best model matches…" : "Loading recommendations…"}
          </p>
        </div>
      </div>
    );
  }

  // ---- Main render ----
  const TOP_N = 3;
  const topRecs = recommendations.slice(0, TOP_N);
  const moreRecs = recommendations.slice(TOP_N);
  const displayedRecs = showAll ? recommendations : topRecs;

  return (
    <ResizablePanelGroup direction="horizontal" className="w-full h-full overflow-hidden">
      {/* Left: model list */}
      <ResizablePanel id="model-list" order={1} minSize={30} className="min-w-0 flex flex-col h-full overflow-hidden">
        <ScrollArea className="flex-1 min-h-0 bg-muted/30">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6 pb-20">

            {/* Page header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground">Your Model Matches</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {recommendations.length > 0
                    ? `${recommendations.length} of ${models.length} models matched`
                    : models.length > 0
                      ? `0 of ${models.length} models matched`
                      : "No matches found yet"}
                </p>
                {models.length > 0 && recommendations.length < models.length && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {models.length - recommendations.length} model{models.length - recommendations.length !== 1 ? "s" : ""} did not qualify (blocked or scored below threshold)
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="shrink-0"
                data-testid="button-generate-recommendations"
              >
                {generateMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Sparkles className="w-4 h-4 mr-2" />}
                Refresh
              </Button>
            </div>

            {/* Stale alert */}
            {isStale && (
              <Alert className="border-primary/30 bg-primary/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Decision frame updated</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3 mt-1">
                  <span className="text-sm">Your earlier inputs have changed. Refresh to see updated matches.</span>
                  <Button
                    size="sm"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    data-testid="button-refresh-stale-recommendations"
                  >
                    {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                    Refresh
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Model cards */}
            {recommendations.length > 0 ? (
              <div className="space-y-4">
                {displayedRecs.map((rec: any, i: number) => (
                  <ModelCard
                    key={rec.id ?? i}
                    rec={rec}
                    stepData={stepData}
                    sessionId={sessionId}
                    onExplore={handleExploreModel}
                    onAskAI={handleAskAI}
                    isExploring={activeChatModelId === rec.modelId}
                    rank={i + 1}
                  />
                ))}

                {!showAll && moreRecs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="w-full py-3 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl hover:border-border/80 transition-colors"
                  >
                    Show {moreRecs.length} more model{moreRecs.length !== 1 ? "s" : ""}
                  </button>
                )}

                {showAll && moreRecs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(false)}
                    className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Show fewer
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <LayoutGrid className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-foreground mb-1">No matching models found</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                  No models matched your current decision frame. Try adjusting your outcomes or practices in earlier steps.
                </p>
                <Button variant="outline" size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                  {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </ResizablePanel>

      {/* Right: model chat panel */}
      {activeChatModelId !== null && (
        <>
          <ResizableHandle withHandle className="shrink-0" />
          <ResizablePanel
            id="model-chat"
            order={2}
            defaultSize={40}
            minSize={20}
            maxSize={75}
            className="min-w-0 border-l border-border flex flex-col h-full"
          >
            <ModelChatPanel
              sessionId={sessionId}
              exploredModelIds={exploredModelIds}
              activeChatModelId={activeChatModelId}
              recommendations={recommendations}
              chatHistories={chatHistories}
              pendingModelId={pendingModelId}
              optimisticMessages={optimisticMessages}
              activeTopic={activeTopic}
              suggestedFollowUps={suggestedFollowUps}
              forceBranch={forceBranch}
              onSwitchModel={setActiveChatModelId}
              onCloseTab={handleCloseTab}
              onClose={handleCloseChat}
              onSendMessage={sendModelMessage}
              onSetTopic={setActiveTopic}
              onClearConversation={handleClearConversation}
              onClearForceBranch={() => setForceBranch(null)}
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}

function RecommendationsPanel({ sessionId, stepData, onExploreModel }: { sessionId: string; stepData: Record<string, any>; onExploreModel?: (modelId: number) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const hasAutoGenerated = useRef(false);
  // Track the stepData snapshot at the time recommendations were last generated
  const [lastGenStepData, setLastGenStepData] = useState<string>("");

  const { data: progress } = useWorkflowProgress(sessionId);

  const { data: models = [], isLoading: isLoadingModels } = useQuery<any[]>({
    queryKey: ['/api/models'],
    queryFn: async () => {
      const res = await fetch('/api/models', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    },
  });

  const { data: recommendations = [], isLoading: isLoadingRecs } = useQuery<any[]>({
    queryKey: [api.models.getRecommendations.path, sessionId],
    queryFn: async () => {
      const url = buildUrl(api.models.getRecommendations.path, { sessionId });
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    enabled: !!sessionId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.models.recommend.path, { sessionId });
      const res = await fetch(url, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to generate recommendations');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.models.getRecommendations.path, sessionId] });
      setLastGenStepData(JSON.stringify(stepData));
      toast({ title: "Recommendations generated", description: "Model matches have been computed from your decision frame." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate recommendations.", variant: "destructive" });
    },
  });

  // Compare current stepData to what was used when recommendations were last generated.
  // Only show "stale" if the actual inputs changed, not just timestamps.
  const currentStepDataStr = JSON.stringify(stepData);
  const isStale = recommendations.length > 0 && lastGenStepData !== "" && currentStepDataStr !== lastGenStepData;

  // When recommendations already exist on load, snapshot the current stepData
  // so we have a baseline to compare against for staleness.
  useEffect(() => {
    if (recommendations.length > 0 && lastGenStepData === "") {
      setLastGenStepData(JSON.stringify(stepData));
    }
  }, [recommendations.length, stepData, lastGenStepData]);

  // Auto-generate once when entering step 7 with no recommendations.
  // hasAutoGenerated prevents infinite loops when the engine returns 0 results.
  useEffect(() => {
    if (
      !!sessionId &&
      models.length > 0 &&
      !isLoadingModels &&
      !isLoadingRecs &&
      recommendations.length === 0 &&
      !hasAutoGenerated.current &&
      !generateMutation.isPending
    ) {
      hasAutoGenerated.current = true;
      generateMutation.mutate();
    }
  }, [sessionId, models.length, isLoadingModels, isLoadingRecs, recommendations.length, generateMutation.isPending]);

  if (models.length === 0 && !isLoadingModels) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="py-8 text-center">
          <LayoutGrid className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Models Available</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Import learning models first via the admin settings. The advisor will then match your decision frame against available models.
          </p>
          <Link href="/admin/import">
            <Button variant="outline" size="sm" className="mt-4" data-testid="link-import-models-cta">
              <Upload className="w-4 h-4 mr-2" /> Import Models
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isLoadingModels || isLoadingRecs || generateMutation.isPending) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {generateMutation.isPending ? "Generating recommendations from your decision frame..." : "Loading recommendations..."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-primary" />
              Model Recommendations
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {recommendations.length > 0
                ? `${recommendations.length} of ${models.length} models matched`
                : `0 of ${models.length} models matched`}
            </p>
            {models.length > 0 && recommendations.length < models.length && (
              <p className="text-xs text-muted-foreground">
                {models.length - recommendations.length} model{models.length - recommendations.length !== 1 ? "s" : ""} did not qualify
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-recommendations"
          >
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {recommendations.length > 0 ? "Refresh" : "Generate"} Recommendations
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isStale && (
          <Alert className="mb-4 border-primary/30 bg-primary/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Decision frame updated</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3 mt-2">
              <span>Your choices in earlier steps have changed. Refresh recommendations to see updated matches.</span>
              <Button
                size="sm"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                data-testid="button-refresh-stale-recommendations"
              >
                {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Refresh Recommendations
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {recommendations.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recommendations.map((rec: any, i: number) => {
              const m = rec.model || {};
              const desc = (m.description ?? "").slice(0, 120);
              const imageUrl = m.imageUrl ?? "";
              const grades = m.grades ?? "";
              const modelName = m.name ?? `Model ${i + 1}`;
              const align = rec.alignment || {};

              // Use separate score breakdowns directly
              const outcomesScore = align.outcomesScore || { label: "None", pct: 0, matches: [] };
              const leapsScore = align.leapsScore || { label: "None", pct: 0, matches: [] };
              const practicesScore = align.practicesScore || { label: "None", pct: 0, matches: [] };
              const constraintFlags: { domain: string; detail: string }[] = align.constraintFlags || [];
              const contextNotes: string[] = align.contextNotes || [];
              const gradeBandMatch = align.gradeBandMatch !== false;

              const labelColor = (label: string) => {
                if (label === "High") return "bg-emerald-100 text-emerald-800 border-emerald-200";
                if (label === "Medium") return "bg-amber-100 text-amber-800 border-amber-200";
                if (label === "Low") return "bg-red-100 text-red-800 border-red-200";
                return "bg-muted text-muted-foreground border-border";
              };

              return (
                <Collapsible key={rec.id ?? i} asChild>
                  <div className="group rounded-xl border border-border/80 bg-card overflow-hidden transition-shadow hover:shadow-lg flex flex-col">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="w-full text-left flex flex-col flex-1 hover:bg-muted/20 transition-colors"
                      >
                        {/* Image */}
                        <div className="aspect-[5/2] bg-muted/50 overflow-hidden">
                          {imageUrl ? (
                            <img src={imageUrl} alt={modelName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                              <LayoutGrid className="w-10 h-10 text-primary/40" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-3">
                          {/* Name + grades */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={`/models/${rec.modelId}?session=${sessionId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {modelName}
                            </Link>
                            {grades && (
                              <Badge variant="secondary" className="text-[10px] font-normal shrink-0">{grades}</Badge>
                            )}
                            {!gradeBandMatch && (
                              <Badge variant="outline" className="text-[10px] border-red-200 text-red-700 bg-red-50 shrink-0">Grade mismatch</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{desc}{desc.length >= 120 ? "…" : ""}</p>

                          {/* Alignment indicators */}
                          <div className="flex flex-wrap gap-2">
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", labelColor(outcomesScore.label))}>
                              Outcomes: {outcomesScore.label}
                            </span>
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", labelColor(leapsScore.label))}>
                              LEAPs: {leapsScore.label}
                            </span>
                            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border", labelColor(practicesScore.label))}>
                              Practices: {practicesScore.label}
                            </span>
                            <span className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                              constraintFlags.length > 0
                                ? "bg-amber-100 text-amber-800 border-amber-200"
                                : "bg-emerald-100 text-emerald-800 border-emerald-200"
                            )}>
                              Constraints: {constraintFlags.length > 0 ? `${constraintFlags.length} Found` : "None Detected"}
                            </span>
                          </div>

                          <div className="mt-auto pt-1 flex items-center justify-end">
                            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                          </div>
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4 mx-0">
                        {/* Outcomes detail */}
                        {outcomesScore.matches && outcomesScore.matches.length > 0 && (
                          <div>
                            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Outcomes ({outcomesScore.label})</p>
                            <div className="space-y-0.5">
                              {outcomesScore.matches.map((m: any, j: number) => (
                                <div key={j} className="flex items-center gap-2 text-xs">
                                  {m.matched ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : (
                                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  )}
                                  <span className={cn(m.matched ? "text-foreground" : "text-muted-foreground")}>
                                    {m.name}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                                    {m.importance === "most_important" ? "Must Have" : m.importance === "important" ? "Important" : "Nice to Have"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* LEAPs detail */}
                        {leapsScore.matches && leapsScore.matches.length > 0 && (
                          <div>
                            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">LEAPs ({leapsScore.label})</p>
                            <div className="space-y-0.5">
                              {leapsScore.matches.map((m: any, j: number) => (
                                <div key={j} className="flex items-center gap-2 text-xs">
                                  {m.matched ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : (
                                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  )}
                                  <span className={cn(m.matched ? "text-foreground" : "text-muted-foreground")}>
                                    {m.name}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                                    {m.importance === "most_important" ? "Must Have" : m.importance === "important" ? "Important" : "Nice to Have"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Practices detail */}
                        {practicesScore.matches && practicesScore.matches.length > 0 && (
                          <div>
                            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Practices ({practicesScore.label})</p>
                            <div className="space-y-0.5">
                              {practicesScore.matches.map((m: any, j: number) => (
                                <div key={j} className="flex items-center gap-2 text-xs">
                                  {m.matched ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : (
                                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  )}
                                  <span className={cn(m.matched ? "text-foreground" : "text-muted-foreground")}>
                                    {m.name}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/60 ml-auto shrink-0">
                                    {m.importance === "most_important" ? "Must Have" : m.importance === "important" ? "Important" : "Nice to Have"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Constraints detail */}
                        {constraintFlags.length > 0 && (
                          <div>
                            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Constraints</p>
                            <div className="space-y-1">
                              {constraintFlags.map((flag: any, j: number) => (
                                <div key={j} className="flex items-start gap-2 text-xs">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-medium text-foreground">{flag.domain}:</span>{" "}
                                    <span className="text-muted-foreground">{flag.detail}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Context / alignment notes */}
                        {contextNotes.length > 0 && (
                          <div>
                            <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Alignment Notes</p>
                            <div className="space-y-1">
                              {contextNotes.map((note: string, j: number) => (
                                <p key={j} className="text-xs text-muted-foreground">{note}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 mt-2">
                          <Link href={`/models/${rec.modelId}?session=${sessionId}`}>
                            <Button variant="outline" size="sm" className="gap-2">
                              View Full Model <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          {onExploreModel && (
                            <Button
                              size="sm"
                              className="gap-2 bg-primary hover:bg-primary/90"
                              onClick={(e) => { e.stopPropagation(); onExploreModel(rec.modelId); }}
                            >
                              <Bot className="w-3.5 h-3.5" /> Explore This Model
                            </Button>
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <LayoutGrid className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">No matching models found</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No models matched your current decision frame. Try going back to earlier steps to add outcomes, practices, or preferences, then return here to generate recommendations.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Try Again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
