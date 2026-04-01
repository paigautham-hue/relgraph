import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
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
import { Textarea } from "@/components/ui/textarea";
import { Globe, Loader2, Palette, Plus } from "lucide-react";

const createDomainSchema = z.object({
  name: z.string().min(1, "Domain name is required"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Enter a valid hex color"),
  description: z.string().optional(),
});

type CreateDomainForm = z.infer<typeof createDomainSchema>;

export default function DomainManagement() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const domainsQuery = trpc.domains.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const utils = trpc.useUtils();

  // domains.create may not exist on the router yet -- guard against it
  const createMutation = (trpc.domains as any).create?.useMutation?.({
    onSuccess: () => {
      toast.success("Domain created");
      setDialogOpen(false);
      form.reset();
      utils.domains.list.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create domain");
    },
  }) ?? { mutate: () => toast.error("Create domain endpoint not available"), isPending: false };

  const form = useForm<CreateDomainForm>({
    resolver: zodResolver(createDomainSchema),
    defaultValues: { name: "", color: "#1D9E75", description: "" },
  });

  const domains = (domainsQuery.data as any) ?? [];
  const loading = domainsQuery.isLoading;

  const onSubmit = (data: CreateDomainForm) => {
    createMutation.mutate(data as any);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domain Management"
        subtitle="Configure industry domains and their visual identity"
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Domain</DialogTitle>
              <DialogDescription>
                Create a new industry domain for categorizing contacts.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="domain-name">Name</Label>
                <Input
                  id="domain-name"
                  placeholder="e.g. Private Banking"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain-color">Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="domain-color-picker"
                    value={form.watch("color")}
                    onChange={(e) =>
                      form.setValue("color", e.target.value)
                    }
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    id="domain-color"
                    placeholder="#1D9E75"
                    {...form.register("color")}
                    className="flex-1"
                  />
                </div>
                {form.formState.errors.color && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.color.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain-desc">Description</Label>
                <Textarea
                  id="domain-desc"
                  placeholder="Optional description..."
                  rows={3}
                  {...form.register("description")}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">
                Description
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-6 w-6 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                  </TableRow>
                ))
              : domains.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Globe className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          No domains configured yet
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Add your first domain to start categorizing contacts
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              : domains.map((domain: any) => (
                  <TableRow key={domain.id}>
                    <TableCell>
                      <div
                        className="h-6 w-6 rounded-full border"
                        style={{
                          backgroundColor: domain.color || "#888",
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {domain.name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                      {domain.description || "-"}
                    </TableCell>
                    <TableCell>
                      {domain.active !== false ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
