import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, Mail, ShieldCheck, XCircle } from "lucide-react";

const roleOptions = ["viewer", "contributor", "manager", "admin", "super_admin"] as const;

type RoleOption = (typeof roleOptions)[number];

type RequestRoleState = Record<string, RoleOption>;

const roleColors: Record<RoleOption, string> = {
  super_admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  contributor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

function RoleBadge({ role }: { role: RoleOption }) {
  return <Badge className={roleColors[role]}>{role.replaceAll("_", " ")}</Badge>;
}

export default function AccessRequestsPage() {
  const utils = trpc.useUtils();
  const [selectedRoles, setSelectedRoles] = useState<RequestRoleState>({});

  const meQuery = trpc.auth.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const accessRequestsQuery = trpc.admin.listAccessRequests.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const currentUserRole = meQuery.data?.role ?? "viewer";
  const canManageSuperAdmin = currentUserRole === "super_admin";
  const assignableRoles = useMemo(
    () => roleOptions.filter((role) => canManageSuperAdmin || role !== "super_admin"),
    [canManageSuperAdmin],
  );

  const invalidateViews = async () => {
    await Promise.all([
      utils.admin.listAccessRequests.invalidate(),
      utils.admin.listRegistrationAllowlist.invalidate(),
      utils.admin.listUsers.invalidate(),
      utils.audit.list.invalidate(),
    ]);
  };

  const approveAccessRequestMutation = trpc.admin.approveAccessRequest.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(`Approved ${variables.email}. The user can now set a password.`);
      setSelectedRoles((prev) => {
        const next = { ...prev };
        delete next[variables.email];
        return next;
      });
      await invalidateViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to approve access request");
    },
  });

  const denyAccessRequestMutation = trpc.admin.denyAccessRequest.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(`Denied ${variables.email}`);
      setSelectedRoles((prev) => {
        const next = { ...prev };
        delete next[variables.email];
        return next;
      });
      await invalidateViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to deny access request");
    },
  });

  const accessRequests = (accessRequestsQuery.data as any[]) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Requests"
        subtitle="Review incoming onboarding requests and approve the right role before password setup."
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[var(--relgraph-primary)]" />
                Pending approvals
              </CardTitle>
              <CardDescription>
                Approving a request moves the user into the password-setup state. Denying a request removes the pending record.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              {accessRequestsQuery.isLoading ? "Loading" : `${accessRequests.length} pending`}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                Approval flow
              </div>
              <p>
                Choose the role before approval. Once approved, the user can complete registration from the login page using the <strong>Register</strong> or <strong>Set password</strong> tab.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>
                Reserved identities remain protected. Only the super admin can approve the reserved super-admin account or assign the <strong>super admin</strong> role.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested on</TableHead>
                  <TableHead>Approve as</TableHead>
                  <TableHead className="w-[220px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessRequestsQuery.isLoading ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-8 w-40" /></TableCell>
                    </TableRow>
                  ))
                ) : accessRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex flex-col items-center justify-center py-14 text-center">
                        <Mail className="mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm font-medium">No pending access requests</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          New onboarding requests will appear here for approval.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  accessRequests.map((request: any) => {
                    const protectedRequest =
                      request.email === "gautham@manipalgroup.info" && !canManageSuperAdmin;
                    const selectedRole = (selectedRoles[request.email] ?? "viewer") as RoleOption;
                    const isBusy = approveAccessRequestMutation.isPending || denyAccessRequestMutation.isPending;

                    return (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{request.name || "Pending user"}</p>
                            {protectedRequest ? (
                              <p className="text-xs text-muted-foreground">Reserved account approval requires super-admin access.</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{request.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {request.createdAt ? new Date(request.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Select
                              value={selectedRole}
                              onValueChange={(value) =>
                                setSelectedRoles((prev) => ({
                                  ...prev,
                                  [request.email]: value as RoleOption,
                                }))
                              }
                              disabled={protectedRequest}
                            >
                              <SelectTrigger className="h-9 w-40">
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
                            <RoleBadge role={selectedRole} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isBusy || protectedRequest}
                              onClick={() => denyAccessRequestMutation.mutate({ email: request.email } as any)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Deny
                            </Button>
                            <Button
                              size="sm"
                              className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
                              disabled={isBusy || protectedRequest}
                              onClick={() =>
                                approveAccessRequestMutation.mutate({
                                  email: request.email,
                                  role: selectedRole,
                                } as any)
                              }
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approve
                            </Button>
                          </div>
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
    </div>
  );
}
