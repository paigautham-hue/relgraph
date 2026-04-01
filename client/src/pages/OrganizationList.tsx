import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/common/PageHeader";
import { DomainBadge } from "@/components/common/DomainBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export default function OrganizationList() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const orgsQuery = trpc.organizations.list.useQuery({
    page,
    pageSize: 25,
    search: search || undefined,
    domainId: domainFilter || undefined,
  });

  const domainsQuery = trpc.domains.list.useQuery();
  const createMutation = trpc.organizations.create.useMutation({
    onSuccess: () => {
      toast.success("Organization created");
      setDialogOpen(false);
      orgsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = orgsQuery.data;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Organizations" subtitle="Tracked organizations across all sectors">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1D9E75] hover:bg-[#178a65]">
              <Plus className="mr-2 h-4 w-4" /> Add Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Organization</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  name: fd.get("name") as string,
                  shortName: (fd.get("shortName") as string) || undefined,
                  domainId: fd.get("domainId") as string,
                  city: (fd.get("city") as string) || undefined,
                  website: (fd.get("website") as string) || undefined,
                });
              }}
            >
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input name="name" required />
              </div>
              <div className="space-y-2">
                <Label>Short Name</Label>
                <Input name="shortName" />
              </div>
              <div className="space-y-2">
                <Label>Domain *</Label>
                <select name="domainId" required className="w-full rounded-md border px-3 py-2 text-sm">
                  <option value="">Select domain</option>
                  {(domainsQuery.data as any[])?.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input name="city" />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input name="website" type="url" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={domainFilter} onValueChange={(v) => { setDomainFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {(domainsQuery.data as any[])?.map((d: any) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Short Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>City</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgsQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !data?.data?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  <Building2 className="mx-auto h-8 w-8 mb-2 opacity-50" />
                  No organizations found
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((org: any) => (
                <TableRow key={org.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground">{org.shortName || "—"}</TableCell>
                  <TableCell>
                    {org.domainName ? (
                      <DomainBadge name={org.domainName} color={org.domainColor || "#888"} />
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {org.type ? (
                      <Badge variant="outline" className="text-xs capitalize">
                        {org.type.replace(/_/g, " ")}
                      </Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{org.city || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages} ({data.total} organizations)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
