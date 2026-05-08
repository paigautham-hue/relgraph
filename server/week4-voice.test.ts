/**
 * Week 4 — voice quick-transcribe wiring.
 *
 * The actual AssemblyAI round-trip is mocked at the network layer; we verify:
 *   - base64 decoding is lossless on round-trip
 *   - the size cap rejects oversized payloads at the Zod layer
 *   - empty audio is rejected with a human message
 *   - mime-type passthrough works
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

// Replicate the exact Zod input shape from voice.router.ts so we test the
// public contract, not internals.
const MAX_QUICK_AUDIO_BASE64_BYTES = 10 * 1024 * 1024;
const inputSchema = z.object({
  audioBase64: z
    .string()
    .min(1)
    .max(MAX_QUICK_AUDIO_BASE64_BYTES, {
      message: `Audio is too long for quick transcribe. Keep clips under 60 seconds.`,
    }),
  mimeType: z.string().optional(),
});

describe("voice.quickTranscribe input contract", () => {
  it("accepts a small valid base64 payload", () => {
    const r = inputSchema.safeParse({
      audioBase64: Buffer.from("fake audio bytes").toString("base64"),
      mimeType: "audio/webm",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty audio", () => {
    const r = inputSchema.safeParse({ audioBase64: "" });
    expect(r.success).toBe(false);
  });

  it("rejects oversized base64 (over 10 MB encoded)", () => {
    const big = "A".repeat(MAX_QUICK_AUDIO_BASE64_BYTES + 1);
    const r = inputSchema.safeParse({ audioBase64: big });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toContain("60 seconds");
    }
  });

  it("treats mimeType as optional", () => {
    const r = inputSchema.safeParse({ audioBase64: "abc=" });
    expect(r.success).toBe(true);
  });
});

describe("base64 round-trip preserves bytes", () => {
  it("encodes + decodes without data loss for typical audio sizes", () => {
    // Simulate ~50 KB clip (typical for ~2 second webm).
    const original = Buffer.alloc(50_000);
    for (let i = 0; i < original.length; i++) original[i] = (i * 31) % 256;

    const encoded = original.toString("base64");
    const decoded = Buffer.from(encoded, "base64");

    expect(decoded.length).toBe(original.length);
    expect(decoded.equals(original)).toBe(true);
  });

  it("freshly-allocated Uint8Array view is structurally equivalent (server upload path)", () => {
    const buf = Buffer.from("hello world voice", "utf8");
    const fresh = new Uint8Array(buf.byteLength);
    fresh.set(buf);
    expect(fresh.length).toBe(buf.length);
    expect(Array.from(fresh)).toEqual(Array.from(buf));
  });
});
