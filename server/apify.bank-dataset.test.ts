import { beforeEach, describe, expect, it, vi } from "vitest";
import { apifySourceConfigs, bankLeadershipRecords, organizations } from "./db/schema";
import { createBankLeadershipRecord, seedIndianBankOrganizations } from "./services/apify.service";

const uuidState = vi.hoisted(() => {
  let counter = 0;
  return {
    next() {
      counter += 1;
      return `uuid-${counter}`;
    },
    reset() {
      counter = 0;
    },
  };
});

const dbState = vi.hoisted(() => ({
  current: null as any,
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => uuidState.next()),
}));

vi.mock("./db", () => ({
  getDb: () => dbState.current,
}));

vi.mock("./_core/env", () => ({
  ENV: {
    apifyApiToken: "test-apify-token",
  },
}));

type OrganizationRow = {
  id: string;
  name: string;
  domainId: string;
  type: string | null;
  website: string | null;
  city: string | null;
};

type MonitoringConfigRow = {
  id: string;
  name: string;
  capability: string;
  targetType: string;
  targetOrganizationId: string | null;
  createdBy: number | null;
};

type LeadershipRecordRow = {
  id: string;
  organizationId: string | null;
  sourceConfigId: string | null;
  bankName: string;
  personName: string;
  title: string;
  roleType: string;
  bankType: string | null;
  sourceUrl: string;
  sourceType: string;
  validationStatus: string;
  createdBy: number | null;
};

function createSeedDbMock(options?: { organizations?: OrganizationRow[] }) {
  const organizationRows: OrganizationRow[] = [...(options?.organizations ?? [])];
  const monitoringConfigRows: MonitoringConfigRow[] = [];
  const leadershipRecordRows: LeadershipRecordRow[] = [];

  const insertValues = vi.fn(async (value: Record<string, any> | Array<Record<string, any>>) => {
    const rows = Array.isArray(value) ? value : [value];

    for (const row of rows) {
      if ("capability" in row) {
        monitoringConfigRows.push(row as MonitoringConfigRow);
        continue;
      }

      if ("roleType" in row) {
        leadershipRecordRows.push(row as LeadershipRecordRow);
        continue;
      }

      organizationRows.push(row as OrganizationRow);
    }
  });

  const insert = vi.fn(() => ({
    values: insertValues,
  }));

  const select = vi.fn(() => ({
    from: (table: unknown) => {
      if (table === organizations) {
        return {
          then: (resolve: (value: OrganizationRow[]) => unknown) => Promise.resolve(resolve([...organizationRows])),
          where: vi.fn(() => ({
            then: (resolve: (value: OrganizationRow[]) => unknown) => Promise.resolve(resolve([...organizationRows])),
            limit: vi.fn(async (count: number) => organizationRows.slice(0, count)),
          })),
        };
      }

      if (table === apifySourceConfigs) {
        return {
          where: vi.fn(async () => [...monitoringConfigRows]),
        };
      }

      if (table === bankLeadershipRecords) {
        return {
          where: vi.fn(() => ({
            then: (resolve: (value: LeadershipRecordRow[]) => unknown) => Promise.resolve(resolve([...leadershipRecordRows])),
            limit: vi.fn(async (count: number) => leadershipRecordRows.slice(0, count)),
          })),
          orderBy: vi.fn(async () => [...leadershipRecordRows]),
          limit: vi.fn(async (count: number) => leadershipRecordRows.slice(0, count)),
        };
      }

      throw new Error("Unexpected table access in Apify bank dataset test");
    },
  }));

  return {
    insert,
    select,
    organizationRows,
    monitoringConfigRows,
    leadershipRecordRows,
    spies: {
      insert,
      insertValues,
      select,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  uuidState.reset();
  dbState.current = null;
});

describe("apify bank dataset seeding", () => {
  it("stores bank organizations with the database-supported type and nulls non-numeric createdBy values for legacy tables", async () => {
    const dbMock = createSeedDbMock();
    dbState.current = dbMock;

    const result = await seedIndianBankOrganizations("domain-indian-banks", "admin-user-1");

    expect(result.createdOrganizations).toHaveLength(31);
    expect(dbMock.organizationRows).toHaveLength(31);
    expect(dbMock.monitoringConfigRows).toHaveLength(31);

    for (const organization of dbMock.organizationRows) {
      expect(organization.domainId).toBe("domain-indian-banks");
      expect(organization.type).toBe("bank");
      expect(organization.website).toMatch(/^https:\/\//);
    }

    for (const config of dbMock.monitoringConfigRows) {
      expect(config.capability).toBe("monitoring");
      expect(config.targetType).toBe("organization");
      expect(config.createdBy).toBeNull();
      expect(config.name).toContain("leadership monitor");
      expect(config.targetOrganizationId).toBeTruthy();
    }
  });

  it("preserves numeric legacy user ids for monitoring configs when available", async () => {
    const dbMock = createSeedDbMock();
    dbState.current = dbMock;

    await seedIndianBankOrganizations("domain-indian-banks", "30001");

    expect(dbMock.monitoringConfigRows).toHaveLength(31);
    for (const config of dbMock.monitoringConfigRows) {
      expect(config.createdBy).toBe(30001);
    }
  });
});

describe("manual bank leadership ingestion compatibility", () => {
  it("stores null createdBy for manual leadership records when the acting user id is not legacy numeric", async () => {
    const dbMock = createSeedDbMock({
      organizations: [
        {
          id: "org-bank-1",
          name: "State Bank of India",
          domainId: "domain-indian-banks",
          type: "bank",
          website: "https://sbi.co.in",
          city: "Mumbai",
        },
      ],
    });
    dbState.current = dbMock;

    const result = await createBankLeadershipRecord(
      {
        organizationId: "org-bank-1",
        bankName: "State Bank of India",
        personName: "Jane Banker",
        title: "Managing Director & CEO",
        sourceUrl: "https://sbi.co.in/about/leadership",
        sourceType: "official_bank_website",
        sourceExcerpt: "Official leadership page confirms the current managing director.",
      },
      "admin-user-uuid",
    );

    expect(dbMock.leadershipRecordRows).toHaveLength(1);
    expect(dbMock.leadershipRecordRows[0]?.createdBy).toBeNull();
    expect(dbMock.leadershipRecordRows[0]?.bankType).toBe("bank");
    expect(result.personName).toBe("Jane Banker");
    expect(result.validationStatus).toBe("official_source_confirmed");
  });

  it("preserves numeric legacy user ids for manual leadership records when available", async () => {
    const dbMock = createSeedDbMock({
      organizations: [
        {
          id: "org-bank-2",
          name: "HDFC Bank",
          domainId: "domain-indian-banks",
          type: "bank",
          website: "https://www.hdfcbank.com",
          city: "Mumbai",
        },
      ],
    });
    dbState.current = dbMock;

    await createBankLeadershipRecord(
      {
        organizationId: "org-bank-2",
        bankName: "HDFC Bank",
        personName: "Rahul Executive",
        title: "Executive Director",
        sourceUrl: "https://www.hdfcbank.com/about/leadership",
        sourceType: "official_bank_website",
      },
      "30001",
    );

    expect(dbMock.leadershipRecordRows).toHaveLength(1);
    expect(dbMock.leadershipRecordRows[0]?.createdBy).toBe(30001);
  });
});
