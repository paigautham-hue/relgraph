import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { AvatarInitials } from "@/components/common/AvatarInitials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

const roleOptions = ["viewer", "contributor", "manager", "admin", "super_admin"] as const;

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(roleOptions),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const allowlistSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(roleOptions),
});

type InviteForm = z.infer<typeof inviteSchema>;
type AllowlistForm = z.infer<typeof allowlistSchema>;

const roleColors: Record<string, string> = {
  super_admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  contributor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  analyst: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge className={roleColors[role] ?? roleColors.viewer}>
      {role.replaceAll("_", " ")}
    </Badge>
  );
}

export default function UserManagement() {
  const [page, setPage] = useState(1);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const pageSize = 20;

  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const usersQuery = trpc.admin.listUsers.useQuery(
    { page, pageSize },
    { refetchOnWindowFocus: false },
  );
  const allowlistQuery = trpc.admin.listRegistrationAllowlist.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const currentUserRole = meQuery.data?.role ?? "viewer";
  const canManageSuperAdmin = currentUserRole === "super_admin";
  const assignableRoles = useMemo(
    () => roleOptions.filter((role) => canManageSuperAdmin || role !== "super_admin"),
    [canManageSuperAdmin],
  );

  const inviteForm = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "", role: "viewer", password: "" },
  });

  const allowlistForm = useForm<AllowlistForm>({
    resolver: zodResolver(allowlistSchema),
    defaultValues: { email: "", role: "viewer" },
  });

  const invalidateAdminViews = async () => {
    await Promise.all([
      utils.admin.listUsers.invalidate(),
      utils.admin.listRegistrationAllowlist.invalidate(),
      utils.auth.me.invalidate(),
    ]);
  };

  const inviteMutation = trpc.admin.inviteUser.useMutation({
    onSuccess: async () => {
      toast.success("User account created");
      setInviteDialogOpen(false);
      inviteForm.reset();
      await invalidateAdminViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create user");
    },
  });

  const addAllowlistMutation = trpc.admin.addRegistrationAllowlistEmail.useMutation({
    onSuccess: async () => {
      toast.success("Email approved for registration");
      allowlistForm.reset({ email: "", role: "viewer" });
      await invalidateAdminViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to approve email");
    },
  });

  const removeAllowlistMutation = trpc.admin.removeRegistrationAllowlistEmail.useMutation({
    onSuccess: async () => {
      toast.success("Email removed from registration allowlist");
      await invalidateAdminViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to remove email");
    },
  });

  const updateMutation = trpc.admin.updateUser.useMutation({
    onSuccess: async () => {
      toast.success("User updated");
      await invalidateAdminViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update user");
    },
  });

  const onInviteSubmit = (data: InviteForm) => {
    inviteMutation.mutate({
      ...data,
      domainIds: [],
    } as any);
  };

  const onAllowlistSubmit = (data: AllowlistForm) => {
    addAllowlistMutation.mutate(data as any);
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateMutation.mutate({ id: userId, role } as any);
  };

  const handleToggleActive = (userId: string, isActive: boolean) => {
    updateMutation.mutate({ id: userId, isActive } as any);
  };

  const users = (usersQuery.data as any)?.data ?? [];
  const totalPages = (usersQuery.data as any)?.totalPages ?? 1;
  const total = (usersQuery.data as any)?.total ?? 0;
  const loading = usersQuery.isLoading;
  const allowlistedEmails = (allowlistQuery.data as any[]) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" subtitle={`${total} users`}>
        <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
              <UserPlus className="mr-2 h-4 w-4" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create User</DialogTitle>
              <DialogDescription>
                Provision a user directly with a password, or use the registration allowlist below for self-service onboarding.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-name">Full Name</Label>
                <Input id="invite-name" placeholder="Jane Smith" {...inviteForm.register("name")} />
                {inviteForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{inviteForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" type="email" placeholder="jane@company.com" {...inviteForm.register("email")} />
                {inviteForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{inviteForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-password">Temporary Password</Label>
                <Input id="invite-password" type="password" placeholder="At least 8 characters" {...inviteForm.register("password")} />
                {inviteForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{inviteForm.formState.errors.password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={inviteForm.watch("role")}
                  onValueChange={(value) => inviteForm.setValue("role", value as InviteForm["role"])}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Mail className="mr-2 h-4 w-4" />
                  Create account
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="allowlist">Registration Allowlist</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[260px]">User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-28" /></div></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))
                  : users.length === 0
                    ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">No users yet</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                    : users.map((user: any) => {
                        const canEditThisUser = canManageSuperAdmin || user.role !== "super_admin";
                        const selectableRoles = canManageSuperAdmin ? roleOptions : roleOptions.filter((role) => role !== "super_admin");
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <AvatarInitials name={user.name ?? "?"} size="sm" />
                                <div>
                                  <p className="font-medium">{user.name ?? "-"}</p>
                                  {user.role === "super_admin" && (
                                    <p className="text-xs text-muted-foreground">Reserved root account</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{user.email}</TableCell>
                            <TableCell>
                              {canEditThisUser ? (
                                <Select defaultValue={user.role ?? "viewer"} onValueChange={(value) => handleRoleChange(user.id, value)}>
                                  <SelectTrigger className="h-8 w-36">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {selectableRoles.map((role) => (
                                      <SelectItem key={role} value={role}>
                                        {role.replaceAll("_", " ")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <RoleBadge role={user.role} />
                              )}
                            </TableCell>
                            <TableCell>
                              <button onClick={() => canEditThisUser && handleToggleActive(user.id, !user.isActive)} className="focus:outline-none" disabled={!canEditThisUser}>
                                {user.isActive !== false ? (
                                  <Badge className="bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                                ) : (
                                  <Badge variant="secondary" className="hover:bg-secondary/80">Inactive</Badge>
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="allowlist" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[var(--relgraph-primary)]" />
                Registration approvals
              </CardTitle>
              <CardDescription>
                Only admins and super admins can approve email addresses for self-service registration. Users must be pre-approved before they can sign up.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={allowlistForm.handleSubmit(onAllowlistSubmit)} className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="allowlist-email">Approved email</Label>
                  <Input id="allowlist-email" type="email" placeholder="new.user@company.com" {...allowlistForm.register("email")} />
                  {allowlistForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{allowlistForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allowlist-role">Initial role</Label>
                  <Select
                    value={allowlistForm.watch("role")}
                    onValueChange={(value) => allowlistForm.setValue("role", value as AllowlistForm["role"])}
                  >
                    <SelectTrigger id="allowlist-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" disabled={addAllowlistMutation.isPending}>
                  {addAllowlistMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Approve email
                </Button>
              </form>

              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role on signup</TableHead>
                      <TableHead>Approved on</TableHead>
                      <TableHead className="w-[120px] text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allowlistQuery.isLoading ? (
                      Array.from({ length: 3 }).map((_, index) => (
                        <TableRow key={index}>
                          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="ml-auto h-8 w-20" /></TableCell>
                        </TableRow>
                      ))
                    ) : allowlistedEmails.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <div className="py-10 text-center text-sm text-muted-foreground">
                            No emails are currently approved for self-service registration.
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      allowlistedEmails.map((entry: any) => {
                        const protectedEntry = entry.role === "super_admin" && !canManageSuperAdmin;
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="font-medium">{entry.email}</TableCell>
                            <TableCell><RoleBadge role={entry.role} /></TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={protectedEntry || removeAllowlistMutation.isPending}
                                onClick={() => removeAllowlistMutation.mutate({ email: entry.email } as any)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
