import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

type AccessRequestRow = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  createdAt: string | Date | null;
};

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
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

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

  const accessRequests = useMemo(
    () => ((accessRequestsQuery.data as any[]) ?? []) as AccessRequestRow[],
    [accessRequestsQuery.data],
  );

  const selectableEmails = useMemo(
    () =>
      accessRequests
        .filter((request) => request.email !== "gautham@manipalgroup.info" || canManageSuperAdmin)
        .map((request) => request.email),
    [accessRequests, canManageSuperAdmin],
  );

  const allSelected = selectableEmails.length > 0 && selectableEmails.every((email) => selectedEmails.includes(email));
  const someSelected = selectedEmails.length > 0;

  const invalidateViews = async () => {
    await Promise.all([
      utils.admin.listAccessRequests.invalidate(),
      utils.admin.listRegistrationAllowlist.invalidate(),
      utils.admin.listUsers.invalidate(),
      utils.audit.list.invalidate(),
    ]);
  };

  const clearResolvedSelections = () => {
    setSelectedEmails((current) => current.filter((email) => selectableEmails.includes(email)));
  };

  const approveAccessRequestMutation = trpc.admin.approveAccessRequest.useMutation({
    onSuccess: async (_, variables) => {
      toast.success(`Approved ${variables.email}. The user can now set a password.`);
      setSelectedRoles((prev) => {
        const next = { ...prev };
        delete next[variables.email];
        return next;
      });
      setSelectedEmails((prev) => prev.filter((email) => email !== variables.email));
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
      setSelectedEmails((prev) => prev.filter((email) => email !== variables.email));
      await invalidateViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to deny access request");
    },
  });

  const bulkApproveMutation = trpc.admin.bulkApproveAccessRequests.useMutation({
    onSuccess: async (result) => {
      toast.success(`Approved ${result.count} access request${result.count === 1 ? "" : "s"}.`);
      setSelectedEmails([]);
      setSelectedRoles((prev) => {
        const next = { ...prev };
        for (const email of selectableEmails) {
          if (!selectedEmails.includes(email)) continue;
          delete next[email];
        }
        return next;
      });
      await invalidateViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to bulk approve access requests");
    },
  });

  const bulkDenyMutation = trpc.admin.bulkDenyAccessRequests.useMutation({
    onSuccess: async (result) => {
      toast.success(`Denied ${result.count} access request${result.count === 1 ? "" : "s"}.`);
      setSelectedEmails([]);
      setSelectedRoles((prev) => {
        const next = { ...prev };
        for (const email of result.emails) {
          delete next[email];
        }
        return next;
      });
      await invalidateViews();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to bulk deny access requests");
    },
  });

  const isBusy =
    approveAccessRequestMutation.isPending ||
    denyAccessRequestMutation.isPending ||
    bulkApproveMutation.isPending ||
    bulkDenyMutation.isPending;

  const toggleSelection = (email: string, checked: boolean) => {
    setSelectedEmails((current) => {
      if (checked) {
        return current.includes(email) ? current : [...current, email];
      }
      return current.filter((value) => value !== email);
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedEmails(checked ? selectableEmails : []);
  };

  const handleBulkApprove = () => {
    const requests = selectedEmails.map((email) => ({
      email,
      role: (selectedRoles[email] ?? "viewer") as RoleOption,
    }));
    bulkApproveMutation.mutate({ requests } as any);
  };

  const handleBulkDeny = () => {
    bulkDenyMutation.mutate({ emails: selectedEmails } as any);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access Requests"
        subtitle="Review incoming onboarding requests, assign roles, and process approvals individually or in bulk."
      />

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[var(--relgraph-primary)]" />
                Pending approvals
              </CardTitle>
              <CardDescription>
                Approving a request moves the user into the password-setup state. Denying a request removes the pending record.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                {accessRequestsQuery.isLoading ? "Loading" : `${accessRequests.length} pending`}
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs">
                {`${selectedEmails.length} selected`}
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                Approval flow
              </div>
              <p>
                Choose roles before approval. Bulk actions reuse the currently selected role for each checked request, so admins can process a queue quickly without opening each row one by one.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>
                Reserved identities remain protected. Only the super admin can approve the reserved super-admin account or assign the <strong>super admin</strong> role.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium">Bulk actions</p>
              <p className="text-sm text-muted-foreground">
                Select one or more requests, confirm the role shown in each row, and then approve or deny them together.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!someSelected || isBusy}
                onClick={handleBulkDeny}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Deny selected
              </Button>
              <Button
                size="sm"
                className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
                disabled={!someSelected || isBusy}
                onClick={handleBulkApprove}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve selected
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[48px]">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                        aria-label="Select all access requests"
                        disabled={selectableEmails.length === 0 || isBusy}
                      />
                    </div>
                  </TableHead>
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
                      <TableCell><Skeleton className="mx-auto h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-36" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-8 w-40" /></TableCell>
                    </TableRow>
                  ))
                ) : accessRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
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
                  accessRequests.map((request) => {
                    const protectedRequest =
                      request.email === "gautham@manipalgroup.info" && !canManageSuperAdmin;
                    const selectedRole = (selectedRoles[request.email] ?? "viewer") as RoleOption;
                    const checked = selectedEmails.includes(request.email);

                    return (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggleSelection(request.email, Boolean(value))}
                              aria-label={`Select ${request.email}`}
                              disabled={protectedRequest || isBusy}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{request.name || "Pending user"}</p>
                            {protectedRequest ? (
                              <p className="text-xs text-muted-foreground">
                                Reserved account approval requires super-admin access.
                              </p>
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
                              disabled={protectedRequest || isBusy}
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
