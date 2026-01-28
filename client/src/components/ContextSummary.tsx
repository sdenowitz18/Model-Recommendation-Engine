import { type SchoolContext } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Users, Settings, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ContextSummary({ context }: { context: SchoolContext }) {
  const hasContent = context.vision || 
    (context.desiredOutcomes && context.desiredOutcomes.length > 0) ||
    (context.gradeBands && context.gradeBands.length > 0);

  if (!hasContent) {
    return (
      <div className="text-center p-12 text-muted-foreground bg-muted/30 rounded-xl border border-dashed border-border">
        <h3 className="text-lg font-medium mb-2 text-foreground">Waiting for Context</h3>
        <p>Chat with the advisor to build your school profile.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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

      {context.desiredOutcomes && context.desiredOutcomes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" /> Desired Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {context.desiredOutcomes.map((o, i) => (
              <Badge key={i} variant="secondary">{o}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {context.constraints && context.constraints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Constraints
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {context.constraints.map((c, i) => (
              <Badge key={i} variant="outline" className="border-red-200 bg-red-50 text-red-700">{c}</Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
