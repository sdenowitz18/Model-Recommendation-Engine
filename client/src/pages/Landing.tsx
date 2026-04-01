import { Link } from "wouter";
import { Sparkles, ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const MODEL_TYPES = [
  {
    key: "ccl",
    title: "Career Connected Learning",
    description: "Identify CCL-aligned models and point solutions that fit a community's vision, outcomes, and constraints.",
    available: true,
    href: "/ccl",
  },
  {
    key: "math",
    title: "Math",
    description: "Find math-focused instructional models and curricula aligned to your school's needs.",
    available: false,
  },
  {
    key: "whole-child",
    title: "Whole Child",
    description: "Discover models that address the social, emotional, and academic development of every learner.",
    available: false,
  },
  {
    key: "comp3",
    title: "COMP3",
    description: "Explore competency-based models and micro-credentialing solutions for personalized pathways.",
    available: false,
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-display font-bold text-primary tracking-tight">Transcend</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest -mt-0.5">Model Recommendation Assistant</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-3">
            What types of models and point solutions can I help you find today?
          </h1>
          <p className="text-base text-muted-foreground mb-12 max-w-xl mx-auto">
            Select a focus area to begin a guided process for identifying strong-fit school design models.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {MODEL_TYPES.map((type) => {
              const inner = (
                <div
                  className={cn(
                    "relative rounded-xl border p-6 text-left transition-all",
                    type.available
                      ? "border-border bg-card hover:border-primary/40 hover:shadow-lg cursor-pointer group"
                      : "border-border/60 bg-muted/30 opacity-60 cursor-not-allowed"
                  )}
                >
                  {!type.available && (
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        <Lock className="w-3 h-3" />
                        Coming Soon
                      </span>
                    </div>
                  )}
                  <h2 className={cn(
                    "text-lg font-display font-bold mb-2",
                    type.available ? "text-foreground group-hover:text-primary transition-colors" : "text-muted-foreground"
                  )}>
                    {type.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {type.description}
                  </p>
                  {type.available && (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Get started <ArrowRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              );

              if (type.available && type.href) {
                return (
                  <Link key={type.key} href={type.href}>
                    {inner}
                  </Link>
                );
              }

              return <div key={type.key}>{inner}</div>;
            })}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by Transcend Education
        </p>
      </footer>
    </div>
  );
}
