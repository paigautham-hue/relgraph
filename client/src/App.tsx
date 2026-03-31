import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function HomeRoute() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container flex min-h-screen items-center justify-center py-16">
        <div className="w-full max-w-3xl rounded-3xl border border-border bg-card px-8 py-12 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            RelGraph Starter Template
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            RelGraph
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Relationship Intelligence Platform starter scaffold built with React 19, Vite 7,
            TypeScript, Tailwind CSS 4, Wouter, Express, Drizzle, and Manus runtime integration.
          </p>
        </div>
      </div>
    </main>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route>
        <HomeRoute />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
