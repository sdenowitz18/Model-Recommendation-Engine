import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { api, buildUrl } from "@shared/routes";
import type { TaxonomyItem } from "@shared/schema";

export default function PracticeDetail() {
  const [, params] = useRoute("/practices/:id");
  const id = params ? parseInt(params.id) : 0;

  const { data: item, isLoading, error } = useQuery<TaxonomyItem>({
    queryKey: [api.taxonomy.getItem.path, id],
    queryFn: async () => {
      const url = buildUrl(api.taxonomy.getItem.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <p className="text-destructive mb-4">Practice not found</p>
        <Link href="/workflow">
          <Button variant="outline">Return to Advisor</Button>
        </Link>
      </div>
    );
  }

  // Parse examples into a list (comma-separated, ending with ", and more.")
  const examplesRaw = (item as any).examples as string | null | undefined;
  const examplesList = examplesRaw
    ? examplesRaw
        .replace(/,?\s*and more\.?$/i, "")
        .split(",")
        .map((e: string) => e.trim())
        .filter(Boolean)
    : [];
  const hasAndMore = examplesRaw ? /and more/i.test(examplesRaw) : false;

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b px-6 py-4 flex items-center gap-4">
        <Link href="/workflow">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Advisor
          </Button>
        </Link>
        <div className="h-6 w-px bg-border" />
        <h1 className="text-lg font-bold font-display truncate">{item.name}</h1>
      </div>

      <main className="max-w-3xl mx-auto p-6 md:p-10 space-y-8">
        {item.description && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h2>
            <p className="text-foreground leading-relaxed">{item.description}</p>
          </section>
        )}

        {examplesList.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Examples</h2>
            <ul className="space-y-2">
              {examplesList.map((example: string, i: number) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-foreground leading-relaxed">{example}</span>
                </li>
              ))}
              {hasAndMore && (
                <li className="flex items-start gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                  <span className="text-muted-foreground italic leading-relaxed">and more</span>
                </li>
              )}
            </ul>
          </section>
        )}

        {!item.description && examplesList.length === 0 && (
          <p className="text-muted-foreground">No additional details available for this practice.</p>
        )}
      </main>
    </div>
  );
}
