import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Save, RotateCcw, Settings, ArrowLeft, RefreshCw, Upload, X,
  FileText, BookOpen, Plus, Pencil, Trash2, Sparkles, Target, AlertTriangle,
  ShieldAlert, Eye, Sliders, Zap, Database, Link2, FileSpreadsheet,
  ChevronDown, ChevronRight, Table2, Bot, ExternalLink, DollarSign,
} from "lucide-react";
import { Link } from "wouter";
import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  WORKFLOW_STEPS, OUTCOME_GROUPS, PRACTICE_GROUPS,
  type KnowledgeBaseEntry, type TaxonomyItem, type ModelFieldDef,
  type ScoringRule, type ScoringConfig, type Model,
} from "@shared/schema";

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
  const [activeTab, setActiveTab] = useState("scoring");

  const restoreDefaultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", api.admin.restoreDefaults.path, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.getConfig.path] });
      queryClient.invalidateQueries({ queryKey: [api.admin.getStepConfigs.path] });
      [2, 3].forEach((s) => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/taxonomy", s] });
        queryClient.invalidateQueries({ queryKey: [api.taxonomy.getItems.path, s] });
      });
      toast({
        title: "Defaults restored",
        description: "Taxonomy, AI persona, and step instructions have been reset. Re-sync models and re-upload knowledge base documents as needed.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
          <Link href="/workflow">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Advisor
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => restoreDefaultsMutation.mutate()}
            disabled={restoreDefaultsMutation.isPending}
            className="text-amber-700 border-amber-200 hover:bg-amber-50"
          >
            {restoreDefaultsMutation.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <AlertTriangle className="w-4 h-4 mr-2" />}
            Restore All Defaults
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Admin Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure scoring rules, manage models, and customize the AI for the Model Engagement step.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="scoring">Scoring Rules</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="engagement">Model Engagement</TabsTrigger>
            <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
            <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
          </TabsList>

          <TabsContent value="scoring">
            <ScoringRulesManager />
          </TabsContent>

          <TabsContent value="models">
            <ModelsTab />
          </TabsContent>

          <TabsContent value="engagement">
            <ModelEngagementTab />
          </TabsContent>

          <TabsContent value="taxonomy">
            <TaxonomyManagerWrapper />
          </TabsContent>

          <TabsContent value="knowledge-base">
            <KnowledgeBaseTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL ENGAGEMENT TAB
// Consolidates: Global Instructions (AI Persona) + Step 8 Instructions
// ─────────────────────────────────────────────────────────────────────────────

function ModelEngagementTab() {
  const { toast } = useToast();
  const [globalPrompt, setGlobalPrompt] = useState("");

  const { data: config, isLoading: isConfigLoading } = useQuery<ConfigResponse>({
    queryKey: [api.admin.getConfig.path],
  });

  const { data: stepConfigs = [], isLoading: isStepConfigsLoading } = useQuery<StepConfigResponse[]>({
    queryKey: [api.admin.getStepConfigs.path],
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
      toast({ title: "AI persona saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    },
  });

  const step8Config = stepConfigs.find((sc) => sc.stepNumber === 8);

  if (isConfigLoading || isStepConfigsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Section 1: AI Persona & Behavior */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            AI Persona &amp; Behavior
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Defines the AI's identity, communication style, and knowledge of the overall workflow.
            Applied to all AI interactions — most importantly the Model Engagement chat.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Textarea
              value={globalPrompt}
              onChange={(e) => setGlobalPrompt(e.target.value)}
              placeholder="Enter AI persona and behavior instructions..."
              className="min-h-[400px] font-mono text-sm"
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
              >
                {saveGlobalMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Save className="w-4 h-4 mr-2" />}
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
      </div>

      {/* Section 2: Model Engagement Instructions (Step 8) */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Model Engagement Instructions
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Step-specific instructions for when a user chats with the AI about a specific recommended model
            at the end of the workflow. Layered on top of the AI persona above.
          </p>
        </div>
        {step8Config ? (
          <StepConfigEditor stepConfig={step8Config} />
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Step 8 configuration not found.
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODELS TAB
// Merges: Airtable config + sync + Excel import + model spreadsheet view
// ─────────────────────────────────────────────────────────────────────────────

function ModelsTab() {
  const { toast } = useToast();
  const [baseId, setBaseId] = useState("");
  const [tableId, setTableId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);

  const { data: airtableConfig, refetch: refetchAirtable } = useQuery<{
    baseId: string | null;
    tableId: string | null;
    apiTokenConfigured: boolean;
  }>({
    queryKey: ["/api/admin/airtable-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/airtable-config", { credentials: "include" });
      const text = await res.text();
      if (!res.ok) throw new Error("Failed to fetch config");
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("Invalid response from server");
      }
    },
  });

  const { data: models = [], refetch: refetchModels, isLoading: isLoadingModels } = useQuery<Model[]>({
    queryKey: [api.models.list.path],
    queryFn: async () => {
      const r = await fetch(api.models.list.path);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const { data: fieldDefs = [] } = useQuery<ModelFieldDef[]>({
    queryKey: [api.admin.getModelFieldDefs.path],
    queryFn: async () => {
      const r = await fetch(api.admin.getModelFieldDefs.path);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  useEffect(() => {
    if (airtableConfig) {
      setBaseId(airtableConfig.baseId ?? "");
      setTableId(airtableConfig.tableId ?? "");
    }
  }, [airtableConfig]);

  const saveAirtableConfigMutation = useMutation({
    mutationFn: async () => {
      const payload: { baseId?: string; tableId?: string; apiToken?: string } = {
        baseId: baseId.trim() || undefined,
        tableId: tableId.trim() || undefined,
      };
      if (apiToken.trim()) payload.apiToken = apiToken.trim();
      const res = await fetch("/api/admin/airtable-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      refetchAirtable();
      setApiToken("");
      toast({ title: "Airtable config saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleAirtableSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/admin/refresh-from-airtable", { method: "POST" });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Sync failed");
      }
      const result = await response.json();
      await refetchModels();
      toast({ title: "Sync successful", description: result.message });
    } catch (error: any) {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/admin/import-models", { method: "POST", body: formData });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Import failed");
      }
      const result = await response.json();
      await refetchModels();
      toast({ title: "Import successful", description: result.message });
      setFile(null);
    } catch (error: any) {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Airtable Connection */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            Airtable Connection
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect to your Airtable base to sync model data.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">API Token</label>
                <Input
                  type="password"
                  placeholder={
                    airtableConfig?.apiTokenConfigured
                      ? "•••••••• (configured — enter new to update)"
                      : "e.g. patXXXXXXXXXXXXXX"
                  }
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Base ID</label>
                <Input
                  placeholder="e.g. appXXXXXXXXXXXXXX"
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Table ID</label>
                <Input
                  placeholder="e.g. tblXXXXXXXXXXXXXX"
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                onClick={() => saveAirtableConfigMutation.mutate()}
                disabled={saveAirtableConfigMutation.isPending}
              >
                {saveAirtableConfigMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Save className="w-4 h-4 mr-2" />}
                Save Connection
              </Button>
              {baseId && tableId && (
                <a
                  href={`https://airtable.com/${baseId}/${tableId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Airtable
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2: Sync & Import */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Sync &amp; Import
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sync from Airtable replaces all models. Excel import appends to existing models.
          </p>
        </div>
        <div className="space-y-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium">Sync from Airtable</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Replaces all existing models with fresh data from your connected Airtable table.
                  </p>
                </div>
                <Button
                  onClick={handleAirtableSync}
                  disabled={isSyncing}
                  className="shrink-0"
                >
                  {isSyncing
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Syncing...</>
                    : <><RefreshCw className="w-4 h-4 mr-2" /> Sync from Airtable</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Excel import — collapsed by default */}
          <Card>
            <CardHeader
              className="cursor-pointer py-4"
              onClick={() => setShowExcelImport(!showExcelImport)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Excel Import (advanced)</span>
                </div>
                {showExcelImport
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </CardHeader>
            {showExcelImport && (
              <CardContent className="pt-0 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Upload a <code>.xlsx</code> file with a sheet named "Transcend Models". Appends to existing models.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    disabled={isUploading}
                    className="max-w-xs"
                  />
                  <Button onClick={handleUpload} disabled={!file || isUploading} size="sm">
                    {isUploading
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                      : <><Upload className="w-4 h-4 mr-2" /> Import</>}
                  </Button>
                </div>
                {file && <p className="text-xs text-muted-foreground">Selected: {file.name}</p>}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* Section 3: Model Data Spreadsheet */}
      <div>
        <div className="mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Table2 className="w-4 h-4 text-primary" />
                Model Data
                {models.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-normal">{models.length} models</Badge>
                )}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Read-only view of all models in the system with their attribute fields. Use this to verify
                scoring rules are triggering correctly.
              </p>
            </div>
          </div>
        </div>
        <ModelSpreadsheet
          models={Array.isArray(models) ? models : []}
          fieldDefs={Array.isArray(fieldDefs) ? fieldDefs : []}
          isLoading={isLoadingModels}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAG CELL — expandable comma-separated list displayed as badges
// ─────────────────────────────────────────────────────────────────────────────

function TagCell({ value, preview = 2 }: { value: string | null | undefined; preview?: number }) {
  const [expanded, setExpanded] = useState(false);

  if (!value || value.trim() === "") {
    return <span className="text-muted-foreground/40 text-xs">—</span>;
  }

  const items = value.split(",").map((s) => s.trim()).filter(Boolean);

  if (items.length === 0) {
    return <span className="text-muted-foreground/40 text-xs">—</span>;
  }

  const visible = expanded ? items : items.slice(0, preview);
  const hidden = items.length - preview;

  return (
    <div className="flex flex-wrap gap-1 items-start">
      {visible.map((item) => (
        <span
          key={item}
          className="inline-block bg-muted text-muted-foreground text-[10px] font-medium px-1.5 py-0.5 rounded"
        >
          {item}
        </span>
      ))}
      {!expanded && hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="inline-block bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors"
        >
          +{hidden} more
        </button>
      )}
      {expanded && items.length > preview && (
        <button
          onClick={() => setExpanded(false)}
          className="inline-block bg-muted text-muted-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors"
        >
          less
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL SPREADSHEET (read-only)
// ─────────────────────────────────────────────────────────────────────────────

function ModelSpreadsheet({
  models: modelsProp,
  fieldDefs: fieldDefsProp,
  isLoading,
}: {
  models: Model[];
  fieldDefs: ModelFieldDef[];
  isLoading: boolean;
}) {
  const models = Array.isArray(modelsProp) ? modelsProp : [];
  const fieldDefs = Array.isArray(fieldDefsProp) ? fieldDefsProp : [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading models...</p>
        </CardContent>
      </Card>
    );
  }

  if (models.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Database className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-base font-semibold mb-1">No Models</h3>
          <p className="text-sm text-muted-foreground">
            Sync from Airtable above to populate models.
          </p>
        </CardContent>
      </Card>
    );
  }

  const impactBadge = (val: string | undefined) => {
    if (!val || val === "" || val === "Unknown") {
      return <span className="text-xs text-muted-foreground">—</span>;
    }
    return <span className="text-xs font-medium">{val}</span>;
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/50 z-10 min-w-[200px]">
                Model Name
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[80px]">
                Grades
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[220px]">
                Outcomes
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[180px]">
                LEAPs
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[220px]">
                Practices
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[200px]">
                Implementation Supports
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[300px]">
                Description
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[80px]">
                URL
              </th>
              <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[60px]">
                Image
              </th>
              {fieldDefs.map((fd) => (
                <th
                  key={fd.key}
                  className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap min-w-[140px]"
                  title={fd.key}
                >
                  {fd.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {models.map((model) => {
              const attrs = (model.attributes ?? {}) as Record<string, string>;
              return (
                <tr key={model.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-3 sticky left-0 bg-white group-hover:bg-muted/20 z-10">
                    <Link href={`/models/${model.id}`}>
                      <span className="font-medium text-primary hover:underline cursor-pointer">
                        {model.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                    {model.grades || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <TagCell value={attrs.outcomes_list ?? model.outcomeTypes} />
                  </td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <TagCell value={attrs.leaps_list} />
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <TagCell value={attrs.practices_list ?? model.keyPractices} />
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="text-xs line-clamp-2 text-muted-foreground">{model.implementationSupports || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-4 py-3 max-w-[300px]">
                    <span className="text-xs line-clamp-2 text-muted-foreground">{model.description || <span className="text-muted-foreground/40">—</span>}</span>
                  </td>
                  <td className="px-4 py-3">
                    {model.link
                      ? <a href={model.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline"><ExternalLink className="w-3.5 h-3.5" /></a>
                      : <span className="text-muted-foreground/40 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {model.imageUrl
                      ? <img src={model.imageUrl} alt={model.name} className="w-8 h-8 rounded object-cover" />
                      : <span className="text-muted-foreground/40 text-xs">—</span>
                    }
                  </td>
                  {fieldDefs.map((fd) => {
                    const val = attrs[fd.key];
                    return (
                      <td key={fd.key} className="px-4 py-3">
                        {impactBadge(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMY MANAGER WRAPPER
// Fetches KB entries and passes to TaxonomyManager (unchanged logic)
// ─────────────────────────────────────────────────────────────────────────────

function TaxonomyManagerWrapper() {
  const { data: kbEntries = [] } = useQuery<KnowledgeBaseEntry[]>({
    queryKey: [api.admin.getKnowledgeBase.path],
  });
  return <TaxonomyManager kbEntries={kbEntries} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP CONFIG EDITOR (used only for Step 8 in Model Engagement tab)
// ─────────────────────────────────────────────────────────────────────────────

function StepConfigEditor({ stepConfig }: { stepConfig: StepConfigResponse }) {
  const [prompt, setPrompt] = useState(stepConfig.systemPrompt);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async (systemPrompt: string) => {
      const url = `/api/admin/step-configs/${stepConfig.stepNumber}`;
      return apiRequest("POST", url, { systemPrompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.getStepConfigs.path] });
      toast({ title: "Model Engagement instructions saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {stepConfig.isCustom && (
          <Badge variant="outline" className="text-xs text-primary border-primary/30">Customized</Badge>
        )}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[300px] font-mono text-sm"
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => saveMutation.mutate(prompt)}
            disabled={saveMutation.isPending}
            size="sm"
          >
            {saveMutation.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPrompt(stepConfig.defaultPrompt)}>
            <RefreshCw className="w-4 h-4 mr-2" /> Reset to Default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE MANAGER
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// KNOWLEDGE BASE TAB
// ─────────────────────────────────────────────────────────────────────────────

const FRAMEWORK_REF_SLOTS = [
  {
    referenceType: "outcomes",
    label: "Learning Outcomes Reference",
    description: "The official CCL learning outcomes / Grad Aims / KSMs document. Used to help the AI semantically match what schools describe as outcomes.",
    icon: Target,
  },
  {
    referenceType: "practices",
    label: "Practices & Activities Reference",
    description: "The CCL Design Kit practices and activities document. Used to identify practices even when schools use alternate terminology like 'activities' or 'components'.",
    icon: Zap,
  },
  {
    referenceType: "leaps",
    label: "LEAPs Reference",
    description: "The LEAPs framework document. Used to identify which LEAPs/design principles are present in school design documents.",
    icon: Sparkles,
  },
] as const;

function KnowledgeBaseTab() {
  const { toast } = useToast();
  const { data: allEntries = [], refetch } = useQuery<KnowledgeBaseEntry[]>({
    queryKey: [api.admin.getKnowledgeBase.path],
  });

  const frameworkEntries = allEntries.filter((e) => e.referenceType != null);
  const chatEntries = allEntries.filter((e) => e.referenceType == null);

  return (
    <div className="space-y-8">
      {/* Section 1: Framework Reference Documents */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Framework Reference Documents
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload the official CCL framework documents here. The AI uses these during document analysis to semantically match
            LEAPs, outcomes, and practices — even when schools use alternate terminology like "Grad Aims", "activities", or "components".
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FRAMEWORK_REF_SLOTS.map((slot) => {
            const existing = frameworkEntries.find((e) => e.referenceType === slot.referenceType);
            return (
              <FrameworkRefSlot
                key={slot.referenceType}
                slot={slot}
                existing={existing}
                onRefresh={refetch}
              />
            );
          })}
        </div>
      </div>

      {/* Section 2: Step-Specific Chat Context */}
      <div>
        <div className="mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Step-Specific Chat Context
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reference documents injected as context into AI chat calls via semantic search.
            Upload docs the AI should use when answering questions in a specific workflow step.
          </p>
        </div>
        <KnowledgeBaseManager entries={chatEntries} onRefresh={refetch} />
      </div>
    </div>
  );
}

function FrameworkRefSlot({
  slot,
  existing,
  onRefresh,
}: {
  slot: typeof FRAMEWORK_REF_SLOTS[number];
  existing: KnowledgeBaseEntry | undefined;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const Icon = slot.icon;

  const addMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch(api.admin.addKnowledgeBase.path, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to upload");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
      toast({ title: `${slot.label} uploaded` });
    },
    onError: () => {
      toast({ title: "Upload failed", variant: "destructive" } as any);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/knowledge-base/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      onRefresh();
      toast({ title: "Document removed" });
    },
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // If replacing, delete existing first
    if (existing) {
      await deleteMutation.mutateAsync(existing.id);
    }
    const formData = new FormData();
    formData.append("stepNumber", "0");
    formData.append("title", slot.label);
    formData.append("referenceType", slot.referenceType);
    formData.append("file", file);
    addMutation.mutate(formData);
    e.target.value = "";
  };

  const isLoading = addMutation.isPending || deleteMutation.isPending;

  return (
    <Card className={existing ? "border-primary/30" : "border-dashed"}>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{slot.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{slot.description}</p>
          </div>
        </div>

        {existing ? (
          <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{existing.fileName || existing.title}</p>
              <p className="text-[10px] text-muted-foreground">{existing.content.length.toLocaleString()} characters</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-6 w-6"
              onClick={() => deleteMutation.mutate(existing.id)}
              disabled={isLoading}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No document uploaded yet</p>
        )}

        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.pptx,.ppt,.txt,.md" onChange={handleFile} />
        <Button
          size="sm"
          variant={existing ? "outline" : "default"}
          className="w-full gap-1.5"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          {isLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Upload className="w-3.5 h-3.5" />}
          {existing ? "Replace Document" : "Upload Document"}
        </Button>
      </CardContent>
    </Card>
  );
}

function KnowledgeBaseManager({ entries, onRefresh }: { entries: KnowledgeBaseEntry[]; onRefresh: () => void }) {
  const [newTitle, setNewTitle] = useState("");
  const [newStepNumber, setNewStepNumber] = useState(8);
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

  const groupedEntries = WORKFLOW_STEPS.map((step) => ({
    step,
    entries: entries.filter((e) => e.stepNumber === step.number),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Document Title</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., CCL Design Kit"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to Step</label>
              <select
                value={newStepNumber}
                onChange={(e) => setNewStepNumber(Number(e.target.value))}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {WORKFLOW_STEPS.map((s) => (
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
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={!newTitle.trim() || addMutation.isPending}
            >
              {addMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Upload className="w-4 h-4 mr-2" />}
              Upload Document
            </Button>
          </div>
        </CardContent>
      </Card>

      {groupedEntries.map(
        ({ step, entries: stepEntries }) =>
          stepEntries.length > 0 && (
            <Card key={step.number}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="secondary">{step.number}</Badge>
                  {step.label}
                  <span className="text-muted-foreground font-normal text-sm">({stepEntries.length})</span>
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
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
      )}

      {entries.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No documents uploaded yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP LABEL EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function GroupLabelEditor({
  groupKey,
  defaultLabel,
  currentLabel,
  onSave,
  isSaving,
}: {
  groupKey: string;
  defaultLabel: string;
  currentLabel: string;
  onSave: (label: string) => void;
  isSaving: boolean;
}) {
  const [value, setValue] = useState(currentLabel);
  useEffect(() => {
    setValue(currentLabel);
  }, [currentLabel]);
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={defaultLabel}
        className="text-sm"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => onSave(value.trim() || defaultLabel)}
        disabled={isSaving || value.trim() === currentLabel}
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAXONOMY MANAGER
// ─────────────────────────────────────────────────────────────────────────────

function TaxonomyManager({ kbEntries }: { kbEntries: KnowledgeBaseEntry[] }) {
  const { toast } = useToast();
  const [stepFilter, setStepFilter] = useState(2);

  const { data: taxonomyItems = [], isLoading, refetch } = useQuery<TaxonomyItem[]>({
    queryKey: ["/api/admin/taxonomy", stepFilter],
    queryFn: async () => {
      const url = buildUrl(api.admin.getTaxonomy.path, { stepNumber: stepFilter });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch taxonomy");
      return res.json();
    },
  });

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const defaultCategory = stepFilter === 2 ? "outcome" : "practice";
  const [newCategory, setNewCategory] = useState<string>(defaultCategory);
  const groupOptions = stepFilter === 2 ? OUTCOME_GROUPS : stepFilter === 3 ? PRACTICE_GROUPS : OUTCOME_GROUPS;
  const [newGroup, setNewGroup] = useState<string>(groupOptions[0].key);

  useEffect(() => {
    setNewCategory(stepFilter === 2 ? "outcome" : "practice");
    const opts = stepFilter === 2 ? OUTCOME_GROUPS : stepFilter === 3 ? PRACTICE_GROUPS : OUTCOME_GROUPS;
    setNewGroup(opts[0].key);
  }, [stepFilter]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [selectedKbId, setSelectedKbId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api.admin.createTaxonomyItem.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepNumber: stepFilter,
          category: newCategory,
          name: newName,
          description: newDescription || undefined,
          group: newCategory === "outcome" || newCategory === "practice" ? newGroup : undefined,
        }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setNewName("");
      setNewDescription("");
      toast({ title: "Taxonomy item added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add item.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, description }: { id: number; name: string; description: string }) => {
      const url = buildUrl(api.admin.updateTaxonomyItem.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setEditingId(null);
      toast({ title: "Taxonomy item updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update item.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.admin.deleteTaxonomyItem.path, { id });
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Taxonomy item deleted" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api.admin.seedTaxonomy.path, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to seed");
      return res.json();
    },
    onSuccess: (data: any) => {
      refetch();
      [2, 3].forEach((s) => queryClient.invalidateQueries({ queryKey: ["/api/admin/taxonomy", s] }));
      [2, 3].forEach((s) => queryClient.invalidateQueries({ queryKey: [api.taxonomy.getItems.path, s] }));
      toast({ title: "Taxonomy reset and seeded", description: data.message });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to seed taxonomy.", variant: "destructive" });
    },
  });

  const parseMutation = useMutation({
    mutationFn: async (knowledgeBaseId: number) => {
      const res = await fetch(api.admin.parseTaxonomyFromKB.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepNumber: stepFilter, knowledgeBaseId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to parse");
      return res.json();
    },
    onSuccess: (data: any) => {
      refetch();
      toast({ title: "Items extracted", description: data.message });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to extract items from knowledge base.", variant: "destructive" });
    },
  });

  const startEdit = (item: TaxonomyItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description || "");
  };

  const outcomes = taxonomyItems.filter((i) => i.category === "outcome");
  const leaps = taxonomyItems.filter((i) => i.category === "leap");
  const categories = Array.from(new Set(taxonomyItems.map((i) => i.category)));
  const topLevelItems = (catItems: TaxonomyItem[]) => catItems.filter((i) => !i.parentId);
  const childrenOf = (catItems: TaxonomyItem[], parentId: number) =>
    catItems.filter((i) => i.parentId === parentId);
  const stepKbEntries = kbEntries.filter((e) => e.stepNumber === stepFilter);
  const labelsCategory = stepFilter === 2 ? "outcome" : stepFilter === 3 ? "practice" : null;

  const { data: groupLabels = [], refetch: refetchLabels } = useQuery<
    { id: number; category: string; groupKey: string; label: string }[]
  >({
    queryKey: [api.admin.getTaxonomyGroupLabels.path, labelsCategory],
    queryFn: async () => {
      if (!labelsCategory) return [];
      const url = buildUrl(api.admin.getTaxonomyGroupLabels.path, { category: labelsCategory });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!labelsCategory,
  });

  const labelByKey = Object.fromEntries(groupLabels.map((l) => [l.groupKey, l.label]));
  const saveLabelMutation = useMutation({
    mutationFn: async ({ groupKey, label }: { groupKey: string; label: string }) => {
      if (!labelsCategory) throw new Error("No category");
      return apiRequest("POST", api.admin.saveTaxonomyGroupLabel.path, {
        category: labelsCategory,
        groupKey,
        label,
      });
    },
    onSuccess: () => {
      refetchLabels();
      queryClient.invalidateQueries({ queryKey: [api.admin.getTaxonomy.path, stepFilter] });
      toast({ title: "Section title updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to save.", variant: "destructive" }),
  });

  const getGroupLabel = (key: string) =>
    labelByKey[key] ?? groupOptions.find((g) => g.key === key)?.label ?? key;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Taxonomy Manager
          </CardTitle>
          <CardDescription>
            Manage the canonical taxonomy items for each step. These items constrain AI suggestions and power the recommendation engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Step</label>
              <select
                value={stepFilter}
                onChange={(e) => setStepFilter(Number(e.target.value))}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {WORKFLOW_STEPS.map((s) => (
                  <option key={s.number} value={s.number}>
                    Step {s.number}: {s.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="text-amber-600 border-amber-200 hover:bg-amber-50"
            >
              {seedMutation.isPending
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <RotateCcw className="w-4 h-4 mr-2" />}
              Reset &amp; Seed from CCL PDFs
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Reset &amp; Seed clears all taxonomy items for Steps 2 and 3 and repopulates from the Career Connected Learning Outcomes, LEAPs, and Activities PDFs.
          </p>
        </CardContent>
      </Card>

      {/* Add new item */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add Taxonomy Item</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Category</label>
              {stepFilter === 2 ? (
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="outcome">Outcome</option>
                  <option value="leap">LEAP</option>
                </select>
              ) : (
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="e.g., practice"
                />
              )}
            </div>
            {((stepFilter === 2 && newCategory === "outcome") ||
              (stepFilter === 3 && newCategory === "practice")) && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Section</label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {groupOptions.map((g) => (
                    <option key={g.key} value={g.key}>{g.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Critical Thinking"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description..."
              />
            </div>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newName.trim() || createMutation.isPending}
            size="sm"
          >
            {createMutation.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />}
            Add Item
          </Button>
        </CardContent>
      </Card>

      {/* Edit section titles */}
      {labelsCategory && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Section Titles</CardTitle>
            <CardDescription>
              Customize the labels for each taxonomy section. These appear as headers in the workflow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groupOptions.map((g) => (
                <GroupLabelEditor
                  key={g.key}
                  groupKey={g.key}
                  defaultLabel={g.label}
                  currentLabel={getGroupLabel(g.key)}
                  onSave={(label) => saveLabelMutation.mutate({ groupKey: g.key, label })}
                  isSaving={saveLabelMutation.isPending}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Parse from KB */}
      {stepKbEntries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Auto-Extract from Knowledge Base
            </CardTitle>
            <CardDescription>
              Use AI to extract taxonomy items from a knowledge base document.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={selectedKbId || ""}
                onChange={(e) => setSelectedKbId(Number(e.target.value) || null)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[200px]"
              >
                <option value="">Select a KB document...</option>
                {stepKbEntries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} {e.fileName ? `(${e.fileName})` : ""}
                  </option>
                ))}
              </select>
              <Button
                onClick={() => selectedKbId && parseMutation.mutate(selectedKbId)}
                disabled={!selectedKbId || parseMutation.isPending}
                size="sm"
                variant="outline"
              >
                {parseMutation.isPending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Sparkles className="w-4 h-4 mr-2" />}
                Extract Items
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing items */}
      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading taxonomy items...</p>
          </CardContent>
        </Card>
      ) : taxonomyItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold mb-1">No Taxonomy Items</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Add items manually above, or use the auto-extract feature.
            </p>
          </CardContent>
        </Card>
      ) : stepFilter === 2 ? (
        <>
          {outcomes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Outcomes <Badge variant="secondary" className="ml-2">{outcomes.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {OUTCOME_GROUPS.map((group) => {
                  const groupItems = outcomes.filter((i) => i.group === group.key);
                  if (groupItems.length === 0) return null;
                  return (
                    <div key={group.key} className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {getGroupLabel(group.key)}
                      </h4>
                      {groupItems.map((item) => (
                        <TaxonomyItemRow
                          key={item.id}
                          item={item}
                          isEditing={editingId === item.id}
                          editName={editName}
                          editDescription={editDescription}
                          onEditNameChange={setEditName}
                          onEditDescriptionChange={setEditDescription}
                          onStartEdit={() => startEdit(item)}
                          onSaveEdit={() =>
                            updateMutation.mutate({ id: item.id, name: editName, description: editDescription })
                          }
                          onCancelEdit={() => setEditingId(null)}
                          onDelete={() => deleteMutation.mutate(item.id)}
                          isSaving={updateMutation.isPending}
                        />
                      ))}
                    </div>
                  );
                })}
                {outcomes.filter((i) => !i.group).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ungrouped</h4>
                    {outcomes
                      .filter((i) => !i.group)
                      .map((item) => (
                        <TaxonomyItemRow
                          key={item.id}
                          item={item}
                          isEditing={editingId === item.id}
                          editName={editName}
                          editDescription={editDescription}
                          onEditNameChange={setEditName}
                          onEditDescriptionChange={setEditDescription}
                          onStartEdit={() => startEdit(item)}
                          onSaveEdit={() =>
                            updateMutation.mutate({ id: item.id, name: editName, description: editDescription })
                          }
                          onCancelEdit={() => setEditingId(null)}
                          onDelete={() => deleteMutation.mutate(item.id)}
                          isSaving={updateMutation.isPending}
                        />
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {leaps.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  LEAPs / Design Principles <Badge variant="secondary" className="ml-2">{leaps.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {leaps.map((item) => (
                    <TaxonomyItemRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editName={editName}
                      editDescription={editDescription}
                      onEditNameChange={setEditName}
                      onEditDescriptionChange={setEditDescription}
                      onStartEdit={() => startEdit(item)}
                      onSaveEdit={() =>
                        updateMutation.mutate({ id: item.id, name: editName, description: editDescription })
                      }
                      onCancelEdit={() => setEditingId(null)}
                      onDelete={() => deleteMutation.mutate(item.id)}
                      isSaving={updateMutation.isPending}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          {categories.map((cat) => {
            const catItems = taxonomyItems.filter((i) => i.category === cat);
            const roots = topLevelItems(catItems);

            // Skip categories whose items are all children of another category's items
            // (e.g. "practice" items are children of "practice_group" roots — they appear there)
            if (roots.length === 0) return null;

            // Count all descendant items (across categories) for the badge
            const countDescendants = (parentId: number): number => {
              const kids = taxonomyItems.filter((i) => i.parentId === parentId);
              return kids.length + kids.reduce((sum, k) => sum + countDescendants(k.id), 0);
            };
            const totalDisplayed = catItems.length + roots.reduce((sum, r) => sum + countDescendants(r.id), 0);

            const renderHierarchyItem = (item: TaxonomyItem, depth: number) => {
              // Search ALL taxonomy items for children (supports cross-category parent/child like practice_group → practice)
              const children = taxonomyItems.filter((i) => i.parentId === item.id);
              return (
                <div key={item.id} style={{ marginLeft: depth * 20 }}>
                  <TaxonomyItemRow
                    item={item}
                    isEditing={editingId === item.id}
                    editName={editName}
                    editDescription={editDescription}
                    onEditNameChange={setEditName}
                    onEditDescriptionChange={setEditDescription}
                    onStartEdit={() => startEdit(item)}
                    onSaveEdit={() =>
                      updateMutation.mutate({ id: item.id, name: editName, description: editDescription })
                    }
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={() => deleteMutation.mutate(item.id)}
                    isSaving={updateMutation.isPending}
                    depth={depth}
                  />
                  {children.map((child) => renderHierarchyItem(child, depth + 1))}
                </div>
              );
            };

            const categoryLabel = cat === "practice_group" ? "Practices" : `${cat}s`;
            const badgeCount = cat === "practice_group"
              ? `${roots.reduce((sum, r) => sum + taxonomyItems.filter((i) => i.parentId === r.id).length, 0)} practices in ${roots.length} groups`
              : catItems.length;

            return (
              <Card key={cat}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base capitalize">
                    {categoryLabel} <Badge variant="secondary" className="ml-2">{badgeCount}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">{roots.map((item) => renderHierarchyItem(item, 0))}</div>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function TaxonomyItemRow({
  item,
  isEditing,
  editName,
  editDescription,
  onEditNameChange,
  onEditDescriptionChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  isSaving,
  depth = 0,
}: {
  item: TaxonomyItem;
  isEditing: boolean;
  editName: string;
  editDescription: string;
  onEditNameChange: (v: string) => void;
  onEditDescriptionChange: (v: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  isSaving: boolean;
  depth?: number;
}) {
  if (isEditing) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
        <div className="flex-1 flex items-center gap-2">
          <Input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className="h-8 text-sm"
            placeholder="Name"
          />
          <Input
            value={editDescription}
            onChange={(e) => onEditDescriptionChange(e.target.value)}
            className="h-8 text-sm"
            placeholder="Description (optional)"
          />
        </div>
        <Button size="sm" variant="default" onClick={onSaveEdit} disabled={!editName.trim() || isSaving}>
          {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelEdit}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50 hover:bg-muted/80 transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{item.name}</p>
        {item.description && (
          <p className="text-xs text-muted-foreground truncate">{item.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit}>
          <Pencil className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING RULES MANAGER
// Phase tabs → collapsable question cards → scoring rules per question
// ─────────────────────────────────────────────────────────────────────────────

type RuleWithFieldDef = ScoringRule & { fieldDef: ModelFieldDef };

const FIELD_VALUE_OPTIONS: Record<string, string[]> = {
  yes_no_unknown:           ["Yes", "No", "Unknown"],
  yes_no_depends_unknown:   ["Yes", "No", "Depends on Implementation", "Unknown"],
  device_access:            ["1:1 Required", "Shared Classroom Devices Required", "None", "Unknown"],
  device_capability:        ["Basic Web-Based Required", "Standard Laptop Required", "High Performance Required", "Unknown"],
  dollar_amount:            ["*"],
  grade_list:               [],
};

const SCHOOL_ANSWER_OPTIONS: Record<string, string[]> = {
  // Step 1
  grade_bands: ["K-5", "6-8", "9-12", "Post-secondary"],
  // Step 4 — Family & Community
  family_schedule_flexible:     ["Yes", "No", "A little", "Unknown"],
  family_restrict_partnerships: ["Yes", "No", "Unknown"],
  family_restrict_data:         ["Yes", "No", "Unknown"],
  family_restrict_involvement:  ["Yes", "No", "Unknown"],
  family_outreach_staff:        ["Definitely", "No", "Depends", "Unknown"],
  // Step 4 — Scheduling
  scheduling_seat_time: [
    "Must comply with seat time policy strictly",
    "Some flexibility (e.g., district waivers possible)",
    "Full flexibility",
  ],
  scheduling_flex_blocks: ["Yes", "No", "Unknown"],
  // Step 4 — Technology
  technology_device_access: [
    "1:1 (every student has a device)",
    "Shared classroom devices",
    "Limited access",
    "No reliable device access",
  ],
  technology_device_capability: [
    "High performance devices",
    "Standard Laptop",
    "Basic web-based (e.g., Chromebook)",
    "None",
  ],
  technology_specialized_hardware: ["Yes", "No"],
  // Step 4 — Adult Roles
  can_commit_pd: ["Yes", "No", "Unknown"],
  // Step 4 — Budget
  budget_available:      ["Yes", "No", "Unknown"],
  budget_transportation: ["Yes", "No", "Unknown"],
  // Step 5 — Preferences
  impl_coaching:      ["need_to_have", "nice_to_have", "no_preference"],
  impl_pd:            ["need_to_have", "nice_to_have", "no_preference"],
  impl_selfserve:     ["need_to_have", "nice_to_have", "no_preference"],
  impl_observation:   ["need_to_have", "nice_to_have", "no_preference"],
  evidence_threshold: ["established", "open_to_emerging"],
  open_to_stitching:  ["yes", "no"],
  // Step 2 & 3 — taxonomy selections use importance tiers
  selected_outcomes:  ["Top Priority", "Important", "Nice to Have"],
  selected_leaps:     ["Top Priority", "Important", "Nice to Have"],
  selected_practices: ["Top Priority", "Important", "Nice to Have"],
};

const SCHOOL_QUESTION_TEXT: Record<string, string> = {
  // Step 1
  school_name: "What is your school's name?",
  district:    "Which school district do you work in?",
  state:       "Which state are you in?",
  context:     "Is there any additional context we should know about your school?",
  grade_bands: "What grade bands does your school serve?",
  // Step 2 — Aims
  selected_outcomes: "Which student outcomes are most important to your school? (select with priority level)",
  selected_leaps:    "Which Learning Environment & Practice (LEAP) priorities matter most? (select with priority level)",
  // Step 3 — Practices
  selected_practices: "Which instructional or learning practices are most important to your school? (select with priority level)",
  // Step 4 — Family
  family_schedule_flexible:                    "Is your annual school calendar / schedule flexible?",
  requires_annual_schedule_flexibility:        "Is your annual school calendar / schedule flexible?",
  requires_scheduling_flexibility:             "Requires Scheduling Flexibility (covers 3 school questions: annual schedule, seat time, and flex blocks)",
  family_restrict_partnerships:                "Are there legal or policy restrictions on external community/employer partnerships?",
  family_restrict_data:                        "Are there legal or policy restrictions on sharing student data externally?",
  family_restrict_involvement:                 "Are there legal or policy restrictions on requiring family involvement?",
  family_outreach_staff:                       "Do you have staff capable of family and community outreach?",
  // Step 4 — Scheduling (two model fields share the same workflow question; use field key to differentiate)
  requires_seat_time_flexibility:              "Can the school flex seat time compliance (e.g., via district waivers)?",
  requires_subject_minute_reallocation:        "Can the school significantly reallocate subject-level instructional minutes?",
  scheduling_seat_time:                        "How rigid is your seat time policy, and is there flexibility to reallocate instructional minutes?",
  scheduling_flex_blocks:                      "Are you able to integrate flex or choice blocks into the schedule?",
  // Step 4 — Technology
  technology_device_access:        "What is the highest level of student device access available?",
  technology_device_capability:    "What is the highest level of device capability available?",
  technology_specialized_hardware: "Do you have access to any specialized hardware (e.g., robotics kits, CAD workstations)?",
  // Step 4 — Adult Roles
  can_commit_pd: "Can your school commit to required professional development for a new model?",
  // Step 4 — Budget
  budget_available:     "Does your school have budget available for a paid solution?",
  budget_transportation:"Will the district offer transportation services for off-site learning?",
  // Step 5 — Preferences
  impl_coaching:      "How important is 1:1 coaching & consulting support?",
  impl_pd:            "How important is structured professional development?",
  impl_selfserve:     "How important is access to self-serve resources?",
  impl_observation:   "How important are observation opportunities?",
  evidence_threshold: "What level of evidence do you require for a model?",
  open_to_stitching:  "Are you open to combining multiple compatible models (stitching)?",
};

// Questions where the workflow shows an optional follow-up detail textarea.
// These user-typed notes are appended to watchout messages at recommendation time.
const DETAIL_QUESTION_KEYS = new Set([
  "family_outreach_staff",
  "family_restrict_partnerships",
  "family_restrict_data",
  "family_restrict_involvement",
]);

// Model fields whose watchout messages are enriched at runtime from model attribute columns.
const MODEL_ENRICHED_FIELD_KEYS: Record<string, string> = {
  requires_pd:                           "provider_pd",
  requires_seat_time_flexibility:        "scheduling_implications",
  requires_subject_minute_reallocation:  "scheduling_implications",
  requires_flex_choice_blocks:           "scheduling_implications",
  requires_annual_schedule_flexibility:  "scheduling_implications",
  requires_family_involvement:           "family_involvement_detail",
};

// Phase → domain groups → field keys (DB-backed) + static questions (display-only, no rules yet)
// staticQuestions reference school answer keys from SCHOOL_QUESTION_TEXT / SCHOOL_ANSWER_OPTIONS
type StaticQuestion = { questionKey: string; badgeText?: string; note?: string };

const PHASES = [
  {
    id: "context",
    label: "School Context",
    stepNumber: 1,
    groups: [
      {
        label: "School Information",
        fieldKeys: [] as string[],
        staticQuestions: [
          { questionKey: "school_name", badgeText: "Not scored", note: "Used for display purposes only — does not affect model recommendations." },
          { questionKey: "district",    badgeText: "Not scored", note: "Used for display purposes only — does not affect model recommendations." },
          { questionKey: "state",       badgeText: "Not scored", note: "Used for display purposes only — does not affect model recommendations." },
          { questionKey: "context",     badgeText: "Not scored", note: "Free-text context field — stored and surfaced in the AI model engagement step but does not affect scoring." },
        ] as StaticQuestion[],
      },
      {
        label: "Grade Bands",
        fieldKeys: ["grade_band"] as string[],
        staticQuestions: [] as StaticQuestion[],
      },
    ],
  },
  {
    id: "aims",
    label: "Aims for Learners",
    stepNumber: 2,
    groups: [
      {
        label: "Outcomes",
        fieldKeys: [] as string[],
        staticQuestions: [
          {
            questionKey: "selected_outcomes",
            badgeText: "Fuzzy match scoring",
            note: "Scored via fuzzy text matching against each model's outcome types and description. Configure weights in the Scoring Weights panel.",
          },
        ] as StaticQuestion[],
      },
      {
        label: "LEAPs / Design Principles",
        fieldKeys: [] as string[],
        staticQuestions: [
          {
            questionKey: "selected_leaps",
            badgeText: "Fuzzy match scoring",
            note: "Scored via fuzzy text matching against each model's outcome types and description. Configure weights in the Scoring Weights panel.",
          },
        ] as StaticQuestion[],
      },
    ],
  },
  {
    id: "practices",
    label: "Practices",
    stepNumber: 3,
    groups: [
      {
        label: "Learning Practices",
        fieldKeys: [] as string[],
        staticQuestions: [
          {
            questionKey: "selected_practices",
            badgeText: "Fuzzy match scoring",
            note: "Scored via fuzzy text matching against each model's key practices and description. Configure weights in the Scoring Weights panel.",
          },
        ] as StaticQuestion[],
        scoringNote: "Practices selections are scored using fuzzy text matching against model key practices and descriptions. Scoring weights are configured in the Scoring Weights panel.",
      },
    ],
  },
  {
    id: "system",
    label: "System Elements",
    stepNumber: 4,
    groups: [
      {
        label: "Family & Community Partnerships",
        fieldKeys: ["requires_partnership", "requires_data_sharing", "requires_family_involvement"] as string[],
        staticQuestions: [
          {
            questionKey: "family_outreach_staff",
            badgeText: "Not scored",
            note: "Collected as context only — no corresponding model data field, so no scoring rules apply.",
          },
        ] as StaticQuestion[],
      },
      {
        label: "Scheduling & Use of Time",
        fieldKeys: ["requires_scheduling_flexibility"] as string[],
        staticQuestions: [] as StaticQuestion[],
      },
      {
        label: "Technology & Infrastructure",
        fieldKeys: ["device_access_requirements"] as string[],
        staticQuestions: [
          {
            questionKey: "technology_device_capability",
            badgeText: "Not scored",
            note: "Collected for context — no model data available for device capability level, so no scoring rules apply.",
          },
          { questionKey: "technology_specialized_hardware" },
        ] as StaticQuestion[],
      },
      {
        label: "Adult Roles, Hiring & Development",
        fieldKeys: ["requires_pd"] as string[],
        staticQuestions: [] as { questionKey: string }[],
      },
      {
        label: "Budget & Operations",
        fieldKeys: ["requires_offsite_learning", "total_solution_cost"] as string[],
        staticQuestions: [] as { questionKey: string }[],
      },
    ],
  },
  {
    id: "preferences",
    label: "Model Preferences",
    stepNumber: 5,
    groups: [
      {
        label: "Implementation Support",
        fieldKeys: [] as string[],
        staticQuestions: [
          { questionKey: "impl_coaching" },
          { questionKey: "impl_pd" },
          { questionKey: "impl_selfserve" },
          { questionKey: "impl_observation" },
        ] as { questionKey: string }[],
        scoringNote: "Implementation support preferences are stored but do not currently affect model scoring or filtering.",
      },
      {
        label: "Evidence & Approach",
        fieldKeys: [] as string[],
        staticQuestions: [
          { questionKey: "evidence_threshold" },
          { questionKey: "open_to_stitching" },
        ] as { questionKey: string }[],
        scoringNote: "Evidence threshold and stitching preference are stored but do not currently affect model scoring or filtering.",
      },
    ],
  },
];

function impactBadge(impact: string) {
  if (impact === "hard_blocker")
    return <Badge variant="destructive" className="text-xs font-medium">Hard Blocker</Badge>;
  if (impact === "watchout")
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-medium">Watchout</Badge>;
  return <Badge variant="secondary" className="text-xs">No Impact</Badge>;
}

// ── Inline rule edit/create form (shared between edit and add) ──────────────
function RuleForm({
  fieldDef,
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  isGenerating,
  onGenerateMessage,
  saveLabel,
}: {
  fieldDef: ModelFieldDef;
  value: {
    modelValue: string; schoolAnswerKey: string; schoolAnswerValue: string;
    matchType: string; impact: string; watchoutMessage: string;
  };
  onChange: (patch: Partial<typeof value>) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isGenerating: boolean;
  onGenerateMessage: () => void;
  saveLabel: string;
}) {
  const modelValueOpts = FIELD_VALUE_OPTIONS[fieldDef.valueType ?? "yes_no_unknown"] ?? [];
  const schoolAnswerOpts = SCHOOL_ANSWER_OPTIONS[value.schoolAnswerKey] ?? [];

  return (
    <div className="space-y-3 p-4 bg-primary/3 border border-primary/20 rounded-lg">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Model Value</label>
          {modelValueOpts.length > 0 ? (
            <select
              value={value.modelValue}
              onChange={(e) => onChange({ modelValue: e.target.value })}
              className="w-full h-8 border rounded px-2 text-xs bg-background"
            >
              <option value="">Select…</option>
              {modelValueOpts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <Input
              value={value.modelValue}
              onChange={(e) => onChange({ modelValue: e.target.value })}
              className="h-8 text-xs"
              placeholder="*"
            />
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">School Answers</label>
          {schoolAnswerOpts.length > 0 ? (
            <select
              value={value.schoolAnswerValue}
              onChange={(e) => onChange({ schoolAnswerValue: e.target.value })}
              className="w-full h-8 border rounded px-2 text-xs bg-background"
            >
              <option value="">Select…</option>
              {schoolAnswerOpts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <Input
              value={value.schoolAnswerValue}
              onChange={(e) => onChange({ schoolAnswerValue: e.target.value })}
              className="h-8 text-xs"
              placeholder="*"
            />
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Match</label>
          <select
            value={value.matchType}
            onChange={(e) => onChange({ matchType: e.target.value })}
            className="w-full h-8 border rounded px-2 text-xs bg-background"
          >
            <option value="equals">equals</option>
            <option value="contains">contains</option>
            <option value="not_contains">not contains</option>
            <option value="numeric_budget_exceeded">budget exceeded</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Impact</label>
          <select
            value={value.impact}
            onChange={(e) => onChange({ impact: e.target.value })}
            className="w-full h-8 border rounded px-2 text-xs bg-background"
          >
            <option value="hard_blocker">Hard Blocker</option>
            <option value="watchout">Watchout</option>
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted-foreground font-medium">Message shown to users</label>
          <Button
            size="sm"
            variant="outline"
            className="h-5 px-2 text-xs gap-1"
            onClick={onGenerateMessage}
            disabled={isGenerating || !value.modelValue}
          >
            {isGenerating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
            Auto-generate
          </Button>
        </div>
        <textarea
          value={value.watchoutMessage}
          onChange={(e) => onChange({ watchoutMessage: e.target.value })}
          className="w-full text-xs border rounded px-2 py-1.5 resize-none min-h-[50px] bg-background"
          placeholder="Message shown when this rule fires…"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7" onClick={onSave} disabled={isSaving || !value.modelValue || !value.schoolAnswerValue}>
          {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
          {saveLabel}
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ── Single field (question) card ─────────────────────────────────────────────
function QuestionCard({
  fieldDef,
  rules,
  onRuleAdded,
  onRuleUpdated,
  onRuleDeleted,
}: {
  fieldDef: ModelFieldDef;
  rules: RuleWithFieldDef[];
  onRuleAdded: () => void;
  onRuleUpdated: () => void;
  onRuleDeleted: () => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState({
    modelValue: "", schoolAnswerKey: "", schoolAnswerValue: "",
    matchType: "equals", impact: "watchout", watchoutMessage: "",
  });
  const [addingNew, setAddingNew] = useState(false);
  const [newState, setNewState] = useState({
    modelValue: "", schoolAnswerKey: fieldDef.questionKey ?? "", schoolAnswerValue: "",
    matchType: "equals", impact: "watchout", watchoutMessage: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Check by model field key first (lets two fields with the same questionKey get distinct display text),
  // then by questionKey, then fall back to the fieldDef label.
  const questionText =
    SCHOOL_QUESTION_TEXT[fieldDef.key] ??
    SCHOOL_QUESTION_TEXT[fieldDef.questionKey ?? ""] ??
    fieldDef.label;
  const schoolAnswerOpts = SCHOOL_ANSWER_OPTIONS[fieldDef.questionKey ?? ""] ?? [];

  const hardBlockers = rules.filter((r) => r.impact === "hard_blocker");
  const watchouts = rules.filter((r) => r.impact === "watchout");

  const startEdit = (rule: RuleWithFieldDef) => {
    setEditingId(rule.id);
    setEditState({
      modelValue: rule.modelValue,
      schoolAnswerKey: rule.schoolAnswerKey,
      schoolAnswerValue: rule.schoolAnswerValue,
      matchType: rule.matchType ?? "equals",
      impact: rule.impact,
      watchoutMessage: rule.watchoutMessage ?? "",
    });
    setExpanded(true);
  };

  const saveEdit = async (rule: RuleWithFieldDef) => {
    setIsSaving(true);
    try {
      await fetch(buildUrl(api.admin.updateScoringRule.path, { id: rule.id }), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelValue: editState.modelValue,
          schoolAnswerKey: editState.schoolAnswerKey,
          schoolAnswerValue: editState.schoolAnswerValue,
          matchType: editState.matchType,
          impact: editState.impact,
          watchoutMessage: editState.watchoutMessage || null,
        }),
      });
      setEditingId(null);
      onRuleUpdated();
      toast({ title: "Rule updated" });
    } catch {
      toast({ title: "Failed to save rule", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const saveNew = async () => {
    if (!newState.modelValue || !newState.schoolAnswerValue) {
      toast({ title: "Fill in model value and school answer", variant: "destructive" });
      return;
    }
    setIsSavingNew(true);
    try {
      await fetch(api.admin.createScoringRule.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldDefId: fieldDef.id,
          modelValue: newState.modelValue,
          schoolAnswerKey: newState.schoolAnswerKey || fieldDef.questionKey,
          schoolAnswerValue: newState.schoolAnswerValue,
          matchType: newState.matchType,
          impact: newState.impact,
          watchoutMessage: newState.watchoutMessage || null,
        }),
      });
      setAddingNew(false);
      setNewState({
        modelValue: "", schoolAnswerKey: fieldDef.questionKey ?? "", schoolAnswerValue: "",
        matchType: "equals", impact: "watchout", watchoutMessage: "",
      });
      onRuleAdded();
      toast({ title: "Rule added" });
    } catch {
      toast({ title: "Failed to add rule", variant: "destructive" });
    } finally {
      setIsSavingNew(false);
    }
  };

  const deleteRule = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    await fetch(buildUrl(api.admin.deleteScoringRule.path, { id }), { method: "DELETE" });
    onRuleDeleted();
    toast({ title: "Rule deleted" });
  };

  const generateMessage = async (forNew: boolean) => {
    const mv = forNew ? newState.modelValue : editState.modelValue;
    const sk = forNew ? (newState.schoolAnswerKey || (fieldDef.questionKey ?? "")) : editState.schoolAnswerKey;
    const sv = forNew ? newState.schoolAnswerValue : editState.schoolAnswerValue;
    const impact = forNew ? newState.impact : editState.impact;
    if (!mv || (impact !== "watchout" && impact !== "hard_blocker")) return;
    setIsGenerating(true);
    try {
      const res = await fetch(api.admin.generateWatchoutMessage.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldDefId: fieldDef.id, modelValue: mv, schoolAnswerKey: sk, schoolAnswerValue: sv, impact }),
      });
      const data = await res.json();
      if (forNew) setNewState((p) => ({ ...p, watchoutMessage: data.message }));
      else setEditState((p) => ({ ...p, watchoutMessage: data.message }));
    } catch {
      toast({ title: "Failed to generate message", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className={`overflow-hidden transition-all ${expanded ? "ring-1 ring-primary/20" : ""}`}>
      {/* Question header — always visible */}
      <div
        className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug">{questionText}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {fieldDef.key}
              </code>
              {schoolAnswerOpts.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Options: {schoolAnswerOpts.join(" · ")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hardBlockers.length > 0 && (
            <Badge variant="destructive" className="text-xs">{hardBlockers.length} blocker{hardBlockers.length !== 1 ? "s" : ""}</Badge>
          )}
          {watchouts.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">{watchouts.length} watchout{watchouts.length !== 1 ? "s" : ""}</Badge>
          )}
          {rules.length === 0 && (
            <span className="text-xs text-muted-foreground">No rules</span>
          )}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t">
          {/* Model field reference */}
          <div className="px-4 py-2 bg-muted/20 border-b flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
            <span>Model field: <code className="bg-muted px-1 rounded">{fieldDef.label}</code></span>
            <span>Value type: <code className="bg-muted px-1 rounded">{fieldDef.valueType}</code></span>
            {fieldDef.airtableColumn && (
              <span>Airtable column: <code className="bg-muted px-1 rounded">{fieldDef.airtableColumn}</code></span>
            )}
          </div>

          {/* Runtime enrichment annotations */}
          {(DETAIL_QUESTION_KEYS.has(fieldDef.questionKey ?? "") || MODEL_ENRICHED_FIELD_KEYS[fieldDef.key]) && (
            <div className="px-4 py-2 border-b flex flex-wrap gap-2">
              {DETAIL_QUESTION_KEYS.has(fieldDef.questionKey ?? "") && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  User context note appended at runtime (if provided by school)
                </span>
              )}
              {MODEL_ENRICHED_FIELD_KEYS[fieldDef.key] && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  Model context appended at runtime from <code className="font-mono">{MODEL_ENRICHED_FIELD_KEYS[fieldDef.key]}</code>
                </span>
              )}
            </div>
          )}

          {/* Existing rules — grouped by schoolAnswerKey when multiple question keys are present */}
          {rules.length === 0 && !addingNew && (
            <div className="px-4 py-3 text-xs text-muted-foreground italic">
              No rules defined — this question has no impact on recommendations yet.
            </div>
          )}

          {(() => {
            const uniqueSchoolKeys = [...new Set(rules.map((r) => r.schoolAnswerKey))];
            const isMultiQuestion = uniqueSchoolKeys.length > 1;

            const renderRuleRow = (rule: RuleWithFieldDef) => (
              <div key={rule.id} className="border-b last:border-b-0">
                {editingId === rule.id ? (
                  <div className="p-4">
                    <RuleForm
                      fieldDef={fieldDef}
                      value={editState}
                      onChange={(patch) => setEditState((p) => ({ ...p, ...patch }))}
                      onSave={() => saveEdit(rule)}
                      onCancel={() => setEditingId(null)}
                      isSaving={isSaving}
                      isGenerating={isGenerating}
                      onGenerateMessage={() => generateMessage(false)}
                      saveLabel="Save Changes"
                    />
                  </div>
                ) : (
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/10">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="text-muted-foreground">When model has</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded font-medium">{rule.modelValue}</code>
                        <span className="text-muted-foreground">and school answers</span>
                        <code className="bg-muted px-1.5 py-0.5 rounded font-medium">{rule.schoolAnswerValue}</code>
                        <span className="text-muted-foreground">→</span>
                        {impactBadge(rule.impact)}
                        {rule.matchType && rule.matchType !== "equals" && (
                          <Badge variant="outline" className="text-xs font-mono py-0">{rule.matchType}</Badge>
                        )}
                      </div>
                      {rule.watchoutMessage && (
                        <p className="text-xs text-muted-foreground italic">"{rule.watchoutMessage}"</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(rule)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteRule(rule.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );

            if (!isMultiQuestion) {
              return rules.map(renderRuleRow);
            }

            // Group rules by schoolAnswerKey and render with sub-headers
            return uniqueSchoolKeys.map((key) => {
              const groupRules = rules.filter((r) => r.schoolAnswerKey === key);
              const questionText = SCHOOL_QUESTION_TEXT[key] ?? key;
              const opts = SCHOOL_ANSWER_OPTIONS[key] ?? [];
              return (
                <div key={key} className="border-b last:border-b-0">
                  <div className="px-4 pt-2.5 pb-1 bg-muted/20">
                    <p className="text-xs font-semibold text-foreground/80">{questionText}</p>
                    {opts.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Options: {opts.join(" · ")}</p>
                    )}
                    <code className="text-[10px] text-muted-foreground/60 font-mono">{key}</code>
                  </div>
                  {groupRules.map(renderRuleRow)}
                </div>
              );
            });
          })()}

          {/* Add new rule */}
          {addingNew ? (
            <div className="p-4 border-t border-dashed border-primary/30">
              <RuleForm
                fieldDef={fieldDef}
                value={newState}
                onChange={(patch) => setNewState((p) => ({ ...p, ...patch }))}
                onSave={saveNew}
                onCancel={() => setAddingNew(false)}
                isSaving={isSavingNew}
                isGenerating={isGenerating}
                onGenerateMessage={() => generateMessage(true)}
                saveLabel="Add Rule"
              />
            </div>
          ) : (
            <div className="px-4 py-2 border-t border-dashed border-border/60">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-primary hover:text-primary"
                onClick={() => setAddingNew(true)}
              >
                <Plus className="w-3 h-3" /> Add Rule
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Scoring Weights Grid — clean table UI for category weights + tier points
// ---------------------------------------------------------------------------

const SCORING_CATEGORIES = [
  {
    id: "leaps",
    label: "LEAPs",
    weightKey: "leaps_weight",
    tierKeys: {
      most_important: "leaps_top_pts",
      important: "leaps_important_pts",
      nice_to_have: "leaps_nice_pts",
    },
  },
  {
    id: "outcomes",
    label: "Outcomes",
    weightKey: "outcomes_weight",
    tierKeys: {
      most_important: "outcomes_top_pts",
      important: "outcomes_important_pts",
      nice_to_have: "outcomes_nice_pts",
    },
  },
  {
    id: "practices",
    label: "Practices",
    weightKey: "practices_weight",
    tierKeys: {
      most_important: "practices_top_pts",
      important: "practices_important_pts",
      nice_to_have: "practices_nice_pts",
    },
  },
] as const;

type ScoringConfig = { id: number; key: string; label: string; value: number };

function ScoringWeightsGrid({
  scoringConfigs,
  weightEdits,
  setWeightEdits,
  saveWeight,
}: {
  scoringConfigs: ScoringConfig[];
  weightEdits: Record<string, string>;
  setWeightEdits: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  saveWeight: (key: string, label: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const cfgByKey = Object.fromEntries(scoringConfigs.map((c) => [c.key, c]));

  const val = (key: string) => weightEdits[key] ?? String(cfgByKey[key]?.value ?? "");

  const saveAll = async () => {
    setSaving(true);
    const allKeys = SCORING_CATEGORIES.flatMap((cat) => [
      cat.weightKey,
      ...Object.values(cat.tierKeys),
    ]);
    await Promise.all(
      allKeys.map((key) => {
        const cfg = cfgByKey[key];
        if (!cfg) return Promise.resolve();
        return saveWeight(key, cfg.label);
      }),
    );
    setSaving(false);
    toast({ title: "Scoring weights saved" });
  };

  const budgetCfg = cfgByKey["budget_buffer"];

  return (
    <div className="space-y-4">
      {/* Main scoring grid */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sliders className="w-4 h-4 text-primary" />
                Scoring Weights
              </CardTitle>
              <CardDescription className="mt-1">
                Points are earned for each matching item based on its priority level. The category multiplier scales the total for that category.
                Models are ranked by total score across all three categories.
              </CardDescription>
            </div>
            <Button size="sm" onClick={saveAll} disabled={saving} className="shrink-0">
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> : <Save className="w-3 h-3 mr-1.5" />}
              Save All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Column headers */}
          <div className="grid grid-cols-[140px_1fr_1fr_1fr_1px_100px] items-center gap-x-3 pb-2 mb-1 border-b">
            <div />
            <p className="text-xs font-semibold text-muted-foreground text-center">Top Priority</p>
            <p className="text-xs font-semibold text-muted-foreground text-center">Important</p>
            <p className="text-xs font-semibold text-muted-foreground text-center">Nice to Have</p>
            <div className="bg-border h-full" />
            <p className="text-xs font-semibold text-muted-foreground text-center">× Multiplier</p>
          </div>
          <p className="text-[11px] text-muted-foreground/60 text-center mb-3" style={{paddingLeft: 140}}>
            pts per matching item &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;applied to total
          </p>

          {/* Category rows */}
          <div className="space-y-2">
            {SCORING_CATEGORIES.map((cat) => {
              const weightCfg = cfgByKey[cat.weightKey];
              return (
                <div
                  key={cat.id}
                  className="grid grid-cols-[140px_1fr_1fr_1fr_1px_100px] items-center gap-x-3 rounded-lg bg-muted/30 px-3 py-2.5"
                >
                  {/* Category label */}
                  <p className="text-sm font-semibold">{cat.label}</p>

                  {/* Tier point inputs */}
                  {(["most_important", "important", "nice_to_have"] as const).map((tier) => {
                    const key = cat.tierKeys[tier];
                    return (
                      <div key={tier} className="flex justify-center">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={val(key)}
                          onChange={(e) => setWeightEdits((p) => ({ ...p, [key]: e.target.value }))}
                          className="h-8 w-16 text-sm text-center"
                        />
                      </div>
                    );
                  })}

                  {/* Visual separator */}
                  <div className="bg-border self-stretch" />

                  {/* Multiplier input */}
                  <div className="flex justify-center">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      value={weightCfg ? val(weightCfg.key) : "1"}
                      onChange={(e) =>
                        weightCfg && setWeightEdits((p) => ({ ...p, [weightCfg.key]: e.target.value }))
                      }
                      className="h-8 w-20 text-sm text-center font-semibold bg-primary/5 border-primary/30"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Example calculation */}
          <div className="mt-4 rounded-md bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="font-semibold">Example:</span> If LEAPs multiplier = 3, and a school selects 2 Top Priority + 1 Important + 2 Nice to Have LEAPs that all match →{" "}
            <span className="font-mono">(2×{val("leaps_top_pts") || 5} + 1×{val("leaps_important_pts") || 3} + 2×{val("leaps_nice_pts") || 1}) × {val("leaps_weight") || 1} = {
              ((2 * parseFloat(val("leaps_top_pts") || "5")) + (1 * parseFloat(val("leaps_important_pts") || "3")) + (2 * parseFloat(val("leaps_nice_pts") || "1"))) * parseFloat(val("leaps_weight") || "1")
            } LEAPs points</span>
          </div>
        </CardContent>
      </Card>

      {/* Budget constraint — separate card */}
      {budgetCfg && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              Budget Constraint
            </CardTitle>
            <CardDescription>
              A model is hard-blocked (excluded from results) when its cost exceeds the school's stated budget by more than this amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground shrink-0">Buffer ($)</span>
              <Input
                type="number"
                step="1000"
                min="0"
                value={val(budgetCfg.key)}
                onChange={(e) => setWeightEdits((p) => ({ ...p, [budgetCfg.key]: e.target.value }))}
                className="h-8 w-32 text-sm text-right"
              />
              <Button size="sm" variant="outline" className="h-8" onClick={() => saveWeight(budgetCfg.key, budgetCfg.label)}>
                <Save className="w-3 h-3 mr-1.5" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Read-only card for the hardcoded grade band system rule */
function GradeBandSystemRuleCard() {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="border-blue-200 bg-blue-50/20">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 shrink-0 text-blue-500" /> : <ChevronRight className="w-4 h-4 shrink-0 text-blue-500" />}
          <div className="min-w-0">
            <p className="text-sm font-medium">What grade bands does your school serve?</p>
            <p className="text-xs text-muted-foreground mt-0.5">System rule — managed in code, not editable here</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Hard Blocker</Badge>
          <Badge variant="secondary" className="text-xs">System Rule</Badge>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-blue-100 pt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            The school selects grade bands from: <strong>K-5, 6-8, 9-12, Post-secondary</strong>.
            Models store individual grade values (e.g. <code className="bg-muted px-1 rounded">K, 1, 2, 3, 9, 10, 11, 12, PS</code>).
          </p>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1">
            <p><span className="font-semibold text-green-700">No blocker:</span> At least one grade in any selected band overlaps with the model's grades.</p>
            <p><span className="font-semibold text-red-700">Hard blocker:</span> Zero overlap between any selected band and the model's grades → model is excluded entirely.</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Example: school selects <em>"9-12"</em> → a model serving <em>"K, 1, 2, 3, 4, 5"</em> is hard-blocked; a model serving <em>"9, 10, 11, 12"</em> passes.
          </p>
        </div>
      )}
    </Card>
  );
}

/** Display-only card for workflow questions that don't yet have scoring rules */
function StaticQuestionCard({
  questionKey,
  badgeText,
  note,
}: {
  questionKey: string;
  badgeText?: string;
  note?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const questionText = SCHOOL_QUESTION_TEXT[questionKey] ?? questionKey;
  const options = SCHOOL_ANSWER_OPTIONS[questionKey] ?? [];

  const displayBadge = badgeText ?? "No rules yet";
  const displayNote = note ?? "No scoring rules are defined for this question. Answers are stored but do not currently affect model recommendations.";

  return (
    <Card className="border-dashed opacity-80">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{questionText}</p>
            <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">{questionKey}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0 ml-3 text-muted-foreground">{displayBadge}</Badge>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t pt-3 space-y-2">
          {options.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Answer options</p>
              <div className="flex flex-wrap gap-1.5">
                {options.map((o) => (
                  <span key={o} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{o}</span>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground italic pt-1">{displayNote}</p>
        </div>
      )}
    </Card>
  );
}

function ScoringRulesManager() {
  const { toast } = useToast();
  const [activePhase, setActivePhase] = useState("context");
  const [showWeights, setShowWeights] = useState(false);

  const { data: fieldDefs = [] } = useQuery<ModelFieldDef[]>({
    queryKey: [api.admin.getModelFieldDefs.path],
    queryFn: async () => {
      const r = await fetch(api.admin.getModelFieldDefs.path);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const { data: rules = [], refetch: refetchRules } = useQuery<RuleWithFieldDef[]>({
    queryKey: [api.admin.getScoringRules.path],
    queryFn: async () => {
      const r = await fetch(api.admin.getScoringRules.path);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const { data: scoringConfigs = [], refetch: refetchConfig } = useQuery<ScoringConfig[]>({
    queryKey: [api.admin.getScoringConfig.path],
    queryFn: async () => {
      const r = await fetch(api.admin.getScoringConfig.path);
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
  });

  const [weightEdits, setWeightEdits] = useState<Record<string, string>>({});
  useEffect(() => {
    const e: Record<string, string> = {};
    for (const c of scoringConfigs) e[c.key] = String(c.value);
    setWeightEdits(e);
  }, [scoringConfigs]);

  const saveWeight = async (key: string, label: string) => {
    const value = parseFloat(weightEdits[key] ?? "1");
    if (isNaN(value)) return;
    await fetch(api.admin.updateScoringConfig.path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, label }),
    });
    await refetchConfig();
    toast({ title: "Weight saved" });
  };

  const safeFieldDefs = Array.isArray(fieldDefs) ? fieldDefs : [];
  const safeRules = Array.isArray(rules) ? rules : [];
  const fieldDefByKey = Object.fromEntries(safeFieldDefs.map((f) => [f.key, f]));
  const rulesByFieldDefId = safeRules.reduce<Record<number, RuleWithFieldDef[]>>((acc, r) => {
    if (!acc[r.fieldDefId]) acc[r.fieldDefId] = [];
    acc[r.fieldDefId].push(r);
    return acc;
  }, {});

  const currentPhase = PHASES.find((p) => p.id === activePhase);

  return (
    <div className="space-y-6">
      {/* Phase tabs */}
      <div className="flex items-center gap-1 border-b pb-4 flex-wrap">
        {PHASES.map((phase) => (
          <button
            key={phase.id}
            onClick={() => setActivePhase(phase.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              activePhase === phase.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {phase.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowWeights(!showWeights)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 ${
            showWeights ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Scoring Weights
        </button>
      </div>

      {/* Scoring weights panel */}
      {showWeights && (
        <div className="space-y-4">
          <ScoringWeightsGrid
            scoringConfigs={scoringConfigs}
            weightEdits={weightEdits}
            setWeightEdits={setWeightEdits}
            saveWeight={saveWeight}
          />
        </div>
      )}

      {/* Phase content */}
      {currentPhase && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Questions from <strong>Step {currentPhase.stepNumber}</strong>. Click any question to see
            the response options and the scoring rules that determine hard blockers and watchouts.
          </p>

          {currentPhase.groups.map((group) => {
            const groupFieldDefs = (group.fieldKeys ?? [])
              .map((k) => fieldDefByKey[k])
              .filter(Boolean) as ModelFieldDef[];
            const staticQs = group.staticQuestions ?? [];
            const hasContent = groupFieldDefs.length > 0 || staticQs.length > 0 || !!(group as any).scoringNote;
            if (!hasContent) return null;

            return (
              <div key={group.label} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  {group.label}
                </h3>

                {/* Scoring-note-only groups (Steps 2/3/Preferences) */}
                {(group as any).scoringNote && groupFieldDefs.length === 0 && staticQs.length === 0 && (
                  <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-sm text-blue-700">
                    {(group as any).scoringNote}
                  </div>
                )}

                {/* Scoring note shown above cards when there are also cards */}
                {(group as any).scoringNote && (groupFieldDefs.length > 0 || staticQs.length > 0) && (
                  <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 px-4 py-3 text-sm text-blue-700 mb-1">
                    {(group as any).scoringNote}
                  </div>
                )}

                {/* Grade band system rule */}
                {group.fieldKeys?.includes("grade_band") && (
                  <GradeBandSystemRuleCard />
                )}

                {/* DB-backed questions (have scoring rules) */}
                {groupFieldDefs.map((fd) => (
                  <QuestionCard
                    key={fd.key}
                    fieldDef={fd}
                    rules={rulesByFieldDefId[fd.id] ?? []}
                    onRuleAdded={refetchRules}
                    onRuleUpdated={refetchRules}
                    onRuleDeleted={refetchRules}
                  />
                ))}

                {/* Static questions (no scoring rules yet, or fuzzy-matched) */}
                {staticQs.map((sq) => (
                  <StaticQuestionCard
                    key={sq.questionKey}
                    questionKey={sq.questionKey}
                    badgeText={(sq as StaticQuestion).badgeText}
                    note={(sq as StaticQuestion).note}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Model Field Definitions — collapsed reference */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 pt-4 border-t">
          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
          Model Field Reference
        </summary>
        <div className="mt-3 space-y-2">
          {safeFieldDefs.map((fd) => (
            <div key={fd.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 text-xs flex-wrap">
              <span className="font-medium">{fd.label}</span>
              <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{fd.key}</code>
              <Badge variant="secondary" className="text-xs">{fd.valueType}</Badge>
              {fd.airtableColumn && (
                <span className="text-muted-foreground">→ Airtable: <code className="bg-muted px-1 rounded">{fd.airtableColumn}</code></span>
              )}
              {fd.stepNumber && <span className="text-muted-foreground">Step {fd.stepNumber}</span>}
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            To add or modify model fields, update <code>server/seed-rules.ts</code> and re-run it.
          </p>
        </div>
      </details>
    </div>
  );
}
