import { useState, useEffect, useCallback } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import LoginPage from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import TodayPage from "./pages/Today";
import GraphPage from "./pages/Graph";
import OpportunitiesPage from "./pages/Opportunities";
import OpportunityDetailPage from "./pages/OpportunityDetail";
import WatchesPage from "./pages/Watches";
import PersonList from "./pages/PersonList";
import PersonProfile from "./pages/PersonProfile";
import UserManagement from "./pages/admin/UserManagement";
import AccessRequestsPage from "./pages/admin/AccessRequests";
import DomainManagement from "./pages/admin/DomainManagement";
import AuditLog from "./pages/admin/AuditLog";
import ContactImportSettings from "./pages/admin/ContactImportSettings";
import ApifyManagement from "./pages/admin/ApifyManagement";
import IndianBankDataset from "./pages/admin/IndianBankDataset";
import AgentOperations from "./pages/admin/AgentOperations";
import AdminHealth from "./pages/admin/AdminHealth";
import NetworkMap from "./pages/NetworkMap";
import PathFinder from "./pages/PathFinder";
import AlertsPage from "./pages/AlertsPage";
import BriefingsPage from "./pages/BriefingsPage";
import OrganizationList from "./pages/OrganizationList";
import PersonImportHistory from "./pages/PersonImportHistory";
import { QuickLogModal } from "./components/input/QuickLogModal";
import ChatPanel from "./components/chat/ChatPanel";

function AppRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={TodayPage} />
        <Route path="/today" component={TodayPage} />
        <Route path="/graph" component={GraphPage} />
        <Route path="/opportunities" component={OpportunitiesPage} />
        <Route path="/opportunities/:id" component={OpportunityDetailPage} />
        <Route path="/watches" component={WatchesPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/persons" component={PersonList} />
        <Route path="/persons/import-history" component={PersonImportHistory} />
        <Route path="/organizations" component={OrganizationList} />
        <Route path="/persons/:id" component={PersonProfile} />
        <Route path="/network" component={NetworkMap} />
        <Route path="/paths" component={PathFinder} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/briefings" component={BriefingsPage} />
        <Route path="/admin/users" component={UserManagement} />
        <Route path="/admin/requests" component={AccessRequestsPage} />
        <Route path="/admin/domains" component={DomainManagement} />
        <Route path="/admin/contact-import" component={ContactImportSettings} />
        <Route path="/admin/apify" component={ApifyManagement} />
        <Route path="/admin/bank-dataset" component={IndianBankDataset} />
        <Route path="/admin/agents" component={AgentOperations} />
        <Route path="/admin/health" component={AdminHealth} />
        <Route path="/admin/audit" component={AuditLog} />
        <Route>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-lg font-medium">Page not found</p>
            <p className="text-sm text-muted-foreground mt-1">
              The page you are looking for does not exist.
            </p>
          </div>
        </Route>
      </Switch>
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <AppRoutes />
      </Route>
    </Switch>
  );
}

export default function App() {
  const [quickLogOpen, setQuickLogOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        setQuickLogOpen((prev) => !prev);
      }
    },
    [],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
          <ChatPanel />
          <QuickLogModal open={quickLogOpen} onOpenChange={setQuickLogOpen} />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
