import { Link } from "wouter";
import { LogOut } from "lucide-react";
import logoUrl from "@/assets/transcend-logo.svg";

/**
 * BrandHeader — the shared top-of-page chrome for every authenticated route.
 * Replaces the previous "coral square + Sparkles icon + Transcend wordmark" lockup
 * with the real Transcend wordmark SVG, sitting on a sand background with a navy
 * underline rule. Uppercase Outfit eyebrow gives it the brand's editorial voice.
 *
 * The Transcend logo SVG lives at client/src/assets/transcend-logo.svg
 * (sourced from the design skill at assets/logos/transcend-logo.svg).
 */
export default function BrandHeader({
  user,
  onLogout,
  isLoggingOut,
}: {
  user?: { email: string } | null;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}) {
  return (
    <header className="border-b border-border bg-white">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-4 group">
          <img
            src={logoUrl}
            alt="Transcend"
            className="h-8 w-auto select-none"
            draggable={false}
          />
          <span className="hidden sm:block pl-4 border-l border-border text-[10px] font-display font-bold uppercase tracking-[0.18em] text-muted-foreground leading-tight">
            Model<br />Recommendation<br />Assistant
          </span>
        </Link>

        {user && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
            {onLogout && (
              <button
                onClick={onLogout}
                disabled={isLoggingOut}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Sign out</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
