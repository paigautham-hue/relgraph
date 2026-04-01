import { PERSON_CATEGORIES } from "./enums";

export const CONTACT_IMPORT_TEMPLATE_VERSION = "2026.04";
export const CONTACT_IMPORT_MAX_ROWS = 250;

export const CONTACT_IMPORT_COLUMNS = [
  {
    key: "name",
    label: "name",
    required: true,
    description: "Full contact name exactly as you want it stored.",
  },
  {
    key: "currentTitle",
    label: "currentTitle",
    required: false,
    description: "Current role or designation.",
  },
  {
    key: "organizationName",
    label: "organizationName",
    required: false,
    description: "Existing organization name in RelGraph. Leave blank only if the contact has no organization.",
  },
  {
    key: "domainName",
    label: "domainName",
    required: false,
    description: "Existing domain name for the organization. Required whenever organizationName is filled.",
  },
  {
    key: "category",
    label: "category",
    required: false,
    description: `Optional category. Allowed values: ${PERSON_CATEGORIES.join(", ")}.`,
  },
  {
    key: "isTracked",
    label: "isTracked",
    required: true,
    description: "TRUE or FALSE. Use TRUE for relationship-priority contacts.",
  },
  {
    key: "photoUrl",
    label: "photoUrl",
    required: false,
    description: "Optional public image URL for the contact photo.",
  },
] as const;

export const CONTACT_IMPORT_HEADERS = CONTACT_IMPORT_COLUMNS.map(
  (column) => column.label,
);

export const CONTACT_IMPORT_SAMPLE_ROWS = [
  {
    name: "Anita Rao",
    currentTitle: "Executive Director",
    organizationName: "Axis Bank",
    domainName: "Banking",
    category: "banker",
    isTracked: "TRUE",
    photoUrl: "",
  },
  {
    name: "Rahul Mehta",
    currentTitle: "Joint Secretary",
    organizationName: "Ministry of Finance",
    domainName: "Government",
    category: "bureaucrat",
    isTracked: "TRUE",
    photoUrl: "",
  },
] as const;

export const CONTACT_IMPORT_INSTRUCTIONS = [
  "Use only the official RelGraph template. The import will reject files whose columns differ in any way.",
  "Fill organizationName and domainName exactly as shown in the Organization Reference sheet. The importer will not create missing organizations automatically.",
  "Keep optional cells blank instead of inserting placeholder text such as N/A or Unknown.",
  "Use only the supported categories listed in the template instructions.",
  "The AI quality check runs after structural validation. Import is enabled only when the file passes deterministic checks and the AI review does not flag the file for correction.",
] as const;

export type ContactImportHeader = (typeof CONTACT_IMPORT_HEADERS)[number];
