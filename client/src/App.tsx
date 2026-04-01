import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Sessions from "@/pages/Sessions";
import Workflow from "@/pages/Workflow";
import ModelDetail from "@/pages/ModelDetail";
import LeapDetail from "@/pages/LeapDetail";
import PracticeDetail from "@/pages/PracticeDetail";
import AdminSettings from "@/pages/AdminSettings";
import Login from "@/pages/Login";
import { useAuth } from "@/hooks/use-auth";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Landing} />} />
      {/* Session list for CCL */}
      <Route path="/ccl" component={() => <ProtectedRoute component={Sessions} />} />
      {/* Workflow for a specific session */}
      <Route path="/ccl/:sessionId" component={() => <ProtectedRoute component={Workflow} />} />
      {/* Legacy /workflow → send to sessions list */}
      <Route path="/workflow">
        <Redirect to="/ccl" />
      </Route>
      <Route path="/models/:id" component={() => <ProtectedRoute component={ModelDetail} />} />
      <Route path="/leaps/:id" component={() => <ProtectedRoute component={LeapDetail} />} />
      <Route path="/practices/:id" component={() => <ProtectedRoute component={PracticeDetail} />} />
      <Route path="/admin/import" component={() => { window.location.replace("/admin/settings"); return null; }} />
      <Route path="/admin/settings" component={() => <ProtectedRoute component={AdminSettings} />} />
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
