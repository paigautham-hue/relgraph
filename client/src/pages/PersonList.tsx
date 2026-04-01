import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  History,
  Settings2,
} from "lucide-react";
import { PERSON_CATEGORIES } from "@shared/enums";

type PersonCategory = (typeof PERSON_CATEGORIES)[number];

type ImportRow = {
  rowNumber: number;
  name?: string;
  currentTitle?: string;
  organizationName?: string;
  domainName?: string;
  category?: PersonCategory;
  isTracked?: string | boolean | number;
  photoUrl?: string;
  [key: string]: string | number | boolean | undefined;
};

const CONTACT_IMPORT_BASE_FIELD_KEYS = new Set([
  "name",
  "currentTitle",
  "organizationName",
  "domainName",
  "category",
  "isTracked",
  "photoUrl",
]);

type ParsedUpload = {
  source: "csv" | "xlsx" | "xls";
  headers: string[];
  rows: ImportRow[];
};

const creatPersonSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
  currentTitle: z.string().max(255, "Title is too long").optional(),
  currentOrgId: z.string().uuid().optional().or(z.literal("")),
  category: z.enum(PERSON_CATEGORIES).optional().or(z.literal("")),
  isTracked: z.boolean(),
  photoUrl: z.string().url("Use a valid public URL").optional().or(z.literal("")),
});

type CreatePersonForm = z.infer<typeof creatPersonSchema>;

function inferSource(fileName: string): ParsedUpload["source"] {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".xlsx")) return "xlsx";
  if (normalized.endsWith(".xls")) return "xls";
  return "csv";
}

async function parseUploadFile(file: File): Promise<ParsedUpload> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((value) => String(value ?? "").trim());
  const mappedRows = dataRows
    .filter((row) => row.some((value) => String(value ?? "").trim() !== ""))
    .map((row, index) => {
      const cells = Object.fromEntries(
        headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]),
      ) as Record<string, string | number | boolean>;

      const rawCategory = String(cells.category ?? "").trim();
      const category = PERSON_CATEGORIES.includes(rawCategory as PersonCategory)
        ? (rawCategory as PersonCategory)
        : undefined;

      const extraValues = Object.fromEntries(
        headers
          .filter((header) => !CONTACT_IMPORT_BASE_FIELD_KEYS.has(header))
          .map((header) => [header, String(cells[header] ?? "").trim()])
          .filter(([, value]) => value !== ""),
      );

      return {
        ...extraValues,
        rowNumber: index + 2,
        name: String(cells.name ?? "").trim() || undefined,
        currentTitle: String(cells.currentTitle ?? "").trim() || undefined,
        organizationName: String(cells.organizationName ?? "").trim() || undefined,
        domainName: String(cells.domainName ?? "").trim() || undefined,
        category,
        isTracked: cells.isTracked,
        photoUrl: String(cells.photoUrl ?? "").trim() || undefined,
      };
    });

  return {
    source: inferSource(file.name),
    headers,
    rows: mappedRows,
  };
}

function downloadBlob(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function verdictTone(verdict?: string) {
  if (verdict === "pass") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (verdict === "needs_review") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  return "bg-rose-500/10 text-rose-700 border-rose-500/20";
}

function formatVerdict(verdict?: string) {
  if (verdict === "needs_review") return "Needs review";
  if (verdict === "pass") return "Ready to import";
  return "Not ready";
}

export default function PersonList() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [parsedUpload, setParsedUpload] = useState<ParsedUpload | null>(null);
  const pageSize = 20;

  const canImport = useMemo(
    () => ["contributor", "manager", "admin", "super_admin"].includes(user?.role ?? "viewer"),
    [user?.role],
  );
  const canManageImportTemplate = useMemo(
    () => ["admin", "super_admin"].includes(user?.role ?? "viewer"),
    [user?.role],
  );

  const utils = trpc.useUtils();
  const domainsQuery = trpc.domains.list.useQuery(undefined, { refetchOnWindowFocus: false });
  const organizationsQuery = trpc.organizations.list.useQuery(
    {
      page: 1,
      pageSize: 500,
      sortOrder: "asc",
    } as any,
    { refetchOnWindowFocus: false },
  );
  const personsQuery = trpc.persons.list.useQuery(
    {
      page,
      pageSize,
      search: search || undefined,
      domainId: domainFilter || undefined,
      category: (categoryFilter || undefined) as any,
    },
    { refetchOnWindowFocus: false },
  );
  const importTemplateQuery = trpc.persons.getImportTemplate.useQuery(undefined, {
    enabled: canImport,
    refetchOnWindowFocus: false,
  });

  const createMutation = trpc.persons.create.useMutation({
    onSuccess: () => {
      toast.success("Contact created.");
      setCreateDialogOpen(false);
      form.reset();
      utils.persons.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Could not create the contact.");
    },
  });

  const validateImportMutation = trpc.persons.validateImport.useMutation({
    onError: (error) => {
      toast.error(error.message || "The file could not be validated.");
    },
  });

  const commitImportMutation = trpc.persons.commitImport.useMutation({
    onSuccess: async (result) => {
      toast.success(`${result.count} contacts were imported successfully.`);
      setImportDialogOpen(false);
      setParsedUpload(null);
      setSelectedFileName(null);
      await utils.persons.list.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "The import could not be completed.");
    },
  });

  const form = useForm<CreatePersonForm>({
    resolver: zodResolver(creatPersonSchema),
    defaultValues: {
      name: "",
      currentTitle: "",
      currentOrgId: "",
      category: "",
      isTracked: true,
      photoUrl: "",
    },
  });

  const persons = personsQuery.data?.data ?? [];
  const total = personsQuery.data?.total ?? 0;
  const totalPages = personsQuery.data?.totalPages ?? 1;
  const domains = domainsQuery.data ?? [];
  const organizations = organizationsQuery.data?.data ?? [];
  const template = importTemplateQuery.data;
  const organizationReference = ((template as {
    organizationReference?: Array<{
      id: string;
      name: string;
      domainId: string;
      domainName: string;
    }>;
  } | undefined)?.organizationReference ?? []);
  const validation = validateImportMutation.data;
  const previewIssues = validation?.issues ?? [];
  const blockingIssues = previewIssues.filter((issue: any) => issue.severity === "error");

  const onCreateSubmit = (data: CreatePersonForm) => {
    createMutation.mutate({
      name: data.name,
      currentTitle: data.currentTitle || undefined,
      currentOrgId: data.currentOrgId || undefined,
      category: (data.category || undefined) as any,
      isTracked: data.isTracked,
      photoUrl: data.photoUrl || undefined,
    });
  };

  const handleTemplateDownload = (format: "xlsx" | "csv") => {
    if (!template) {
      toast.error("The import template is still loading.");
      return;
    }

    const contactSheetRows = [template.headers, ...template.rows.map((row: any) => template.headers.map((header: string) => row[header] ?? ""))];

    if (format === "csv") {
      const sheet = XLSX.utils.aoa_to_sheet(contactSheetRows);
      const csv = XLSX.utils.sheet_to_csv(sheet);
      downloadBlob("relgraph-contact-import-template.csv", csv, "text/csv;charset=utf-8;");
      return;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(contactSheetRows), "Contacts");
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["RelGraph Contact Import Template"],
        ["Template Version", template.templateVersion],
        [],
        ["Instructions"],
        ...template.instructions.map((line: string) => [line]),
      ]),
      "Instructions",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(organizationReference),
      "Organization Reference",
    );
    XLSX.writeFile(workbook, "relgraph-contact-import-template.xlsx");
  };

  const handleUploadFile = async (file: File) => {
    if (!template) {
      toast.error("The template details are still loading.");
      return;
    }

    try {
      setSelectedFileName(file.name);
      const parsed = await parseUploadFile(file);
      setParsedUpload(parsed);
      await validateImportMutation.mutateAsync({
        fileName: file.name,
        source: parsed.source,
        templateVersion: template.templateVersion,
        headers: parsed.headers,
        rows: parsed.rows,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file could not be read.";
      toast.error(message);
    }
  };

  const handleCommitImport = async () => {
    if (!validation || !validation.ok || !selectedFileName) {
      toast.error("Please upload a valid file and wait for it to pass review.");
      return;
    }

    await commitImportMutation.mutateAsync({
      fileName: selectedFileName,
      templateVersion: validation.templateVersion,
      validationDigest: validation.validationDigest,
      rows: validation.validRows.map((row: any) => ({
        rowNumber: row.rowNumber,
        name: row.name,
        currentTitle: row.currentTitle,
        organizationId: row.organizationId,
        category: row.category,
        isTracked: row.isTracked,
        photoUrl: row.photoUrl,
        extraFieldValues: row.extraFieldValues ?? {},
      })),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="People" subtitle={`${total} contacts tracked`}>
        <div className="flex flex-wrap items-center gap-3">
          {canImport && (
            <Button type="button" variant="outline" onClick={() => navigate("/persons/import-history")}>
              <History className="mr-2 h-4 w-4" />
              Import History
            </Button>
          )}
          {canManageImportTemplate && (
            <Button type="button" variant="outline" onClick={() => navigate("/admin/contact-import")}>
              <Settings2 className="mr-2 h-4 w-4" />
              Import Template Settings
            </Button>
          )}
          {canImport && (
            <Dialog
              open={importDialogOpen}
              onOpenChange={(open) => {
                setImportDialogOpen(open);
                if (!open) {
                  setParsedUpload(null);
                  setSelectedFileName(null);
                  validateImportMutation.reset();
                }
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Import Contacts
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Import contacts with the RelGraph template</DialogTitle>
                  <DialogDescription>
                    Designed to feel calm and precise: download the official template, fill it carefully, then let RelGraph validate structure, organization matches, and AI quality before anything is created.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4 rounded-2xl border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">1. Start with the official template</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Use the downloadable template only. The importer rejects any file with mismatched columns or unknown organizations.
                        </p>
                      </div>
                      <Badge variant="secondary">Required</Badge>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={() => handleTemplateDownload("xlsx")} disabled={!template}>
                        <Download className="mr-2 h-4 w-4" />
                        Download Excel template
                      </Button>
                      <Button type="button" variant="outline" onClick={() => handleTemplateDownload("csv")} disabled={!template}>
                        <Download className="mr-2 h-4 w-4" />
                        Download CSV template
                      </Button>
                    </div>

                    <div className="rounded-2xl bg-muted/40 p-4">
                      <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
                        <div className="space-y-2 text-sm text-muted-foreground">
                          {(template?.instructions ?? []).map((line: string) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="contact-import-file">2. Upload the completed file</Label>
                      <div className="mt-2 rounded-2xl border border-dashed bg-background/60 p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">Excel or CSV supported</p>
                            <p className="text-sm text-muted-foreground">
                              The first sheet must follow the exact template and each upload is limited to 250 rows for a careful review experience.
                            </p>
                          </div>
                          <Label
                            htmlFor="contact-import-file"
                            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Choose file
                          </Label>
                        </div>
                        <Input
                          id="contact-import-file"
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              handleUploadFile(file);
                              event.target.value = "";
                            }
                          }}
                        />
                        {selectedFileName && (
                          <p className="mt-3 text-sm text-muted-foreground">Selected file: {selectedFileName}</p>
                        )}
                      </div>
                    </div>

                    {parsedUpload && (
                      <div className="rounded-2xl border bg-background/70 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold">File preview</p>
                            <p className="text-sm text-muted-foreground">
                              {parsedUpload.rows.length} rows detected across {parsedUpload.headers.length} columns.
                            </p>
                          </div>
                          {validateImportMutation.isPending && (
                            <div className="inline-flex items-center text-sm text-muted-foreground">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Reviewing...
                            </div>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {parsedUpload.headers.map((header) => (
                            <Badge key={header} variant="outline">{header}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 rounded-2xl border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">3. Review the import verdict</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Deterministic checks come first. AI then looks for suspicious patterns before import is unlocked.
                        </p>
                      </div>
                      <Badge className={verdictTone(validation?.review?.verdict)}>
                        {formatVerdict(validation?.review?.verdict)}
                      </Badge>
                    </div>

                    {!validation ? (
                      <div className="rounded-2xl bg-muted/40 p-6 text-sm text-muted-foreground">
                        Upload a template-compliant file to see the review summary, row issues, and import readiness.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-muted/40 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">AI confidence</p>
                            <p className="mt-2 text-2xl font-semibold">{validation.review.score}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{validation.review.summary}</p>
                          </div>
                          <div className="rounded-2xl bg-muted/40 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Validation summary</p>
                            <p className="mt-2 text-2xl font-semibold">{validation.validRows.length}/{validation.rowCount}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {blockingIssues.length} blocking issues, {previewIssues.length - blockingIssues.length} warnings.
                            </p>
                          </div>
                        </div>

                        {validation.blockedByDuplicates && (
                          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-800">
                            <div className="mb-2 inline-flex items-center gap-2 font-medium">
                              <AlertCircle className="h-4 w-4" />
                              Duplicate review required
                            </div>
                            <p>
                              RelGraph found likely duplicate contacts already in the system. This import is intentionally blocked until the source file is corrected or the rows are reviewed from the import history page.
                            </p>
                            {(validation.duplicateRows ?? []).length > 0 && (
                              <div className="mt-4 space-y-3">
                                {(validation.duplicateRows ?? []).map((duplicate: any) => (
                                  <div key={duplicate.rowNumber} className="rounded-xl border border-rose-500/15 bg-background/80 p-3">
                                    <p className="font-medium text-foreground">
                                      Row {duplicate.rowNumber}: {duplicate.name}
                                    </p>
                                    <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                                      {(duplicate.candidates ?? []).map((candidate: any) => (
                                        <div key={candidate.personId} className="rounded-lg border border-border/60 px-3 py-2">
                                          <p className="font-medium text-foreground">{candidate.name}</p>
                                          <p>
                                            {candidate.currentTitle || "No title recorded"}
                                            {candidate.organizationName ? ` · ${candidate.organizationName}` : ""}
                                            {candidate.domainName ? ` · ${candidate.domainName}` : ""}
                                          </p>
                                          <p>Match score: {candidate.score} · {candidate.reason}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {validation.review.warnings.length > 0 && (
                          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-800">
                            <div className="mb-2 inline-flex items-center gap-2 font-medium">
                              <Sparkles className="h-4 w-4" />
                              AI review notes
                            </div>
                            <div className="space-y-2">
                              {validation.review.warnings.map((warning: string) => (
                                <p key={warning}>{warning}</p>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="max-h-[320px] overflow-y-auto rounded-2xl border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[90px]">Row</TableHead>
                                <TableHead className="w-[130px]">Severity</TableHead>
                                <TableHead className="w-[180px]">Field</TableHead>
                                <TableHead>Message</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewIssues.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={4}>
                                    <div className="flex items-center gap-3 py-8 text-sm text-emerald-700">
                                      <ShieldCheck className="h-5 w-5" />
                                      The file passed structural checks. If the AI verdict is ready, you can import safely.
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : (
                                previewIssues.map((issue: any) => (
                                  <TableRow key={`${issue.rowNumber}-${issue.field}-${issue.message}`}>
                                    <TableCell>{issue.rowNumber}</TableCell>
                                    <TableCell>
                                      <Badge
                                        variant="outline"
                                        className={issue.severity === "error" ? "border-rose-500/20 text-rose-700" : "border-amber-500/20 text-amber-700"}
                                      >
                                        {issue.severity}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{issue.field}</TableCell>
                                    <TableCell className="text-muted-foreground">{issue.message}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
                    onClick={handleCommitImport}
                    disabled={!validation?.ok || validation?.blockedByDuplicates || commitImportMutation.isPending || validateImportMutation.isPending}
                  >
                    {commitImportMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Import validated contacts
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
                <Plus className="mr-2 h-4 w-4" />
                Add Person
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add a new contact</DialogTitle>
                <DialogDescription>
                  Create a single contact manually, or use the import flow for a larger, template-driven upload.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" placeholder="Anita Rao" {...form.register("name")} />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="currentTitle">Current title</Label>
                  <Input id="currentTitle" placeholder="Executive Director" {...form.register("currentTitle")} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Organization</Label>
                    <Select
                      value={form.watch("currentOrgId") || "none"}
                      onValueChange={(value) => form.setValue("currentOrgId", value === "none" ? "" : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No organization" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No organization</SelectItem>
                        {organizations.map((organization: any) => (
                          <SelectItem key={organization.id} value={organization.id}>
                            {organization.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={form.watch("category") || "none"}
                      onValueChange={(value) => form.setValue("category", value === "none" ? "" : (value as any))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Optional category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {PERSON_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="photoUrl">Photo URL</Label>
                  <Input id="photoUrl" placeholder="https://example.com/photo.jpg" {...form.register("photoUrl")} />
                  {form.formState.errors.photoUrl && (
                    <p className="text-xs text-destructive">{form.formState.errors.photoUrl.message}</p>
                  )}
                </div>

                <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                  This page is optimized for clean, deliberate contact creation. For large batches, use the import flow with the official template and AI review.
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create contact
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      {!canImport && (
        <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
          <div className="inline-flex items-center gap-2 font-medium text-foreground">
            <AlertCircle className="h-4 w-4 text-[var(--relgraph-primary)]" />
            Contact import is permission-gated.
          </div>
          <p className="mt-2">
            Users with permission to add contacts can download the official template and import Excel or CSV files after validation and AI review.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={domainFilter || "all"}
          onValueChange={(value) => {
            setDomainFilter(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All domains" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {domains.map((domain: any) => (
              <SelectItem key={domain.id} value={domain.id}>
                {domain.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter || "all"}
          onValueChange={(value) => {
            setCategoryFilter(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {PERSON_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
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
            {personsQuery.isLoading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  </TableRow>
                ))
              : persons.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">
                          {search ? "No contacts match your search" : "No contacts yet"}
                        </p>
                        {!search && (
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            Add a person or import a validated template to start building your graph.
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
                : persons.map((person: any) => (
                  <TableRow
                    key={person.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/persons/${person.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <AvatarInitials name={person.name} size="sm" />
                        <span className="font-medium">{person.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{person.currentTitle || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{person.orgName || "-"}</TableCell>
                    <TableCell>
                      {person.domainName ? (
                        <DomainBadge name={person.domainName} color={person.domainColor || "#888888"} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {person.isTracked ? (
                        <Badge className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary)]">Tracked</Badge>
                      ) : (
                        <Badge variant="secondary">Untracked</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
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
