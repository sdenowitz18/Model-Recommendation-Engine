import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RotateCcw, Settings, ArrowLeft, RefreshCw, Upload, X, FileText, BookOpen } from "lucide-react";
import { Link } from "wouter";
import { api } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { WORKFLOW_STEPS, type KnowledgeBaseEntry } from "@shared/schema";

interface ConfigResponse {
  systemPrompt: string;
  defaultPrompt: string;
  updatedAt: string | null;
}

interface StepConfigResponse {
  stepNumber: number;
  stepLabel: string;
  systemPrompt: string;
  defaultPrompt: string;
  updatedAt: string | null;
  isCustom: boolean;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("global");

  const { data: config, isLoading: isConfigLoading } = useQuery<ConfigResponse>({
    queryKey: [api.admin.getConfig.path],
  });

  const { data: stepConfigs = [], isLoading: isStepConfigsLoading } = useQuery<StepConfigResponse[]>({
    queryKey: [api.admin.getStepConfigs.path],
  });

  const { data: kbEntries = [], refetch: refetchKb } = useQuery<KnowledgeBaseEntry[]>({
    queryKey: [api.admin.getKnowledgeBase.path],
  });

  useEffect(() => {
    if (config?.systemPrompt) {
      setGlobalPrompt(config.systemPrompt);
    }
  }, [config]);

  const saveGlobalMutation = useMutation({
    mutationFn: async (prompt: string) => {
      return apiRequest("POST", api.admin.saveConfig.path, { systemPrompt: prompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.getConfig.path] });
      toast({ title: "Global instructions saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    },
  });

  if (isConfigLoading || isStepConfigsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Advisor
            </Button>
          </Link>
          <Link href="/admin/import">
            <Button variant="outline" size="sm" data-testid="link-import-models">
              <Upload className="w-4 h-4 mr-2" />
              Import Models
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Advisor Settings</h1>
            <p className="text-sm text-muted-foreground">Configure global and step-specific AI instructions, and manage the knowledge base.</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="global">Global Instructions</TabsTrigger>
            <TabsTrigger value="steps">Step Instructions</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
          </TabsList>

          <TabsContent value="global">
            <Card>
              <CardHeader>
                <CardTitle>Global System Prompt</CardTitle>
                <CardDescription>
                  These instructions define the advisor's identity, communication style, and overall workflow awareness. They are applied across all steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={globalPrompt}
                  onChange={(e) => setGlobalPrompt(e.target.value)}
                  placeholder="Enter global instructions..."
                  className="min-h-[400px] font-mono text-sm"
                  data-testid="input-global-prompt"
                />
                {config?.updatedAt && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(config.updatedAt).toLocaleString()}
                  </p>
                )}
                <div className="flex items-center gap-3 pt-4 border-t flex-wrap">
                  <Button
                    onClick={() => saveGlobalMutation.mutate(globalPrompt)}
                    disabled={saveGlobalMutation.isPending}
                    data-testid="button-save-global"
                  >
                    {saveGlobalMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => config?.systemPrompt && setGlobalPrompt(config.systemPrompt)}>
                    <RotateCcw className="w-4 h-4 mr-2" /> Undo
                  </Button>
                  <Button variant="outline" onClick={() => config?.defaultPrompt && setGlobalPrompt(config.defaultPrompt)}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Reset to Default
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="steps">
            <div className="space-y-4">
              {stepConfigs.map((sc) => (
                <StepConfigEditor key={sc.stepNumber} stepConfig={sc} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="knowledge">
            <KnowledgeBaseManager entries={kbEntries} onRefresh={refetchKb} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StepConfigEditor({ stepConfig }: { stepConfig: StepConfigResponse }) {
  const [prompt, setPrompt] = useState(stepConfig.systemPrompt);
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async (systemPrompt: string) => {
      const url = `/api/admin/step-configs/${stepConfig.stepNumber}`;
      return apiRequest("POST", url, { systemPrompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.getStepConfigs.path] });
      toast({ title: `Step ${stepConfig.stepNumber} instructions saved` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs">{stepConfig.stepNumber}</Badge>
            <div>
              <CardTitle className="text-base">{stepConfig.stepLabel}</CardTitle>
              {stepConfig.isCustom && (
                <span className="text-xs text-primary">Customized</span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
            data-testid={`input-step-${stepConfig.stepNumber}-prompt`}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              onClick={() => saveMutation.mutate(prompt)}
              disabled={saveMutation.isPending}
              size="sm"
              data-testid={`button-save-step-${stepConfig.stepNumber}`}
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPrompt(stepConfig.defaultPrompt)}>
              <RefreshCw className="w-4 h-4 mr-2" /> Reset to Default
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function KnowledgeBaseManager({ entries, onRefresh }: { entries: KnowledgeBaseEntry[]; onRefresh: () => void }) {
  const [newTitle, setNewTitle] = useState("");
  const [newStepNumber, setNewStepNumber] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.admin.addKnowledgeBase.path, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to add");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
      setNewTitle("");
      toast({ title: "Knowledge base entry added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add entry.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = `/api/admin/knowledge-base/${id}`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
      toast({ title: "Entry deleted" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newTitle.trim()) {
      if (!newTitle.trim()) {
        toast({ title: "Please enter a title first", variant: "destructive" });
      }
      return;
    }
    const formData = new FormData();
    formData.append("stepNumber", String(newStepNumber));
    formData.append("title", newTitle);
    formData.append("file", file);
    addMutation.mutate(formData);
    e.target.value = "";
  };

  const groupedEntries = WORKFLOW_STEPS.map(step => ({
    step,
    entries: entries.filter(e => e.stepNumber === step.number),
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Add Knowledge Base Entry
          </CardTitle>
          <CardDescription>
            Upload reference documents that the AI advisor should use when working through a specific step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., CCL Design Kit"
                data-testid="input-kb-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to Step</label>
              <select
                value={newStepNumber}
                onChange={(e) => setNewStepNumber(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                data-testid="select-kb-step"
              >
                {WORKFLOW_STEPS.map(s => (
                  <option key={s.number} value={s.number}>
                    Step {s.number}: {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".txt,.csv,.xlsx,.xls,.md,.json,.doc,.docx,.pptx,.ppt,.pdf"
              data-testid="input-kb-file"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={!newTitle.trim() || addMutation.isPending}
              data-testid="button-upload-kb"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload Document
            </Button>
          </div>
        </CardContent>
      </Card>

      {groupedEntries.map(({ step, entries: stepEntries }) => (
        stepEntries.length > 0 && (
          <Card key={step.number}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant="secondary">{step.number}</Badge>
                {step.label}
                <span className="text-muted-foreground font-normal text-sm">({stepEntries.length} entries)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stepEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.title}</p>
                        {entry.fileName && <p className="text-xs text-muted-foreground truncate">{entry.fileName}</p>}
                        <p className="text-xs text-muted-foreground">{entry.content.length} characters</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(entry.id)}
                      data-testid={`button-delete-kb-${entry.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      ))}

      {entries.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No knowledge base entries yet. Add reference documents above.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
