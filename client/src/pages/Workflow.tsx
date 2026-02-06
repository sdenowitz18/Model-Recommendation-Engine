import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/use-advisor";
import { api, buildUrl, type StepChatResponse } from "@shared/routes";
import { WORKFLOW_STEPS, type WorkflowProgress, type StepConversation, type StepDocument } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  Send, Sparkles, User, Loader2, RotateCcw, Check, ChevronRight,
  Upload, FileText, X, Settings, ArrowRight, RefreshCcw, School,
  Target, BookOpen, AlertTriangle, Sliders, LayoutGrid, ClipboardCheck
} from "lucide-react";

const STEP_ICONS: Record<number, any> = {
  1: School,
  2: Target,
  3: BookOpen,
  4: AlertTriangle,
  5: Sliders,
  6: ClipboardCheck,
  7: LayoutGrid,
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

export default function Workflow() {
  const { sessionId, isLoading: isSessionLoading } = useSession();
  const { data: progress, refetch: refetchProgress } = useWorkflowProgress(sessionId);
  const [activeStep, setActiveStep] = useState(1);
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (progress) {
      setActiveStep(progress.currentStep);
    }
  }, [progress?.currentStep]);

  const confirmStepMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      const url = buildUrl(api.workflow.confirmStep.path, { sessionId: sessionId! });
      return apiRequest("POST", url, { stepNumber });
    },
    onSuccess: () => {
      refetchProgress();
      toast({ title: "Step confirmed", description: "Moving to the next step." });
    },
  });

  const resetStepMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      const url = buildUrl(api.workflow.resetStep.path, { sessionId: sessionId! });
      return apiRequest("POST", url, { stepNumber });
    },
    onSuccess: (_, stepNumber) => {
      refetchProgress();
      qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, stepNumber] });
      qc.invalidateQueries({ queryKey: [api.workflow.getDocuments.path, sessionId, stepNumber] });
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
      WORKFLOW_STEPS.forEach(s => {
        qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, s.number] });
        qc.invalidateQueries({ queryKey: [api.workflow.getDocuments.path, sessionId, s.number] });
      });
      setActiveStep(1);
      toast({ title: "All steps reset", description: "Starting completely fresh." });
    },
  });

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar Stepper */}
      <aside className="w-[280px] shrink-0 h-full border-r border-border bg-muted/30 flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-display font-bold text-primary tracking-tight">Transcend</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest -mt-0.5">Model Advisor</span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3 space-y-1">
            {WORKFLOW_STEPS.map((step) => {
              const isCompleted = stepsCompleted.includes(step.number);
              const isActive = activeStep === step.number;
              const isAccessible = step.number <= Math.max(...stepsCompleted, 0) + 1 || step.number === 1;
              const StepIcon = STEP_ICONS[step.number] || FileText;

              return (
                <button
                  key={step.number}
                  onClick={() => isAccessible && setActiveStep(step.number)}
                  disabled={!isAccessible}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-md text-left transition-colors",
                    isActive && "bg-primary/10 text-primary",
                    !isActive && isAccessible && "hover-elevate text-foreground",
                    !isAccessible && "opacity-40 cursor-not-allowed"
                  )}
                  data-testid={`button-step-${step.number}`}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-xs font-bold",
                    isCompleted && "bg-primary text-white",
                    isActive && !isCompleted && "bg-primary/20 text-primary border border-primary/30",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground border border-border"
                  )}>
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      isActive && "text-primary font-semibold"
                    )}>
                      {step.label}
                    </p>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border space-y-2">
          <Link href="/admin/settings">
            <Button variant="ghost" size="sm" className="w-full justify-start" data-testid="button-settings">
              <Settings className="w-4 h-4 mr-2" /> Settings
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive"
            onClick={() => resetAllMutation.mutate()}
            disabled={resetAllMutation.isPending}
            data-testid="button-reset-all"
          >
            {resetAllMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            Start Completely Fresh
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-hidden flex">
        <StepContent
          sessionId={sessionId}
          stepNumber={activeStep}
          stepData={stepData}
          stepsCompleted={stepsCompleted}
          onConfirmStep={(step) => confirmStepMutation.mutate(step)}
          onResetStep={(step) => resetStepMutation.mutate(step)}
          isConfirming={confirmStepMutation.isPending}
        />
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
}

function StepContent({ sessionId, stepNumber, stepData, stepsCompleted, onConfirmStep, onResetStep, isConfirming }: StepContentProps) {
  const step = WORKFLOW_STEPS.find(s => s.number === stepNumber)!;
  const isCompleted = stepsCompleted.includes(stepNumber);
  const currentStepData = stepData[String(stepNumber)];

  return (
    <div className="flex w-full h-full">
      {/* Chat Panel */}
      <div className="w-[420px] xl:w-[460px] shrink-0 h-full border-r border-border">
        <StepChat sessionId={sessionId} stepNumber={stepNumber} />
      </div>

      {/* Step Summary Panel */}
      <div className="flex-1 h-full overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border bg-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={isCompleted ? "default" : "secondary"} className="text-xs">
                  Step {stepNumber} of 7
                </Badge>
                {isCompleted && <Badge variant="outline" className="text-xs text-primary border-primary/30">Confirmed</Badge>}
              </div>
              <h1 className="text-xl font-display font-bold text-foreground">{step.label}</h1>
              <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isCompleted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onResetStep(stepNumber)}
                  data-testid="button-reset-step"
                >
                  <RotateCcw className="w-4 h-4 mr-2" /> Reset Step
                </Button>
              )}
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

        <ScrollArea className="flex-1 bg-muted/40">
          <div className="p-6 max-w-4xl mx-auto space-y-6 pb-20">
            {stepNumber === 6 && (
              <DecisionFramePanel stepData={stepData} stepsCompleted={stepsCompleted} />
            )}

            {stepNumber === 7 && (
              <RecommendationsPanel sessionId={sessionId} stepData={stepData} />
            )}

            <StepDocumentsPanel sessionId={sessionId} stepNumber={stepNumber} />

            <StepDataPanel currentStepData={currentStepData} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface StepChatProps {
  sessionId: string;
  stepNumber: number;
}

function StepChat({ sessionId, stepNumber }: StepChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [api.workflow.getConversation.path, sessionId, stepNumber] });
      qc.invalidateQueries({ queryKey: [api.workflow.getProgress.path, sessionId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send message. Please try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  useEffect(() => {
    setInput("");
  }, [stepNumber]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    chatMutation.mutate(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const step = WORKFLOW_STEPS.find(s => s.number === stepNumber)!;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-border bg-white/50 backdrop-blur-sm">
        <h2 className="text-base font-bold font-display text-primary flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Step {stepNumber}: {step.label}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Chat with the advisor to work through this step
        </p>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-4 scroll-smooth">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="bg-muted p-4 rounded-2xl rounded-tl-none border border-border/50 text-sm">
              <ReactMarkdown>
                {`Let's work on **${step.label}**. ${step.description}. Tell me what you have, and I'll help guide you through gathering what's needed.`}
              </ReactMarkdown>
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

      <div className="p-3 border-t border-border bg-white">
        <div className="relative flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="flex-1 min-h-[44px] max-h-[120px] resize-none py-2.5 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              accept=".txt,.csv,.xlsx,.xls,.md,.json,.pdf,.doc,.docx"
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

function DecisionFramePanel({ stepData, stepsCompleted }: { stepData: Record<string, any>; stepsCompleted: number[] }) {
  const priorSteps = WORKFLOW_STEPS.filter(s => s.number <= 5);
  const hasPriorData = priorSteps.some(s => stepData[String(s.number)] && Object.keys(stepData[String(s.number)]).length > 0);

  if (!hasPriorData) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="py-8 text-center">
          <ClipboardCheck className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">Decision Frame</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Complete steps 1 through 5 first. The decision frame will synthesize all your inputs into a consolidated summary for review before generating recommendations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          Decision Frame Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Review all inputs gathered from prior steps. Use the chat to confirm or adjust before generating recommendations.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {priorSteps.map(step => {
            const data = stepData[String(step.number)];
            const isStepDone = stepsCompleted.includes(step.number);
            if (!data || Object.keys(data).length === 0) {
              return (
                <div key={step.number} className="p-3 rounded-md bg-muted/50 border border-border/50">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{step.number}</Badge>
                    <span className="text-sm font-medium text-muted-foreground">{step.label}</span>
                    {!isStepDone && <Badge variant="secondary" className="text-xs">Incomplete</Badge>}
                  </div>
                </div>
              );
            }

            return (
              <div key={step.number} className="p-4 rounded-md bg-white border border-border/50">
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={isStepDone ? "default" : "secondary"} className="text-xs">{step.number}</Badge>
                  <span className="text-sm font-semibold">{step.label}</span>
                  {isStepDone && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <div className="space-y-2">
                  {Object.entries(data).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-3">
                      <span className="text-xs text-muted-foreground min-w-[120px] shrink-0 pt-0.5 uppercase tracking-wider">
                        {key.replace(/_/g, " ")}
                      </span>
                      <div className="text-sm text-foreground">
                        {Array.isArray(value) ? (
                          <div className="flex flex-wrap gap-1">
                            {(value as string[]).map((v, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{String(v)}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span>{String(value)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendationsPanel({ sessionId, stepData }: { sessionId: string; stepData: Record<string, any> }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: models = [], isLoading: isLoadingModels } = useQuery<any[]>({
    queryKey: ['/api/models'],
    queryFn: async () => {
      const res = await fetch('/api/models', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch models');
      return res.json();
    },
  });

  const { data: recommendations = [], isLoading: isLoadingRecs, refetch: refetchRecs } = useQuery<any[]>({
    queryKey: ['/api/sessions', sessionId, 'recommend'],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/recommend`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      return res.json();
    },
    enabled: !!sessionId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sessions/${sessionId}/recommend`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to generate recommendations');
      return res.json();
    },
    onSuccess: () => {
      refetchRecs();
      toast({ title: "Recommendations generated", description: "Model matches have been computed from your decision frame." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate recommendations.", variant: "destructive" });
    },
  });

  if (models.length === 0 && !isLoadingModels) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="py-8 text-center">
          <LayoutGrid className="w-8 h-8 text-primary mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Models Available</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Import school design models first via the admin settings. The advisor will then match your decision frame against available models.
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

  if (isLoadingModels || isLoadingRecs) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading recommendations...</p>
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
                ? `${recommendations.length} models matched from your decision frame.`
                : `${models.length} models available. Generate recommendations to find the best matches.`
              }
            </p>
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
        {recommendations.length > 0 ? (
          <div className="space-y-3">
            {recommendations.map((rec: any, i: number) => (
              <div key={rec.id || i} className="p-4 rounded-md bg-white border border-border/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">
                      {rec.model?.name || rec.name || `Model ${i + 1}`}
                    </h4>
                    {rec.model?.grades && (
                      <p className="text-xs text-muted-foreground mt-0.5">Grades: {rec.model.grades}</p>
                    )}
                    {rec.rationale && <p className="text-sm text-muted-foreground mt-1">{rec.rationale}</p>}
                    {rec.model?.link && (
                      <a
                        href={rec.model.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-2 inline-block"
                        data-testid={`link-model-${rec.modelId}`}
                      >
                        View details
                      </a>
                    )}
                  </div>
                  {rec.score != null && (
                    <div className="text-right shrink-0">
                      <span className="text-2xl font-bold text-primary">{rec.score}</span>
                      <p className="text-xs text-muted-foreground">score</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Click "Generate Recommendations" above to match your decision frame against {models.length} models in the database.
              You can also chat with the advisor for more nuanced guidance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
