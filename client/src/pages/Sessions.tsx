import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import {
  Plus, ArrowLeft, Sparkles, Clock, CheckCircle2, BookOpen,
  Trash2, Pencil, Check, X, ChevronRight, Settings, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, buildUrl } from "@shared/routes";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

// ── Types ────────────────────────────────────────────────────────────────────

interface SessionSummary {
  sessionId: string;
  name: string | null;
  focusArea: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  currentStep: number;
  stepsCompleted: number[];
  schoolName: string | null;
  district: string | null;
  gradeBand: string | null;
}

const TOTAL_STEPS = 8;

function stepLabel(currentStep: number, stepsCompleted: number[]): string {
  if (stepsCompleted.includes(7) || stepsCompleted.includes(8)) return "Recommendations ready";
  if (stepsCompleted.length === 0 && currentStep <= 1) return "Not started";
  return `Step ${currentStep} of ${TOTAL_STEPS}`;
}

function isComplete(s: SessionSummary) {
  return s.stepsCompleted.includes(7) || s.stepsCompleted.includes(8);
}

function displayName(s: SessionSummary): string {
  if (s.name) return s.name;
  if (s.schoolName) {
    return s.district ? `${s.schoolName} — ${s.district}` : s.schoolName;
  }
  return "Untitled Questionnaire";
}

// ── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  onDelete,
  onRename,
}: {
  session: SessionSummary;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const complete = isComplete(session);
  const progress = Math.round((session.stepsCompleted.length / TOTAL_STEPS) * 100);
  const timeAgo = session.updatedAt
    ? formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })
    : null;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(displayName(session));
    setEditing(true);
  };

  const commitEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (draft.trim()) onRename(draft.trim());
    setEditing(false);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(false);
  };

  return (
    <div
      className="group relative rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col"
      onClick={() => navigate(`/ccl/${session.sessionId}`)}
    >
      {/* Card body */}
      <div className="flex-1 p-5">
        {/* Name row */}
        <div className="flex items-start gap-2 mb-3 pr-16">
          {editing ? (
            <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { onRename(draft.trim()); setEditing(false); }
                  if (e.key === "Escape") setEditing(false);
                }}
                className="flex-1 text-sm font-semibold border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={commitEdit} className="text-primary hover:text-primary/80 p-0.5">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <h3 className="text-sm font-semibold text-foreground leading-snug">
              {displayName(session)}
            </h3>
          )}
        </div>

        {/* Meta tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {session.gradeBand && (
            <span className="text-[10px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {session.gradeBand}
            </span>
          )}
          {complete ? (
            <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Complete
            </span>
          ) : (
            <span className="text-[10px] font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              {stepLabel(session.currentStep, session.stepsCompleted)}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 rounded-full bg-muted overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${Math.max(progress, complete ? 100 : 4)}%` }}
          />
        </div>

        {/* Timestamp */}
        {timeAgo && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Updated {timeAgo}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20 rounded-b-xl">
        <div className="flex items-center gap-1">
          <button
            onClick={startEdit}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Rename"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          {complete ? "Review" : session.stepsCompleted.length === 0 ? "Start" : "Continue"}
          <ChevronRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </div>
  );
}

// ── New session dialog ────────────────────────────────────────────────────────

function NewSessionDialog({
  onConfirm,
  onCancel,
  isLoading,
}: {
  onConfirm: (schoolName: string, district: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [schoolName, setSchoolName] = useState("");
  const [district, setDistrict] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;
    onConfirm(schoolName.trim(), district.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h2 className="text-base font-semibold mb-1">Start a new questionnaire</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Enter your school's name to get started. You can add more context in the next step.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">
              School Name <span className="text-destructive">*</span>
            </label>
            <input
              ref={inputRef}
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="e.g. Lincoln High School"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">
              District <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="e.g. Westport Public Schools"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(e as any); }}
            />
          </div>
          <div className="flex gap-3 justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!schoolName.trim() || isLoading}>
              {isLoading ? "Creating…" : "Start Questionnaire"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteDialog({
  name,
  onConfirm,
  onCancel,
}: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
        <h2 className="text-base font-semibold mb-2">Delete questionnaire?</h2>
        <p className="text-sm text-muted-foreground mb-5">
          <span className="font-medium text-foreground">{name}</span> and all its data will be
          permanently deleted. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Sessions() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user, logout, isLoggingOut } = useAuth();
  const [deleteTarget, setDeleteTarget] = useState<SessionSummary | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  const { data: sessions = [], isLoading } = useQuery<SessionSummary[]>({
    queryKey: ["sessions"],
    queryFn: async () => {
      const r = await fetch("/api/sessions/user?focusArea=ccl");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ schoolName, district }: { schoolName: string; district: string }) => {
      const newId = uuidv4();
      const name = district ? `${schoolName} — ${district}` : schoolName;

      await fetch(api.sessions.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: newId, focusArea: "ccl", name }),
      });

      const workflowUrl = buildUrl(api.workflow.updateProgress.path, { sessionId: newId });
      await fetch(workflowUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentStep: 0,
          stepsCompleted: [],
          stepData: { "1": { school_name: schoolName, district } },
        }),
      });

      return newId;
    },
    onSuccess: (newId) => {
      setShowNewDialog(false);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/ccl/${newId}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ sessionId, name }: { sessionId: string; name: string }) => {
      await fetch(buildUrl(api.sessions.update.path, { sessionId }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await fetch(buildUrl(api.sessions.delete.path, { sessionId }), { method: "DELETE" });
    },
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-display font-bold text-primary tracking-tight">Transcend</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest -mt-0.5">Model Recommendation Assistant</span>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
              <button
                onClick={logout}
                disabled={isLoggingOut}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Sign out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        {/* Back + title row */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              All focus areas
            </button>
            <h1 className="text-2xl font-display font-bold text-foreground">Career Connected Learning</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Each questionnaire guides you through identifying strong-fit CCL models for a specific school context.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/admin/settings">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            <Button
              className="gap-2"
              onClick={() => setShowNewDialog(true)}
              disabled={createMutation.isPending}
            >
              <Plus className="w-4 h-4" />
              New Questionnaire
            </Button>
          </div>
        </div>

        {/* Session grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border bg-muted/30 h-44 animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No questionnaires yet</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Start a new questionnaire to find Career Connected Learning models that fit your school.
            </p>
            <Button
              className="gap-2"
              onClick={() => setShowNewDialog(true)}
              disabled={createMutation.isPending}
            >
              <Plus className="w-4 h-4" />
              New Questionnaire
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sessions.map((s) => (
              <SessionCard
                key={s.sessionId}
                session={s}
                onDelete={() => setDeleteTarget(s)}
                onRename={(name) => renameMutation.mutate({ sessionId: s.sessionId, name })}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border py-4 text-center">
        <p className="text-xs text-muted-foreground">Powered by Transcend Education</p>
      </footer>

      {showNewDialog && (
        <NewSessionDialog
          onConfirm={(schoolName, district) => createMutation.mutate({ schoolName, district })}
          onCancel={() => setShowNewDialog(false)}
          isLoading={createMutation.isPending}
        />
      )}

      {deleteTarget && (
        <DeleteDialog
          name={displayName(deleteTarget)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.sessionId)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
