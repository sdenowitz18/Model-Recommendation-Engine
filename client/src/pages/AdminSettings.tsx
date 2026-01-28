import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RotateCcw, Settings, ArrowLeft, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { api } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ConfigResponse {
  systemPrompt: string;
  defaultPrompt: string;
  updatedAt: string | null;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [systemPrompt, setSystemPrompt] = useState("");

  const { data: config, isLoading } = useQuery<ConfigResponse>({
    queryKey: [api.admin.getConfig.path],
  });

  useEffect(() => {
    if (config?.systemPrompt) {
      setSystemPrompt(config.systemPrompt);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (prompt: string) => {
      return apiRequest("POST", api.admin.saveConfig.path, { systemPrompt: prompt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.getConfig.path] });
      toast({
        title: "Settings saved",
        description: "Your custom instructions have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(systemPrompt);
  };

  const handleResetToSaved = () => {
    if (config?.systemPrompt) {
      setSystemPrompt(config.systemPrompt);
    }
  };

  const handleResetToDefault = () => {
    if (config?.defaultPrompt) {
      setSystemPrompt(config.defaultPrompt);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Advisor
            </Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Settings className="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle>Advisor Custom Instructions</CardTitle>
                <CardDescription>
                  Configure how the AI advisor behaves, what phases it follows, and how it guides users through the discovery process.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                System Prompt
              </label>
              <p className="text-xs text-muted-foreground">
                This prompt defines the advisor's personality, conversation phases, and behavior. 
                The current session context and JSON response format are automatically appended.
              </p>
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter your custom instructions for the AI advisor..."
                className="min-h-[500px] font-mono text-sm"
                data-testid="input-system-prompt"
              />
            </div>

            {config?.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(config.updatedAt).toLocaleString()}
              </p>
            )}

            <div className="flex items-center gap-3 pt-4 border-t flex-wrap">
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save-config"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={handleResetToSaved}
                disabled={saveMutation.isPending}
                data-testid="button-reset-config"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Undo Changes
              </Button>
              <Button
                variant="outline"
                onClick={handleResetToDefault}
                disabled={saveMutation.isPending}
                data-testid="button-reset-default"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset to Default
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Tips for Writing Custom Instructions</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              <strong>Define phases:</strong> Structure the conversation into clear phases like "Context Discovery", "Readiness Check", "Recommendations", and "Comparison".
            </p>
            <p>
              <strong>Set behavior rules:</strong> Tell the advisor to ask one question at a time, summarize periodically, and never overwhelm users with long lists.
            </p>
            <p>
              <strong>Specify what to collect:</strong> List the key information categories like desired outcomes, grade bands, key practices, constraints, and implementation supports.
            </p>
            <p>
              <strong>Guide recommendations:</strong> Explain how the advisor should recommend models - with rationale, assumptions, and watch-outs.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
