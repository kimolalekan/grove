import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Metrics from "@/pages/metrics";
import Logs from "@/pages/logs";
import Alerts from "@/pages/alerts";
import Users from "@/pages/users";
import Apikeys from "@/pages/apikeys";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/layout";
function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Metrics} />
      <Route path="/metrics" component={Metrics} />
      <Route path="/logs" component={Logs} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/users" component={Users} />
      <Route path="/apikeys" component={Apikeys} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ThemeProvider>
            {" "}
            {/* Wrap your app with ThemeProvider */}
            <Toaster />
            <Router />
          </ThemeProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
