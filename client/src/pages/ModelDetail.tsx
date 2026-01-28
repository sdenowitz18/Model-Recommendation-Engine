import { useModel } from "@/hooks/use-advisor";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, School, BookOpen, Users, Cog, CheckCircle, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export default function ModelDetail() {
  const [, params] = useRoute("/models/:id");
  const id = params ? parseInt(params.id) : 0;
  const { data: model, isLoading, error } = useModel(id);

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
        <Link href="/">
          <Button variant="outline">Return Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b px-6 py-4 flex items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Button>
        </Link>
        <div className="h-6 w-px bg-border" />
        <h1 className="text-lg font-bold font-display truncate">{model.name}</h1>
      </div>

      <main className="max-w-5xl mx-auto p-6 md:p-10 space-y-10">
        {/* Hero Section */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
               {model.grades.split(',').map((g, i) => (
                 <Badge key={i} variant="secondary" className="px-3 py-1 text-sm">{g.trim()}</Badge>
               ))}
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground leading-tight">
              {model.name}
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              {model.description}
            </p>
            <div className="flex gap-3 pt-2">
              <Button className="gap-2 shadow-lg shadow-primary/20">
                Start Using This Model
              </Button>
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
              <div className="w-full h-80 bg-secondary/30 flex items-center justify-center">
                <School className="w-20 h-20 opacity-20" />
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Details Grid */}
        <div className="grid md:grid-cols-3 gap-10">
          
          {/* Key Practices */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <BookOpen className="w-5 h-5" />
              <h3 className="font-bold text-lg">Key Practices</h3>
            </div>
            <ul className="space-y-3">
              {model.keyPractices.split(',').map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  {item.trim()}
                </li>
              ))}
            </ul>
          </div>

          {/* Outcomes */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
              <h3 className="font-bold text-lg">Expected Outcomes</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {model.outcomeTypes.split(',').map((item, i) => (
                <div key={i} className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-2 rounded-lg text-sm font-medium">
                  {item.trim()}
                </div>
              ))}
            </div>
          </div>

          {/* Implementation */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Settings className="w-5 h-5" />
              <h3 className="font-bold text-lg">Implementation</h3>
            </div>
            <ul className="space-y-3">
              {model.implementationSupports.split(',').map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 text-xs font-bold">
                    {i+1}
                  </div>
                  <span className="mt-0.5">{item.trim()}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </main>
    </div>
  );
}
