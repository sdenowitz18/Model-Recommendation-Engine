import { useState } from "react";
import { type SchoolContext } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Target, GraduationCap, Lightbulb, AlertTriangle, Sparkles, X, Plus, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { api } from "@shared/routes";

interface ContextSummaryProps {
  context: SchoolContext;
  sessionId: string;
  onRecommendationsGenerated?: () => void;
}

export function ContextSummary({ context, sessionId, onRecommendationsGenerated }: ContextSummaryProps) {
  const [newOutcome, setNewOutcome] = useState("");
  const [newPractice, setNewPractice] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newConstraint, setNewConstraint] = useState("");

  const updateContextMutation = useMutation({
    mutationFn: async (patch: Partial<SchoolContext>) => {
      return apiRequest("POST", `/api/sessions/${sessionId}/context`, patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.sessions.getContext.path, sessionId] });
    },
  });

  const generateRecommendationsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/sessions/${sessionId}/generate-recommendations`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.models.recommend.path, sessionId] });
      queryClient.invalidateQueries({ queryKey: [api.sessions.getContext.path, sessionId] });
      onRecommendationsGenerated?.();
    },
  });

  const addItem = (field: keyof SchoolContext, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const currentArray = (context[field] as string[]) || [];
    updateContextMutation.mutate({ [field]: [...currentArray, value.trim()] });
    setter("");
  };

  const removeItem = (field: keyof SchoolContext, index: number) => {
    const currentArray = (context[field] as string[]) || [];
    updateContextMutation.mutate({ [field]: currentArray.filter((_, i) => i !== index) });
  };

  const hasMinimumContext = 
    (context.gradeBands?.length || 0) > 0 && 
    ((context.desiredOutcomes?.length || 0) > 0 || (context.keyPractices?.length || 0) > 0);

  const hasAnyContent = context.vision || 
    (context.desiredOutcomes && context.desiredOutcomes.length > 0) ||
    (context.gradeBands && context.gradeBands.length > 0) ||
    (context.keyPractices && context.keyPractices.length > 0);

  if (!hasAnyContent) {
    return (
      <div className="text-center p-12 text-muted-foreground bg-muted/30 rounded-xl border border-dashed border-border">
        <h3 className="text-lg font-medium mb-2 text-foreground">Waiting for Context</h3>
        <p>Chat with the advisor to build your school profile, or add details directly below.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold font-display text-foreground">Your School Profile</h2>
          <p className="text-sm text-muted-foreground">Review and edit your context before generating recommendations</p>
        </div>
        <Button
          size="lg"
          disabled={!hasMinimumContext || generateRecommendationsMutation.isPending}
          onClick={() => generateRecommendationsMutation.mutate()}
          className="shadow-lg"
          data-testid="button-generate-recommendations"
        >
          {generateRecommendationsMutation.isPending ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5 mr-2" />
          )}
          Generate Recommendations
        </Button>
      </div>

      {!hasMinimumContext && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Add at least one grade level and one outcome or practice to generate recommendations.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {context.vision && (
          <Card className="col-span-full border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                <Target className="w-4 h-4" /> Vision Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm italic text-foreground/80">"{context.vision}"</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Grade Levels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {context.gradeBands?.map((g, i) => (
                <Badge key={i} variant="secondary" className="pr-1 flex items-center gap-1">
                  {g}
                  <button 
                    onClick={() => removeItem("gradeBands", i)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                    data-testid={`button-remove-grade-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="e.g., K-5, 6-8, 9-12" 
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem("gradeBands", newGrade, setNewGrade)}
                className="text-sm"
                data-testid="input-add-grade"
              />
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => addItem("gradeBands", newGrade, setNewGrade)}
                data-testid="button-add-grade"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" /> Desired Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {context.desiredOutcomes?.map((o, i) => (
                <Badge key={i} variant="secondary" className="pr-1 flex items-center gap-1">
                  {o}
                  <button 
                    onClick={() => removeItem("desiredOutcomes", i)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                    data-testid={`button-remove-outcome-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="e.g., critical thinking, collaboration" 
                value={newOutcome}
                onChange={(e) => setNewOutcome(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem("desiredOutcomes", newOutcome, setNewOutcome)}
                className="text-sm"
                data-testid="input-add-outcome"
              />
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => addItem("desiredOutcomes", newOutcome, setNewOutcome)}
                data-testid="button-add-outcome"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Lightbulb className="w-4 h-4" /> Key Practices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {context.keyPractices?.map((p, i) => (
                <Badge key={i} variant="secondary" className="pr-1 flex items-center gap-1">
                  {p}
                  <button 
                    onClick={() => removeItem("keyPractices", i)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                    data-testid={`button-remove-practice-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="e.g., project-based, personalized" 
                value={newPractice}
                onChange={(e) => setNewPractice(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem("keyPractices", newPractice, setNewPractice)}
                className="text-sm"
                data-testid="input-add-practice"
              />
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => addItem("keyPractices", newPractice, setNewPractice)}
                data-testid="button-add-practice"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Constraints
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {context.constraints?.map((c, i) => (
                <Badge key={i} variant="outline" className="border-red-200 bg-red-50 text-red-700 pr-1 flex items-center gap-1">
                  {c}
                  <button 
                    onClick={() => removeItem("constraints", i)}
                    className="ml-1 hover:bg-red-100 rounded-full p-0.5"
                    data-testid={`button-remove-constraint-${i}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input 
                placeholder="e.g., limited budget, short timeline" 
                value={newConstraint}
                onChange={(e) => setNewConstraint(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem("constraints", newConstraint, setNewConstraint)}
                className="text-sm"
                data-testid="input-add-constraint"
              />
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => addItem("constraints", newConstraint, setNewConstraint)}
                data-testid="button-add-constraint"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {context.notes && (
          <Card className="col-span-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Additional Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground/80">{context.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
