import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { AvatarInitials } from "@/components/common/AvatarInitials";
import { DomainBadge } from "@/components/common/DomainBadge";
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
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";

const createPersonSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  title: z.string().optional(),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  domainId: z.string().optional(),
  category: z.string().optional(),
});

type CreatePersonForm = z.infer<typeof createPersonSchema>;

export default function PersonList() {
  const [, navigate] = useLocation();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const pageSize = 20;

  const domainsQuery = trpc.domains.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const personsQuery = trpc.persons.list.useQuery(
    {
      page,
      pageSize,
      search: search || undefined,
      domainId: domainFilter || undefined,
      category: (categoryFilter || undefined) as any,
    },
    { refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();
  const createMutation = trpc.persons.create.useMutation({
    onSuccess: () => {
      toast.success("Person created");
      setDialogOpen(false);
      utils.persons.list.invalidate();
      form.reset();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create person");
    },
  });

  const form = useForm<CreatePersonForm>({
    resolver: zodResolver(createPersonSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      title: "",
      email: "",
      phone: "",
    },
  });

  const persons = (personsQuery.data as any)?.items ?? [];
  const totalPages = (personsQuery.data as any)?.totalPages ?? 1;
  const total = (personsQuery.data as any)?.total ?? 0;
  const loading = personsQuery.isLoading;
  const domains = (domainsQuery.data as any) ?? [];

  const onCreateSubmit = (data: CreatePersonForm) => {
    createMutation.mutate(data as any);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="People" subtitle={`${total} contacts tracked`}>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
              <Plus className="mr-2 h-4 w-4" />
              Add Person
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Person</DialogTitle>
              <DialogDescription>
                Create a new contact in your relationship graph.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit(onCreateSubmit)}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    {...form.register("firstName")}
                  />
                  {form.formState.errors.firstName && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    {...form.register("lastName")}
                  />
                  {form.formState.errors.lastName && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Managing Director"
                  {...form.register("title")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@example.com"
                  {...form.register("email")}
                />
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
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, title, or org..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={domainFilter}
          onValueChange={(v) => {
            setDomainFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Domains</SelectItem>
            {domains.map((d: any) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="decision_maker">Decision Maker</SelectItem>
            <SelectItem value="influencer">Influencer</SelectItem>
            <SelectItem value="gatekeeper">Gatekeeper</SelectItem>
            <SelectItem value="champion">Champion</SelectItem>
            <SelectItem value="end_user">End User</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">Name</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Tracked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              : persons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {search
                            ? "No contacts match your search"
                            : "No contacts yet"}
                        </p>
                        {!search && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Add your first person to start building your graph
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              : persons.map((person: any) => {
                  const fullName = [person.firstName, person.lastName]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <TableRow
                      key={person.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/persons/${person.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <AvatarInitials name={fullName} size="sm" />
                          <span className="font-medium">{fullName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.title || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {person.organization?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {person.domain ? (
                          <DomainBadge
                            name={person.domain.name}
                            color={person.domain.color || "#888"}
                          />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {person.tracked ? (
                          <Badge
                            variant="default"
                            className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary)]"
                          >
                            Tracked
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Untracked</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
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
