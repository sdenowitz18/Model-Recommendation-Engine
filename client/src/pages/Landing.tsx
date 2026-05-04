import { Link } from "wouter";
import { ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import BrandHeader from "@/components/BrandHeader";
import BrandFooter from "@/components/BrandFooter";
import { useAuth } from "@/hooks/use-auth";

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
  const { user, logout, isLoggingOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BrandHeader user={user} onLogout={logout} isLoggingOut={isLoggingOut} />

      <main className="flex-1 flex items-center justify-center px-6 py-16 relative overflow-hidden">
        {/* Decorative dashed swoop in the corner — Transcend marketing motif */}
        <svg
          aria-hidden="true"
          className="absolute -top-10 -left-20 w-[420px] h-[260px] opacity-50 pointer-events-none"
          viewBox="0 0 420 260"
          fill="none"
        >
          <path
            d="M0 220 C 80 80, 240 30, 420 80"
            stroke="#5BC3B4"
            strokeWidth="2"
            strokeDasharray="5 6"
            strokeLinecap="round"
          />
        </svg>

        <div className="max-w-3xl w-full text-center relative z-10">
          <p className="t-eyebrow mb-4">Find your fit</p>
          <h1 className="t-display text-4xl md:text-5xl mb-5">
            What types of models and point solutions
            <br className="hidden md:block" />
            <span className="text-primary"> can I help you find today?</span>
          </h1>
          <p className="text-base text-muted-foreground mb-12 max-w-xl mx-auto">
            Select a focus area to begin a guided process for identifying strong-fit school design models.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto">
            {MODEL_TYPES.map((type) => {
              const inner = (
                <div
                  className={cn(
                    "relative rounded-xl border p-6 text-left transition-all bg-card",
                    type.available
                      ? "border-border hover:border-primary/60 hover:shadow-lg cursor-pointer group"
                      : "border-border/60 bg-muted/30 opacity-60 cursor-not-allowed"
                  )}
                >
                  {!type.available && (
                    <div className="absolute top-3 right-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-display uppercase tracking-[0.14em] font-bold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        <Lock className="w-3 h-3" />
                        Coming Soon
                      </span>
                    </div>
                  )}

                  {type.available && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-6 right-6 h-[3px] bg-primary rounded-b transition-transform origin-left scale-x-0 group-hover:scale-x-100"
                    />
                  )}

                  <h2
                    className={cn(
                      "font-display font-bold uppercase tracking-tight text-xl mb-3 leading-tight",
                      type.available
                        ? "text-foreground group-hover:text-primary transition-colors"
                        : "text-muted-foreground"
                    )}
                  >
                    {type.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {type.description}
                  </p>
                  {type.available && (
                    <div className="flex items-center gap-1.5 text-[11px] font-display font-bold uppercase tracking-[0.16em] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      Get started <ArrowRight className="w-3.5 h-3.5" />
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

      <BrandFooter />
    </div>
  );
}
