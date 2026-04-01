import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { api, buildUrl } from "@shared/routes";
import type { TaxonomyItem } from "@shared/schema";

export default function LeapDetail() {
  const [, params] = useRoute("/leaps/:id");
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
        <p className="text-destructive mb-4">LEAP not found</p>
        <Link href="/workflow">
          <Button variant="outline">Return to Advisor</Button>
        </Link>
      </div>
    );
  }

  const detailContent = (item as any).detailContent as string | null | undefined;

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
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Extraordinary Learning</h2>
            <p className="text-foreground leading-relaxed">{item.description}</p>
          </section>
        )}

        {detailContent && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">What this leap can mean</h2>
            <div className="text-foreground leading-relaxed whitespace-pre-wrap">{detailContent}</div>
          </section>
        )}

        {!item.description && !detailContent && (
          <p className="text-muted-foreground">No additional details available for this LEAP.</p>
        )}
      </main>
    </div>
  );
}
