import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Settings2, ShieldCheck } from "lucide-react";

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type CategoryConfig = {
  category: string;
  enabledFieldKeys: string[];
};

export default function ContactImportSettings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [draftCategories, setDraftCategories] = useState<CategoryConfig[]>([]);

  const canManage = useMemo(
    () => user?.role === "admin" || user?.role === "super_admin",
    [user?.role],
  );

  const configQuery = trpc.admin.getContactImportTemplateConfig.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const updateMutation = trpc.admin.updateContactImportTemplateConfig.useMutation({
    onSuccess: async () => {
      toast.success("Import template settings updated.");
      await Promise.all([
        utils.admin.getContactImportTemplateConfig.invalidate(),
        utils.persons.getImportTemplate.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "The template settings could not be updated.");
    },
  });

  useEffect(() => {
    if (!configQuery.data) return;
    setDraftCategories(
      configQuery.data.categories.map((entry) => ({
        category: entry.category,
        enabledFieldKeys: [...entry.enabledFieldKeys],
      })),
    );
  }, [configQuery.data]);

  const hasChanges = useMemo(() => {
    if (!configQuery.data) return false;

    const current = JSON.stringify(
      configQuery.data.categories.map((entry) => ({
        category: entry.category,
        enabledFieldKeys: [...entry.enabledFieldKeys].sort(),
      })),
    );

    const draft = JSON.stringify(
      draftCategories.map((entry) => ({
        category: entry.category,
        enabledFieldKeys: [...entry.enabledFieldKeys].sort(),
      })),
    );

    return current !== draft;
  }, [configQuery.data, draftCategories]);

  const toggleField = (category: string, fieldKey: string, checked: boolean) => {
    setDraftCategories((current) =>
      current.map((entry) => {
        if (entry.category !== category) return entry;
        const nextKeys = checked
          ? Array.from(new Set([...entry.enabledFieldKeys, fieldKey]))
          : entry.enabledFieldKeys.filter((value) => value !== fieldKey);

        return {
          ...entry,
          enabledFieldKeys: nextKeys,
        };
      }),
    );
  };

  const handleSave = async () => {
    if (!configQuery.data) return;

    await updateMutation.mutateAsync({
      templateVersion: configQuery.data.templateVersion,
      categories: draftCategories.map((entry) => ({
        category: entry.category as any,
        enabledFieldKeys: entry.enabledFieldKeys as any,
      })),
    });
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Contact Import Settings"
          subtitle="Only administrators can change the official template configuration."
        />
        <div className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground">
          Your current role does not allow import template administration.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact Import Settings"
        subtitle="Control which category-specific fields appear in the official contact import template."
      >
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          Admin template controls
        </div>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_2.05fr]">
        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Template governance</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Changes here affect the official download template used by contributors. Field selections remain grouped by person category to keep imports precise and reviewable.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
            Downloaded templates will automatically reflect the current configuration after saving. Validation will continue to reject unexpected columns or missing required structure.
          </div>

          {configQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : configQuery.data ? (
            <div className="space-y-3 rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-[var(--relgraph-primary)]" />
                Template snapshot
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Version: <span className="font-medium text-foreground">{configQuery.data.templateVersion}</span></p>
                <p>Headers: <span className="font-medium text-foreground">{configQuery.data.headers.length}</span></p>
                <p>Configured categories: <span className="font-medium text-foreground">{configQuery.data.categories.length}</span></p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Category field matrix</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enable or disable optional fields for each category. Core import fields remain fixed and are always included.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {updateMutation.isPending ? (
                <div className="inline-flex items-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </div>
              ) : null}
              <Button type="button" variant="outline" disabled={!hasChanges || updateMutation.isPending} onClick={() => configQuery.data && setDraftCategories(configQuery.data.categories.map((entry) => ({ category: entry.category, enabledFieldKeys: [...entry.enabledFieldKeys] })))}>
                Reset
              </Button>
              <Button type="button" disabled={!hasChanges || updateMutation.isPending} className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]" onClick={handleSave}>
                Save configuration
              </Button>
            </div>
          </div>

          {configQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : !configQuery.data ? (
            <div className="rounded-2xl border bg-background/60 p-6 text-sm text-muted-foreground">
              The template configuration could not be loaded.
            </div>
          ) : (
            <div className="space-y-4">
              {draftCategories.map((categoryConfig, categoryIndex) => (
                <div key={categoryConfig.category} className="rounded-2xl border bg-background/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatLabel(categoryConfig.category)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {categoryConfig.enabledFieldKeys.length} optional fields enabled for this category.
                      </p>
                    </div>
                    <Badge variant="secondary">Optional field group</Badge>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {Object.values(configQuery.data.fieldLibrary).map((field) => {
                      const checked = categoryConfig.enabledFieldKeys.includes(field.key);
                      return (
                        <label
                          key={`${categoryConfig.category}-${field.key}`}
                          className="flex items-start gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleField(categoryConfig.category, field.key, value === true)}
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{field.label}</p>
                            <p className="text-sm text-muted-foreground">{field.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {categoryIndex < draftCategories.length - 1 ? <Separator className="mt-4" /> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
