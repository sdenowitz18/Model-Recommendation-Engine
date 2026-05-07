import { Switch, Route, Redirect, useLocation, useParams } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Sessions from "@/pages/Sessions";
import WorkflowV2 from "@/pages/WorkflowV2";
import ModelDetail from "@/pages/ModelDetail";
import LeapDetail from "@/pages/LeapDetail";
import PracticeDetail from "@/pages/PracticeDetail";
import AdminSettings from "@/pages/AdminSettings";
import Login from "@/pages/Login";
import VerifyEmail from "@/pages/VerifyEmail";
import { useAuth } from "@/hooks/use-auth";

function LegacyV2Redirect() {
  const params = useParams<{ sessionId: string }>();
  return <Redirect to={`/ccl/${params.sessionId}`} />;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  if (!user.emailVerifiedAt) {
    return <Redirect to={`/verify-email?email=${encodeURIComponent(user.email)}`} />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  if (!user.emailVerifiedAt) {
    return <Redirect to={`/verify-email?email=${encodeURIComponent(user.email)}`} />;
  }

  if (!user.isAdmin) {
    return <Redirect to="/ccl" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/" component={() => <ProtectedRoute component={Landing} />} />
      {/* Session list for CCL */}
      <Route path="/ccl" component={() => <ProtectedRoute component={Sessions} />} />
      {/* Workflow for a specific session */}
      <Route path="/ccl/:sessionId" component={() => <ProtectedRoute component={WorkflowV2} />} />
      {/* Legacy /ccl-v2 → redirect to unified route */}
      <Route path="/ccl-v2/:sessionId" component={LegacyV2Redirect} />
      {/* Legacy /workflow → send to sessions list */}
      <Route path="/workflow">
        <Redirect to="/ccl" />
      </Route>
      <Route path="/models/:id" component={() => <ProtectedRoute component={ModelDetail} />} />
      <Route path="/leaps/:id" component={() => <ProtectedRoute component={LeapDetail} />} />
      <Route path="/practices/:id" component={() => <ProtectedRoute component={PracticeDetail} />} />
      <Route path="/admin/import" component={() => { window.location.replace("/admin/settings"); return null; }} />
      <Route path="/admin/settings" component={() => <AdminRoute component={AdminSettings} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
