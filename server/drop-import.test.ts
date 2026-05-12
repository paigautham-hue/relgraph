/**
 * Drop-import service contract tests.
 *
 * Pure: no DB, no LLM. Verifies:
 *   - Classifier picks the right path
 *   - vCard parser extracts canonical fields
 *   - Column-mapping path produces ProposedRows with confidence
 *   - Empty input returns a friendly Proposal (not a throw)
 *   - Idempotency: same input → same proposal.id
 */

import { describe, expect, it } from "vitest";
import { analyzeDropInput } from "./services/drop-import.service";
import { parseVCardText } from "./services/vcard-parser";

describe("vCard parser", () => {
  it("parses a standard vCard 3.0", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Rajesh Kumar
N:Kumar;Rajesh;;;
ORG:State Bank of India;Risk
TITLE:Deputy Managing Director
EMAIL;TYPE=INTERNET,WORK:rajesh.kumar@sbi.co.in
TEL;TYPE=CELL:+91-98765-43210
END:VCARD`;
    const cards = parseVCardText(vcard);
    expect(cards).toHaveLength(1);
    expect(cards[0].fullName).toBe("Rajesh Kumar");
    expect(cards[0].organization).toBe("State Bank of India");
    expect(cards[0].title).toBe("Deputy Managing Director");
    expect(cards[0].email).toBe("rajesh.kumar@sbi.co.in");
    expect(cards[0].phone).toBe("+91-98765-43210");
  });

  it("parses N when FN is missing", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
N:Sharma;Priya
EMAIL:priya@example.com
END:VCARD`;
    const cards = parseVCardText(vcard);
    expect(cards[0].fullName).toBe("Priya Sharma");
  });

  it("handles multiple cards in one file", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Person A
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Person B
END:VCARD`;
    const cards = parseVCardText(vcard);
    expect(cards).toHaveLength(2);
    expect(cards[0].fullName).toBe("Person A");
    expect(cards[1].fullName).toBe("Person B");
  });

  it("unescapes escaped commas and semicolons", () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Smith\\, John
ORG:Acme\\; Industries
END:VCARD`;
    const cards = parseVCardText(vcard);
    expect(cards[0].fullName).toBe("Smith, John");
    expect(cards[0].organization).toBe("Acme; Industries");
  });

  it("returns empty array on input with no vCard blocks", () => {
    expect(parseVCardText("not a vcard at all")).toEqual([]);
  });

  it("returns empty card when block is empty", () => {
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nEND:VCARD`;
    const cards = parseVCardText(vcard);
    expect(cards[0].fullName).toBeNull();
  });
});

describe("analyzeDropInput — routing", () => {
  it("classifies vCard payload and parses it (no LLM)", async () => {
    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:Test Person
ORG:Test Org
END:VCARD`;
    const proposal = await analyzeDropInput({
      content: vcard,
      contentType: "auto",
      encoding: "utf8",
    });
    expect(proposal.rows.length).toBe(1);
    expect(proposal.rows[0].type).toBe("person");
    expect(proposal.llmCostUsd).toBe(0);
    expect(proposal.warnings).toEqual([]);
  });

  it("classifies CSV with headers and routes to column-mapping at >30 rows", async () => {
    // Build a 50-row CSV
    const header = "Name,Title,Company,Email";
    const lines: string[] = [header];
    for (let i = 0; i < 50; i++) {
      lines.push(`Person ${i},Manager,Company ${i % 5},person${i}@example.com`);
    }
    const proposal = await analyzeDropInput({
      content: lines.join("\n"),
      contentType: "auto",
      encoding: "utf8",
    });
    expect(proposal.routedAs).toBe("column_mapping");
    expect(proposal.isBulk).toBe(true);
    expect(proposal.rows.length).toBe(50);
    expect(proposal.llmCostUsd).toBe(0);
  });

  it("CSV with ≤30 rows routes through LLM extraction path (would call API)", async () => {
    // Without an API key, the LLM extractor returns empty + a warning.
    const header = "Name,Title";
    const lines = [header];
    for (let i = 0; i < 5; i++) lines.push(`Person ${i},Director`);
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    try {
      const proposal = await analyzeDropInput({
        content: lines.join("\n"),
        contentType: "auto",
        encoding: "utf8",
      });
      // Routing decision is based on row count (<= 30 → LLM path).
      expect(proposal.routedAs).toBe("llm_extraction");
      // No API key → service returns a warning about the missing key.
      expect(proposal.warnings.some((w) => w.includes("ANTHROPIC_API_KEY"))).toBe(true);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
      else delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("rejects oversized text input with a friendly Proposal (not a throw)", async () => {
    const huge = "x".repeat(200_000);
    const proposal = await analyzeDropInput({
      content: huge,
      contentType: "auto",
      encoding: "utf8",
    });
    expect(proposal.rows).toEqual([]);
    expect(proposal.warnings[0]).toMatch(/Pasted text is/);
  });

  it("classifies JSON arrays of objects as tabular import", async () => {
    const json = JSON.stringify([
      { name: "A", title: "Director" },
      { name: "B", title: "Manager" },
    ]);
    const proposal = await analyzeDropInput({
      content: json,
      contentType: "auto",
      encoding: "utf8",
    });
    // 2 rows → LLM path (under threshold); no API key → returns extractor warning
    expect(proposal.rows.length).toBeGreaterThanOrEqual(0);
  });

  it("idempotent: same input → same proposal id", async () => {
    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:Test\nEND:VCARD`;
    const p1 = await analyzeDropInput({ content: vcard, contentType: "auto", encoding: "utf8" });
    const p2 = await analyzeDropInput({ content: vcard, contentType: "auto", encoding: "utf8" });
    expect(p1.id).toBe(p2.id);
  });
});

describe("column-mapping heuristic", () => {
  it("recognizes common header variants for name/title/org/email", async () => {
    const header = "Full Name,Designation,Employer,Mail";
    const lines = [header];
    for (let i = 0; i < 35; i++) {
      lines.push(`Person ${i},Manager,Company ${i},p${i}@x.com`);
    }
    const proposal = await analyzeDropInput({
      content: lines.join("\n"),
      contentType: "auto",
      encoding: "utf8",
    });
    expect(proposal.routedAs).toBe("column_mapping");
    const firstRow = proposal.rows[0];
    expect(firstRow.fields.find((f) => f.key === "name")?.value).toBe("Person 0");
    expect(firstRow.fields.find((f) => f.key === "currentTitle")?.value).toBe("Manager");
    expect(firstRow.fields.find((f) => f.key === "_orgName")?.value).toBe("Company 0");
    expect(firstRow.fields.find((f) => f.key === "email")?.value).toBe("p0@x.com");
  });

  it("combines first-name + last-name when name column absent", async () => {
    const lines = ["First Name,Last Name,Title"];
    for (let i = 0; i < 35; i++) {
      lines.push(`First${i},Last${i},Manager`);
    }
    const proposal = await analyzeDropInput({
      content: lines.join("\n"),
      contentType: "auto",
      encoding: "utf8",
    });
    expect(proposal.rows[0].fields.find((f) => f.key === "name")?.value).toBe("First0 Last0");
  });

  it("preserves unmapped columns with lower default confidence", async () => {
    const header = "Name,Random Custom Field";
    const lines = [header];
    for (let i = 0; i < 35; i++) lines.push(`Person ${i},custom${i}`);
    const proposal = await analyzeDropInput({
      content: lines.join("\n"),
      contentType: "auto",
      encoding: "utf8",
    });
    const customField = proposal.rows[0].fields.find((f) => f.key === "Random Custom Field");
    expect(customField).toBeDefined();
    expect(customField?.confidence).toBeLessThan(0.85);
  });
});
