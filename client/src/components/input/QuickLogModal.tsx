import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/common/AvatarInitials";
import { InputMethodBadge } from "@/components/common/InputMethodBadge";
import { VoiceRecorder } from "./VoiceRecorder";
import { toast } from "sonner";
import {
  Mic,
  Type,
  FormInput,
  Loader2,
  MapPin,
  Calendar,
  Zap,
  Save,
} from "lucide-react";
import type { InputMethod, InteractionType } from "@shared/enums";

const INTERACTION_TYPE_OPTIONS: { value: InteractionType; label: string }[] = [
  { value: "one_on_one_meeting", label: "1:1 Meeting" },
  { value: "group_meeting", label: "Group Meeting" },
  { value: "conference", label: "Conference" },
  { value: "phone_call", label: "Phone Call" },
  { value: "meal", label: "Meal" },
  { value: "event", label: "Event" },
  { value: "email", label: "Email" },
  { value: "social", label: "Social" },
  { value: "other", label: "Other" },
];

interface ParsedResult {
  personName?: string;
  personId?: string;
  interactionType?: string;
  date?: string;
  location?: string;
  summary?: string;
  intelPoints?: string[];
  actionItems?: string[];
  reflections?: string[];
}

interface QuickLogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickLogModal({ open, onOpenChange }: QuickLogModalProps) {
  const [activeTab, setActiveTab] = useState<string>("voice");
  const [parsedResult, setParsedResult] = useState<ParsedResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Text tab state
  const [textInput, setTextInput] = useState("");

  // Form tab state
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedPersonName, setSelectedPersonName] = useState("");
  const [formInteractionType, setFormInteractionType] =
    useState<InteractionType>("one_on_one_meeting");
  const [formDate, setFormDate] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [formLocation, setFormLocation] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formDepth, setFormDepth] = useState("5");

  const utils = trpc.useUtils();

  // Person search
  const personsQuery = trpc.persons.list.useQuery(
    { search: personSearch, pageSize: 10 },
    { enabled: personSearch.length >= 2, refetchOnWindowFocus: false },
  );
  const personResults = personsQuery.data?.data ?? [];

  const createInteraction = trpc.interactions.create.useMutation({
    onSuccess: () => {
      toast.success("Interaction saved to graph");
      utils.interactions.list.invalidate();
      resetAndClose();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save interaction");
      setIsSaving(false);
    },
  });

  const resetAndClose = useCallback(() => {
    setParsedResult(null);
    setTextInput("");
    setPersonSearch("");
    setSelectedPersonId("");
    setSelectedPersonName("");
    setFormInteractionType("one_on_one_meeting");
    setFormDate(new Date().toISOString().slice(0, 16));
    setFormLocation("");
    setFormSummary("");
    setFormDepth("5");
    setIsSaving(false);
    onOpenChange(false);
  }, [onOpenChange]);

  // Voice recording handler
  const handleVoiceTranscription = useCallback(
    (_text: string, _blob: Blob) => {
      // In production, this would call trpc.voice.transcribe then trpc.voice.extract
      // For now, set a placeholder parsed result
      setParsedResult({
        summary: _text,
        interactionType: "one_on_one_meeting",
        date: new Date().toISOString(),
      });
    },
    [],
  );

  // Text tab parse handler (placeholder for Phase 2a AI parsing)
  const handleTextParse = useCallback(() => {
    if (!textInput.trim()) return;
    setParsedResult({
      summary: textInput.trim(),
      interactionType: "other",
      date: new Date().toISOString(),
    });
    toast.info("AI parsing will be available in Phase 2a. Using raw text.");
  }, [textInput]);

  // Form tab save handler
  const handleFormSave = useCallback(() => {
    if (!selectedPersonId) {
      toast.error("Please select a person");
      return;
    }
    if (!formSummary.trim()) {
      toast.error("Please enter a summary");
      return;
    }

    setIsSaving(true);
    createInteraction.mutate({
      type: formInteractionType,
      occurredAt: new Date(formDate).toISOString(),
      location: formLocation || undefined,
      summary: formSummary.trim(),
      depthScore: parseInt(formDepth, 10) || undefined,
      inputMethod: "form" as InputMethod,
      participants: [{ personId: selectedPersonId, role: "attendee" }],
    });
  }, [
    selectedPersonId,
    formSummary,
    formInteractionType,
    formDate,
    formLocation,
    formDepth,
    createInteraction,
  ]);

  // Save parsed result (from Voice or Text tabs)
  const handleSaveParsed = useCallback(() => {
    if (!parsedResult?.summary) {
      toast.error("No data to save");
      return;
    }

    // If we have a person matched, save as interaction
    const personId = parsedResult.personId || selectedPersonId;
    if (!personId) {
      toast.error("Please select a person to associate this interaction with");
      return;
    }

    setIsSaving(true);
    const interactionType = (parsedResult.interactionType ||
      "other") as InteractionType;

    createInteraction.mutate({
      type: interactionType,
      occurredAt: parsedResult.date || new Date().toISOString(),
      location: parsedResult.location || undefined,
      summary: parsedResult.summary,
      inputMethod: (activeTab === "voice" ? "voice" : "text") as InputMethod,
      participants: [{ personId, role: "attendee" }],
    });
  }, [parsedResult, selectedPersonId, activeTab, createInteraction]);

  const selectPerson = useCallback(
    (id: string, name: string) => {
      setSelectedPersonId(id);
      setSelectedPersonName(name);
      setPersonSearch("");
      if (parsedResult) {
        setParsedResult({ ...parsedResult, personId: id, personName: name });
      }
    },
    [parsedResult],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--relgraph-primary)]" />
            Quick Log
            <Badge variant="secondary" className="text-xs font-normal ml-1">
              Cmd+L
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="voice" className="flex-1 gap-1.5">
              <Mic className="h-3.5 w-3.5" />
              Voice
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-1 gap-1.5">
              <Type className="h-3.5 w-3.5" />
              Text
            </TabsTrigger>
            <TabsTrigger value="form" className="flex-1 gap-1.5">
              <FormInput className="h-3.5 w-3.5" />
              Form
            </TabsTrigger>
          </TabsList>

          {/* Voice Tab */}
          <TabsContent value="voice" className="space-y-4">
            <VoiceRecorder
              onTranscription={handleVoiceTranscription}
              onError={(err) => toast.error(err)}
            />

            {/* Person selector for voice/text */}
            {parsedResult && !parsedResult.personId && (
              <PersonSearchField
                personSearch={personSearch}
                setPersonSearch={setPersonSearch}
                personResults={personResults}
                selectedPersonName={selectedPersonName}
                onSelect={selectPerson}
              />
            )}
          </TabsContent>

          {/* Text Tab */}
          <TabsContent value="text" className="space-y-4">
            <div className="space-y-1.5">
              <Label>Describe the interaction</Label>
              <Textarea
                placeholder='e.g. "Had coffee with Rajesh Kumar from SBI yesterday. He mentioned the new digital lending push and is looking for partners..."'
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>
            <Button
              type="button"
              onClick={handleTextParse}
              disabled={!textInput.trim()}
              className="w-full"
            >
              Parse & Preview
            </Button>

            {parsedResult && !parsedResult.personId && (
              <PersonSearchField
                personSearch={personSearch}
                setPersonSearch={setPersonSearch}
                personResults={personResults}
                selectedPersonName={selectedPersonName}
                onSelect={selectPerson}
              />
            )}
          </TabsContent>

          {/* Form Tab */}
          <TabsContent value="form" className="space-y-4">
            {/* Person search */}
            <PersonSearchField
              personSearch={personSearch}
              setPersonSearch={setPersonSearch}
              personResults={personResults}
              selectedPersonName={selectedPersonName}
              onSelect={selectPerson}
            />

            {/* Interaction type */}
            <div className="space-y-1.5">
              <Label>Interaction Type</Label>
              <Select
                value={formInteractionType}
                onValueChange={(v) =>
                  setFormInteractionType(v as InteractionType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date and Location */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Date & Time
                </Label>
                <Input
                  type="datetime-local"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Location
                </Label>
                <Input
                  placeholder="Where did it happen?"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                />
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-1.5">
              <Label>Summary</Label>
              <Textarea
                placeholder="What happened? Key points discussed..."
                value={formSummary}
                onChange={(e) => setFormSummary(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Depth Score */}
            <div className="space-y-1.5">
              <Label>Depth Score (1-10)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={formDepth}
                onChange={(e) => setFormDepth(e.target.value)}
              />
            </div>

            <Button
              type="button"
              onClick={handleFormSave}
              disabled={isSaving || !selectedPersonId || !formSummary.trim()}
              className="w-full"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save to Graph
            </Button>
          </TabsContent>
        </Tabs>

        {/* Parsed Result Preview (Voice & Text tabs) */}
        {parsedResult && activeTab !== "form" && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">Parsed Result</h4>
              <InputMethodBadge
                method={activeTab === "voice" ? "voice" : "text"}
              />
            </div>

            {/* Person */}
            {(parsedResult.personName || selectedPersonName) && (
              <div className="flex items-center gap-2">
                <AvatarInitials
                  name={parsedResult.personName || selectedPersonName}
                  size="sm"
                />
                <span className="text-sm font-medium">
                  {parsedResult.personName || selectedPersonName}
                </span>
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {parsedResult.interactionType && (
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <Badge variant="secondary">
                    {parsedResult.interactionType}
                  </Badge>
                </div>
              )}
              {parsedResult.date && (
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p>
                    {new Date(parsedResult.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              )}
              {parsedResult.location && (
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p>{parsedResult.location}</p>
                </div>
              )}
            </div>

            {/* Summary */}
            {parsedResult.summary && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Summary</p>
                <p className="text-sm">{parsedResult.summary}</p>
              </div>
            )}

            {/* Intel Points */}
            {parsedResult.intelPoints && parsedResult.intelPoints.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Intel Points
                </p>
                <ul className="text-sm space-y-1">
                  {parsedResult.intelPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-[var(--relgraph-primary)] mt-0.5">
                        *
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {parsedResult.actionItems && parsedResult.actionItems.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Action Items
                </p>
                <ul className="text-sm space-y-1">
                  {parsedResult.actionItems.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">-</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Save button */}
            <Button
              type="button"
              onClick={handleSaveParsed}
              disabled={isSaving}
              className="w-full"
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save to Graph
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- Person Search Sub-component ---

function PersonSearchField({
  personSearch,
  setPersonSearch,
  personResults,
  selectedPersonName,
  onSelect,
}: {
  personSearch: string;
  setPersonSearch: (v: string) => void;
  personResults: Array<{ id: string; name: string; currentTitle?: string | null }>;
  selectedPersonName: string;
  onSelect: (id: string, name: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Person</Label>
      {selectedPersonName ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <AvatarInitials name={selectedPersonName} size="sm" />
          <span className="text-sm font-medium flex-1">
            {selectedPersonName}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onSelect("", "");
              setPersonSearch("");
            }}
            className="h-auto px-2 py-1 text-xs"
          >
            Change
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder="Search for a person..."
            value={personSearch}
            onChange={(e) => setPersonSearch(e.target.value)}
          />
          {personSearch.length >= 2 && personResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-lg max-h-48 overflow-y-auto">
              {personResults.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                  onClick={() => onSelect(person.id, person.name)}
                >
                  <AvatarInitials name={person.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium">{person.name}</p>
                    {person.currentTitle && (
                      <p className="text-xs text-muted-foreground">
                        {person.currentTitle}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
