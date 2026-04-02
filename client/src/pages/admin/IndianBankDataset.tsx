import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Database, Loader2, ShieldCheck } from "lucide-react";

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function IndianBankDataset() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [selectedDomainId, setSelectedDomainId] = useState("");

  const canManage = useMemo(
    () => user?.role === "admin" || user?.role === "super_admin",
    [user?.role],
  );

  const bankTargetsQuery = trpc.apify.getIndianBankTargets.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const domainsQuery = trpc.domains.list.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const previewQuery = trpc.apify.previewIndianBankSeed.useQuery(
    { domainId: selectedDomainId },
    {
      enabled: canManage && Boolean(selectedDomainId),
      refetchOnWindowFocus: false,
    },
  );

  const seedMutation = trpc.apify.seedIndianBankOrganizations.useMutation({
    onSuccess: async (result) => {
      toast.success(`Seeded ${result.createdOrganizations.length} bank organization(s).`);
      await Promise.all([
        utils.apify.getIndianBankTargets.invalidate(),
        utils.apify.previewIndianBankSeed.invalidate(),
        utils.organizations.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "The bank dataset seed could not be completed.");
    },
  });

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Indian Bank Dataset"
          subtitle="Only administrators can seed and manage the bank target registry."
        />
        <div className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground">
          Your current role does not allow bank dataset administration.
        </div>
      </div>
    );
  }

  const bankTargets = bankTargetsQuery.data ?? [];
  const domains = (domainsQuery.data as Array<{ id: string; name: string }>) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indian Bank Dataset"
        subtitle="Review the working registry for Indian public and private sector banks, then seed the organizations into a selected RelGraph domain."
      >
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm text-muted-foreground">
          <Database className="h-4 w-4" />
          Dataset operations
        </div>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Registry scope</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This workflow is designed to establish the base organization set for Indian banking coverage before leadership records are enriched through Apify-powered discovery and monitoring sources.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bank targets</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{bankTargets.length}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Public sector</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {bankTargets.filter((bank: any) => bank.type === "public_sector").length}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Private sector</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {bankTargets.filter((bank: any) => bank.type === "private_sector").length}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Seed organizations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the target domain that should own the initial bank organization records and monitoring scaffolding.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-domain">Target domain</Label>
            <select
              id="bank-domain"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedDomainId}
              onChange={(event) => setSelectedDomainId(event.target.value)}
            >
              <option value="">Select a domain</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
            disabled={!selectedDomainId || seedMutation.isPending}
            onClick={() => seedMutation.mutate({ domainId: selectedDomainId })}
          >
            {seedMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Seed bank organizations
          </Button>

          {previewQuery.data ? (
            <div className="rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
              <p>
                The current preview maps <span className="font-medium text-foreground">{previewQuery.data.banks.length}</span> banks into the domain <span className="font-medium text-foreground">{previewQuery.data.domain.name}</span>.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
              Select a domain to preview the organization seed set.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Working bank registry</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This table shows the current target list that will underpin discovery, enrichment, and leadership monitoring workflows.
            </p>
          </div>
          <Badge variant="secondary">Review before seed</Badge>
        </div>

        {bankTargetsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : bankTargets.length === 0 ? (
          <div className="rounded-2xl border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            The bank target registry is not available yet.
          </div>
        ) : (
          <div className="rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankTargets.map((bank: any) => (
                  <TableRow key={bank.name}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{bank.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bank.headquarters || "Headquarters not yet captured"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{formatLabel(bank.type || "other")}</TableCell>
                    <TableCell>
                      {bank.website ? (
                        <a
                          href={bank.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--relgraph-primary)] hover:underline"
                        >
                          {bank.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {bank.organizationExists ? (
                        <Badge>Seeded</Badge>
                      ) : (
                        <Badge variant="secondary">Pending seed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
