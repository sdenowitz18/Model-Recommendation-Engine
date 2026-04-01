import { useModel } from "@/hooks/use-advisor";
import { Link, useRoute, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft, ExternalLink, School, BookOpen, CheckCircle, Settings,
  Globe, BarChart2, FileText, Check, X, AlertTriangle, Target, ChevronDown, ChevronRight, Zap
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api, buildUrl } from "@shared/routes";
import { useState } from "react";

export default function ModelDetail() {
  const [, params] = useRoute("/models/:id");
  const id = params ? parseInt(params.id) : 0;
  const { data: model, isLoading, error } = useModel(id);
  const [descExpanded, setDescExpanded] = useState(false);

  // Parse session from query string for alignment data
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const sessionId = searchParams.get("session");

  // Fetch recommendations for this session to find alignment data for this model
  const { data: recommendations } = useQuery({
    queryKey: ["recommendations-for-model", sessionId, id],
    queryFn: async () => {
      if (!sessionId) return null;
      const url = buildUrl(api.models.getRecommendations.path, { sessionId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!sessionId && !!id,
  });

  // Find the recommendation for this specific model
  const rec = recommendations?.find?.((r: any) => r.modelId === id);
  const alignment = rec?.alignment || null;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  if (error || !model) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h2 className="text-2xl font-bold text-destructive mb-2">Error loading model</h2>
        <Link href="/workflow">
          <Button variant="outline">Return Home</Button>
        </Link>
      </div>
    );
  }

  const labelColor = (label: string) => {
    if (label === "High") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (label === "Medium") return "bg-amber-100 text-amber-800 border-amber-200";
    if (label === "Low") return "bg-red-100 text-red-800 border-red-200";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b px-6 py-4 flex items-center gap-4">
        <Link href={sessionId ? `/ccl/${sessionId}` : "/ccl"}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Recommendations
          </Button>
        </Link>
        <div className="h-6 w-px bg-border" />
        <h1 className="text-lg font-bold font-display truncate">{model.name}</h1>
      </div>

      <main className="max-w-5xl mx-auto p-6 md:p-10 space-y-10">
        {/* Hero Section */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            {model.grades && model.grades.trim() && (
              <div className="flex flex-wrap gap-2">
                {model.grades.split(',').map((g: string, i: number) => (
                  <Badge key={i} variant="secondary" className="px-3 py-1 text-sm">{g.trim()}</Badge>
                ))}
              </div>
            )}
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight">
              {model.name}
            </h1>
            <div>
              <p className={cn("text-base text-muted-foreground leading-relaxed", !descExpanded && "line-clamp-5")}>
                {model.description}
              </p>
              {model.description && model.description.length > 300 && (
                <button
                  onClick={() => setDescExpanded(!descExpanded)}
                  className="mt-1 text-sm text-primary hover:underline"
                >
                  {descExpanded ? "Show less" : "Read more"}
                </button>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <a href={model.link} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2">
                  Visit Official Site <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            </div>
          </div>
          
          <div className="rounded-3xl overflow-hidden shadow-2xl border-4 border-white rotate-1 hover:rotate-0 transition-transform duration-500">
            {model.imageUrl ? (
              <img src={model.imageUrl} alt={model.name} className="w-full h-auto object-cover" />
            ) : (
              <div className="w-full h-80 bg-muted flex items-center justify-center">
                <School className="w-20 h-20 opacity-20" />
              </div>
            )}
          </div>
        </div>

        {/* Your Alignment Section — only shown when coming from a recommendation */}
        {alignment && (
          <>
            <Separator />
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-primary" />
                <h2 className="text-2xl font-bold font-display">Your Alignment</h2>
              </div>
              <p className="text-muted-foreground">
                Based on the decision frame you built, here is how this model aligns with your selections.
              </p>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AlignmentCard
                  title="Outcomes"
                  icon={<CheckCircle className="w-5 h-5" />}
                  score={alignment.outcomesScore}
                  labelColor={labelColor}
                  expandableChildren
                />
                <AlignmentCard
                  title="LEAPs"
                  icon={<Zap className="w-5 h-5" />}
                  score={alignment.leapsScore}
                  labelColor={labelColor}
                />
                <AlignmentCard
                  title="Practices"
                  icon={<BookOpen className="w-5 h-5" />}
                  score={alignment.practicesScore}
                  labelColor={labelColor}
                  expandableChildren
                />
              </div>

              {/* Constraints */}
              {alignment.constraintFlags && alignment.constraintFlags.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      Constraints ({alignment.constraintFlags.length} Found)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {alignment.constraintFlags.map((flag: any, j: number) => (
                        <div key={j} className="flex items-start gap-3 text-sm">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-foreground">{flag.domain}:</span>{" "}
                            <span className="text-muted-foreground">{flag.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          </>
        )}

        <Separator />

        {/* Model Details */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold font-display">Model Details</h2>

          <div className="grid md:grid-cols-3 gap-10">

            {/* Practices */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <BookOpen className="w-5 h-5" />
                <h3 className="font-bold text-lg">Practices</h3>
              </div>
              <ul className="space-y-3">
                {model.keyPractices
                  ? model.keyPractices.split(',').map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        {item.trim()}
                      </li>
                    ))
                  : <li className="text-sm text-muted-foreground">Not specified</li>
                }
              </ul>
            </div>

            {/* Outcomes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle className="w-5 h-5" />
                <h3 className="font-bold text-lg">Outcomes</h3>
              </div>
              <ul className="space-y-3">
                {model.outcomeTypes
                  ? model.outcomeTypes.split(',').map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                        {item.trim()}
                      </li>
                    ))
                  : <li className="text-sm text-muted-foreground">Not specified</li>
                }
              </ul>
            </div>

            {/* Leaps */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-indigo-600">
                <Zap className="w-5 h-5" />
                <h3 className="font-bold text-lg">Leaps</h3>
              </div>
              <ul className="space-y-3">
                {(model.attributes as any)?.leaps
                  ? (model.attributes as any).leaps.split(',').map((item: string, i: number) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 shrink-0" />
                        {item.trim()}
                      </li>
                    ))
                  : <li className="text-sm text-muted-foreground">Not specified</li>
                }
              </ul>
            </div>

          </div>
        </div>

        <Separator />

        <div className="space-y-8">
          {(model.attributes as any)?.reach && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <Globe className="w-5 h-5" />
                <h3 className="font-bold text-lg">Reach</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {(model.attributes as any).reach}
              </p>
            </div>
          )}

          {(model.attributes as any)?.impact && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <BarChart2 className="w-5 h-5" />
                <h3 className="font-bold text-lg">Proof Points</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {(model.attributes as any).impact}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <FileText className="w-5 h-5" />
              <h3 className="font-bold text-lg">Implementation Materials</h3>
            </div>
            {(model.attributes as any)?.build_items ? (
              <ul className="space-y-2">
                {(model.attributes as any).build_items.split(',').map((item: string, i: number) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 mt-2 shrink-0" />
                    {item.trim()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Unknown</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper component for alignment score cards
// ---------------------------------------------------------------------------

function AlignmentCard({
  title,
  icon,
  score,
  labelColor,
  expandableChildren = false,
}: {
  title: string;
  icon: React.ReactNode;
  score: { label: string; pct: number; earned: number; max: number; matches: any[] } | null;
  labelColor: (label: string) => string;
  expandableChildren?: boolean;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (!score || !score.matches || score.matches.length === 0) return null;

  const matchedItems = score.matches.filter((m: any) => m.matched);
  const unmatchedItems = score.matches.filter((m: any) => !m.matched);

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const tierLabel = (imp: string) =>
    imp === "most_important" ? "Must Have" : imp === "important" ? "Important" : "Nice to Have";

  const renderMatchRow = (m: any, j: number, matched: boolean) => {
    const hasChildren = expandableChildren && m.children && m.children.length > 0;
    const isExpanded = expandedGroups.has(m.name);

    return (
      <div key={`${matched ? "m" : "u"}-${j}`}>
        <div
          className={cn("flex items-center gap-2 text-sm", hasChildren && "cursor-pointer select-none")}
          onClick={hasChildren ? () => toggleGroup(m.name) : undefined}
        >
          {matched ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <X className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span className={matched ? "text-foreground" : "text-muted-foreground"}>{m.name}</span>
          <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{tierLabel(m.importance)}</span>
          {hasChildren && (
            <span className="ml-1 text-muted-foreground/50">
              {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <ul className="ml-6 mt-1 mb-1 space-y-0.5">
            {m.children.map((c: any) => (
              <li key={c.name} className="text-xs text-muted-foreground/70 list-disc ml-2">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            {icon}
            {title}
          </div>
          <Badge className={cn("text-xs border", labelColor(score.label))}>
            {score.label} ({score.pct}%)
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {matchedItems.map((m: any, j: number) => renderMatchRow(m, j, true))}
          {unmatchedItems.map((m: any, j: number) => renderMatchRow(m, j, false))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {matchedItems.length} of {score.matches.length} matched ({score.earned}/{score.max} weighted points)
        </p>
      </CardContent>
    </Card>
  );
}
