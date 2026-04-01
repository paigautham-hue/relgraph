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
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [, navigate] = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
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

  const onSubmit = (data: LoginForm) => loginMutation.mutate(data);

  const isPending = isSubmitting || loginMutation.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 to-teal-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--relgraph-primary)] text-white font-bold text-xl select-none">
            R
          </div>
          <CardTitle className="text-2xl">RelGraph</CardTitle>
          <CardDescription>Relationship Intelligence Platform</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
              disabled={isPending}
            >
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Sign in
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                window.location.href = getLoginUrl();
              }}
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
            >
              Sign in with Manus
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
