import { useState } from "react";
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
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  UserPlus,
  Users,
} from "lucide-react";

const inviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "manager", "analyst", "viewer"]),
});

type InviteForm = z.infer<typeof inviteSchema>;

export default function UserManagement() {
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 20;

  const usersQuery = trpc.admin.listUsers.useQuery(
    { page, pageSize },
    { refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();

  const inviteMutation = trpc.admin.inviteUser.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent");
      setDialogOpen(false);
      form.reset();
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send invitation");
    },
  });

  const updateMutation = trpc.admin.updateUser.useMutation({
    onSuccess: () => {
      toast.success("User updated");
      utils.admin.listUsers.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update user");
    },
  });

  const form = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "", role: "analyst" },
  });

  const users = (usersQuery.data as any)?.items ?? [];
  const totalPages = (usersQuery.data as any)?.totalPages ?? 1;
  const total = (usersQuery.data as any)?.total ?? 0;
  const loading = usersQuery.isLoading;

  const onInviteSubmit = (data: InviteForm) => {
    inviteMutation.mutate(data as any);
  };

  const handleRoleChange = (userId: string, role: string) => {
    updateMutation.mutate({ id: userId, role } as any);
  };

  const handleToggleActive = (userId: string, active: boolean) => {
    updateMutation.mutate({ id: userId, active } as any);
  };

  const roleColors: Record<string, string> = {
    admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    manager:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    analyst:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    viewer:
      "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  };

  return (
    <div className="space-y-6">
      <PageHeader title="User Management" subtitle={`${total} users`}>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
              <UserPlus className="mr-2 h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Send an invitation email to join the platform.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit(onInviteSubmit)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="invite-name">Full Name</Label>
                <Input
                  id="invite-name"
                  placeholder="Jane Smith"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="jane@company.com"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  defaultValue="analyst"
                  onValueChange={(v) =>
                    form.setValue("role", v as InviteForm["role"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[260px]">User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Domains</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-36" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          No users yet
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              : users.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <AvatarInitials
                          name={user.name ?? "?"}
                          size="sm"
                        />
                        <span className="font-medium">
                          {user.name ?? "-"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Select
                        defaultValue={user.role ?? "viewer"}
                        onValueChange={(v) => handleRoleChange(user.id, v)}
                      >
                        <SelectTrigger className="h-8 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="analyst">Analyst</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() =>
                          handleToggleActive(user.id, !user.active)
                        }
                        className="focus:outline-none"
                      >
                        {user.active !== false ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400">
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="hover:bg-secondary/80"
                          >
                            Inactive
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.domains?.length
                        ? user.domains
                            .map((d: any) => d.name)
                            .join(", ")
                        : "All"}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
