import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const CATEGORY_OPTIONS = [
  { value: "strategic_read", label: "Strategic Read" },
  { value: "personality", label: "Personality" },
  { value: "network_dynamics", label: "Network Dynamics" },
  { value: "risk_concern", label: "Risk / Concern" },
  { value: "opportunity", label: "Opportunity" },
] as const;

const CONFIDENCE_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const VISIBILITY_OPTIONS = [
  { value: "contributor", label: "Contributor" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
] as const;

type CategoryValue = (typeof CATEGORY_OPTIONS)[number]["value"];
type ConfidenceValue = (typeof CONFIDENCE_OPTIONS)[number]["value"];
type VisibilityValue = (typeof VISIBILITY_OPTIONS)[number]["value"];

interface ReflectionFormProps {
  personId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReflectionForm({
  personId,
  onSuccess,
  onCancel,
}: ReflectionFormProps) {
  const [category, setCategory] = useState<CategoryValue>("strategic_read");
  const [content, setContent] = useState("");
  const [confidenceLevel, setConfidenceLevel] =
    useState<ConfidenceValue>("medium");
  const [confidenceBasis, setConfidenceBasis] = useState("");
  const [visibilityLevel, setVisibilityLevel] =
    useState<VisibilityValue>("contributor");
  const [linkedInteractionId, setLinkedInteractionId] = useState("");

  const utils = trpc.useUtils();

  const createMutation = trpc.reflections.create.useMutation({
    onSuccess: () => {
      toast.success("Reflection added successfully");
      utils.reflections.list.invalidate({ personId });
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create reflection");
    },
  });

  // Fetch interactions for this person to offer as linkable
  const interactionsQuery = trpc.interactions.list.useQuery(
    { personId, pageSize: 50 },
    { refetchOnWindowFocus: false },
  );
  const interactions = interactionsQuery.data?.data ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Reflection content is required");
      return;
    }

    createMutation.mutate({
      personId,
      category,
      content: content.trim(),
      confidenceLevel,
      confidenceBasis: confidenceBasis.trim() || undefined,
      linkedInteractionId: linkedInteractionId || undefined,
      visibilityLevel,
      inputMethod: "form",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Category */}
      <div className="space-y-1.5">
        <Label htmlFor="reflection-category">Category</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as CategoryValue)}>
          <SelectTrigger id="reflection-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="space-y-1.5">
        <Label htmlFor="reflection-content">Content</Label>
        <Textarea
          id="reflection-content"
          placeholder="Share your reflection or observation..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Confidence */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reflection-confidence">Confidence</Label>
          <Select
            value={confidenceLevel}
            onValueChange={(v) => setConfidenceLevel(v as ConfidenceValue)}
          >
            <SelectTrigger id="reflection-confidence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONFIDENCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reflection-visibility">Visibility</Label>
          <Select
            value={visibilityLevel}
            onValueChange={(v) => setVisibilityLevel(v as VisibilityValue)}
          >
            <SelectTrigger id="reflection-visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Confidence basis */}
      <div className="space-y-1.5">
        <Label htmlFor="reflection-basis">
          Confidence Basis{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="reflection-basis"
          placeholder="What is this assessment based on?"
          value={confidenceBasis}
          onChange={(e) => setConfidenceBasis(e.target.value)}
        />
      </div>

      {/* Link to interaction */}
      {interactions.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="reflection-interaction">
            Link to Interaction{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Select
            value={linkedInteractionId}
            onValueChange={setLinkedInteractionId}
          >
            <SelectTrigger id="reflection-interaction">
              <SelectValue placeholder="Select an interaction..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {interactions.map((interaction) => (
                <SelectItem key={interaction.id} value={interaction.id}>
                  {interaction.type} -{" "}
                  {new Date(interaction.occurredAt as any).toLocaleDateString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={createMutation.isPending || !content.trim()}>
          {createMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Add Reflection
        </Button>
      </div>
    </form>
  );
}
