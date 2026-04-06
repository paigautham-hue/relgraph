import { beforeEach, describe, expect, it, vi } from "vitest";
import { apifySourceConfigs, organizations } from "./db/schema";
import { seedIndianBankOrganizations } from "./services/apify.service";

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
  createdBy: string | null;
};

function createSeedDbMock() {
  const organizationRows: OrganizationRow[] = [];
  const monitoringConfigRows: MonitoringConfigRow[] = [];

  const insertValues = vi.fn(async (row: Record<string, any>) => {
    if ("capability" in row) {
      monitoringConfigRows.push(row as MonitoringConfigRow);
      return;
    }

    organizationRows.push(row as OrganizationRow);
  });

  const insert = vi.fn(() => ({
    values: insertValues,
  }));

  const select = vi.fn(() => ({
    from: (table: unknown) => {
      if (table === organizations) {
        return {
          then: (resolve: (value: OrganizationRow[]) => unknown) => Promise.resolve(resolve([...organizationRows])),
          where: vi.fn(async () => [...organizationRows]),
        };
      }

      if (table === apifySourceConfigs) {
        return {
          where: vi.fn(async () => [...monitoringConfigRows]),
        };
      }

      throw new Error("Unexpected table access in seedIndianBankOrganizations test");
    },
  }));

  return {
    insert,
    select,
    organizationRows,
    monitoringConfigRows,
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
  it("stores bank organizations with the database-supported type and creates monitoring configs", async () => {
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
      expect(config.createdBy).toBe("admin-user-1");
      expect(config.name).toContain("leadership monitor");
      expect(config.targetOrganizationId).toBeTruthy();
    }
  });
});
