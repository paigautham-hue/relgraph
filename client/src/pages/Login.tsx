import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck } from "lucide-react";
import { getLoginUrl } from "@/const";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const requestAccessSchema = z.object({
  name: z.string().min(1, "Enter your full name").optional().or(z.literal("")),
  email: z.string().email("Enter a valid email"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type RequestAccessForm = z.infer<typeof requestAccessSchema>;

export default function LoginPage() {
  const [, navigate] = useLocation();

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const requestAccessForm = useForm<RequestAccessForm>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: { name: "", email: "" },
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("Welcome to RelGraph");
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || "Login failed");
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("Password set successfully. You are now signed in.");
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || "Registration failed");
    },
  });

  const setupPasswordMutation = trpc.auth.setupPassword.useMutation({
    onSuccess: () => {
      toast.success("Password created successfully. You are now signed in.");
      navigate("/");
    },
    onError: (err) => {
      toast.error(err.message || "Password setup failed");
    },
  });

  const requestAccessMutation = trpc.auth.requestAccess.useMutation({
    onSuccess: (result) => {
      if (result.status === "approved") {
        toast.success(result.message);
      } else {
        toast.success(result.message);
      }
      requestAccessForm.reset({ name: "", email: "" });
    },
    onError: (err) => {
      toast.error(err.message || "Request failed");
    },
  });

  const onLoginSubmit = (data: LoginForm) => loginMutation.mutate(data);

  const onRegisterSubmit = (data: RegisterForm) => {
    registerMutation.mutate({
      name: data.name.trim(),
      email: data.email,
      password: data.password,
    });
  };

  const onSetupPasswordSubmit = (data: RegisterForm) => {
    setupPasswordMutation.mutate({
      name: data.name.trim(),
      email: data.email,
      password: data.password,
    });
  };

  const onRequestAccessSubmit = (data: RequestAccessForm) => {
    requestAccessMutation.mutate({
      name: data.name?.trim() || undefined,
      email: data.email,
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100 p-4 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--relgraph-primary)] text-xl font-bold text-white select-none">
            R
          </div>
          <CardTitle className="text-2xl">RelGraph</CardTitle>
          <CardDescription>Relationship Intelligence Platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-sm text-teal-900">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              Access is approval-based
            </div>
            <p>
              New users cannot open-register. An admin or super admin must approve the email first.
              Once approved, use <strong>Register</strong> or <strong>Set password</strong> below.
            </p>
          </div>

          <Tabs defaultValue="login" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
              <TabsTrigger value="setup">Set password</TabsTrigger>
              <TabsTrigger value="request">Request access</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="you@company.com" autoComplete="email" {...loginForm.register("email")} />
                  {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" placeholder="••••••••" autoComplete="current-password" {...loginForm.register("password")} />
                  {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" disabled={loginMutation.isPending}>
                  {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </form>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = getLoginUrl();
                  }}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
                >
                  Sign in with Manus
                </button>
              </div>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name">Full name</Label>
                  <Input id="register-name" placeholder="Gautham" autoComplete="name" {...registerForm.register("name")} />
                  {registerForm.formState.errors.name && <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">Approved email</Label>
                  <Input id="register-email" type="email" placeholder="you@company.com" autoComplete="email" {...registerForm.register("email")} />
                  {registerForm.formState.errors.email && <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Create password</Label>
                  <Input id="register-password" type="password" placeholder="At least 8 characters" autoComplete="new-password" {...registerForm.register("password")} />
                  {registerForm.formState.errors.password && <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>}
                </div>
                <Button type="submit" className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" disabled={registerMutation.isPending}>
                  {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Complete registration
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="setup" className="space-y-4">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                Use this if your email has already been approved but you have not created a password yet. This is the correct first step for <strong>gautham@manipalgroup.info</strong>.
              </div>
              <form onSubmit={registerForm.handleSubmit(onSetupPasswordSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="setup-name">Full name</Label>
                  <Input id="setup-name" placeholder="Gautham" autoComplete="name" {...registerForm.register("name")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-email">Email</Label>
                  <Input id="setup-email" type="email" placeholder="gautham@manipalgroup.info" autoComplete="email" {...registerForm.register("email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup-password">New password</Label>
                  <Input id="setup-password" type="password" placeholder="Create your password" autoComplete="new-password" {...registerForm.register("password")} />
                </div>
                <Button type="submit" className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" disabled={setupPasswordMutation.isPending}>
                  {setupPasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Set password and sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="request" className="space-y-4">
              <form onSubmit={requestAccessForm.handleSubmit(onRequestAccessSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="request-name">Full name</Label>
                  <Input id="request-name" placeholder="Jane Smith" autoComplete="name" {...requestAccessForm.register("name")} />
                  {requestAccessForm.formState.errors.name && <p className="text-xs text-destructive">{requestAccessForm.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-email">Work email</Label>
                  <Input id="request-email" type="email" placeholder="you@company.com" autoComplete="email" {...requestAccessForm.register("email")} />
                  {requestAccessForm.formState.errors.email && <p className="text-xs text-destructive">{requestAccessForm.formState.errors.email.message}</p>}
                </div>
                <Button type="submit" className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" disabled={requestAccessMutation.isPending}>
                  {requestAccessMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Request access
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
