import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Workflow from "@/pages/Workflow";
import ModelDetail from "@/pages/ModelDetail";
import AdminImport from "@/pages/admin-import";
import AdminSettings from "@/pages/AdminSettings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Workflow} />
      <Route path="/models/:id" component={ModelDetail} />
      <Route path="/admin/import" component={AdminImport} />
      <Route path="/admin/settings" component={AdminSettings} />
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
