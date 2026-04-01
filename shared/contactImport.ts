import { PERSON_CATEGORIES, type PersonCategory } from "./enums";

export const CONTACT_IMPORT_TEMPLATE_VERSION = "2026.05";
export const CONTACT_IMPORT_MAX_ROWS = 250;

export type ContactImportBaseColumnKey =
  | "name"
  | "currentTitle"
  | "organizationName"
  | "domainName"
  | "category"
  | "isTracked"
  | "photoUrl";

export type ContactImportExtraFieldKey =
  | "email"
  | "phone"
  | "linkedInUrl"
  | "city"
  | "notes"
  | "assistantName"
  | "assistantEmail"
  | "sectorFocus"
  | "officeLocation";

export type ContactImportFieldKey = ContactImportBaseColumnKey | ContactImportExtraFieldKey;

export type ContactImportColumnDefinition = {
  key: ContactImportFieldKey;
  label: string;
  required: boolean;
  description: string;
  categoryScoped?: boolean;
};

export type ContactImportCategoryFieldConfig = {
  category: PersonCategory;
  enabledFieldKeys: ContactImportExtraFieldKey[];
};

export const CONTACT_IMPORT_BASE_COLUMNS: ContactImportColumnDefinition[] = [
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
];

export const CONTACT_IMPORT_FIELD_LIBRARY: Record<
  ContactImportExtraFieldKey,
  ContactImportColumnDefinition
> = {
  email: {
    key: "email",
    label: "email",
    required: false,
    description: "Optional primary work email address.",
    categoryScoped: true,
  },
  phone: {
    key: "phone",
    label: "phone",
    required: false,
    description: "Optional direct phone or mobile number in international format.",
    categoryScoped: true,
  },
  linkedInUrl: {
    key: "linkedInUrl",
    label: "linkedInUrl",
    required: false,
    description: "Optional public LinkedIn profile URL.",
    categoryScoped: true,
  },
  city: {
    key: "city",
    label: "city",
    required: false,
    description: "Optional city associated with the contact’s current role.",
    categoryScoped: true,
  },
  notes: {
    key: "notes",
    label: "notes",
    required: false,
    description: "Optional short contextual note for the importer to preserve.",
    categoryScoped: true,
  },
  assistantName: {
    key: "assistantName",
    label: "assistantName",
    required: false,
    description: "Optional executive assistant name when relevant.",
    categoryScoped: true,
  },
  assistantEmail: {
    key: "assistantEmail",
    label: "assistantEmail",
    required: false,
    description: "Optional executive assistant email address.",
    categoryScoped: true,
  },
  sectorFocus: {
    key: "sectorFocus",
    label: "sectorFocus",
    required: false,
    description: "Optional sector or policy focus area for the contact.",
    categoryScoped: true,
  },
  officeLocation: {
    key: "officeLocation",
    label: "officeLocation",
    required: false,
    description: "Optional office or region label for the contact.",
    categoryScoped: true,
  },
};

export const DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS: ContactImportCategoryFieldConfig[] = [
  { category: "banker", enabledFieldKeys: ["email", "phone", "linkedInUrl", "city"] },
  { category: "regulator", enabledFieldKeys: ["email", "phone", "sectorFocus", "officeLocation"] },
  { category: "bureaucrat", enabledFieldKeys: ["email", "phone", "sectorFocus", "officeLocation"] },
  { category: "politician", enabledFieldKeys: ["email", "phone", "officeLocation", "notes"] },
  { category: "corporate", enabledFieldKeys: ["email", "phone", "linkedInUrl", "assistantName", "assistantEmail"] },
  { category: "other", enabledFieldKeys: ["email", "phone", "linkedInUrl", "city", "notes"] },
];

export function getCategoryFieldConfigMap(
  overrides?: ContactImportCategoryFieldConfig[],
) {
  const source = overrides && overrides.length > 0 ? overrides : DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS;
  return new Map(source.map((entry) => [entry.category, entry.enabledFieldKeys]));
}

export function getEnabledTemplateColumns(overrides?: ContactImportCategoryFieldConfig[]) {
  const enabledFieldKeys = new Set<ContactImportExtraFieldKey>();
  const configMap = getCategoryFieldConfigMap(overrides);
  const enabledGroups = Array.from(configMap.values());

  for (const fields of enabledGroups) {
    for (const key of fields) enabledFieldKeys.add(key);
  }

  return [
    ...CONTACT_IMPORT_BASE_COLUMNS,
    ...Array.from(enabledFieldKeys).map((key) => CONTACT_IMPORT_FIELD_LIBRARY[key]),
  ];
}

export const CONTACT_IMPORT_COLUMNS = getEnabledTemplateColumns(
  DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS,
);

export const CONTACT_IMPORT_HEADERS = CONTACT_IMPORT_COLUMNS.map((column) => column.label);

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
  "If likely duplicates are detected, the importer stops and requires resolution before any contacts are created.",
  "The AI quality check runs after structural validation. Import is enabled only when the file passes deterministic checks and the AI review does not flag the file for correction.",
] as const;

export type ContactImportHeader = (typeof CONTACT_IMPORT_HEADERS)[number];
