import { describe, expect, it } from "vitest";

describe("Apify API token", () => {
  it(
    "authenticates with the Apify users/me endpoint",
    async () => {
      const token = process.env.APIFY_API_TOKEN;

      expect(token).toBeTruthy();

      const response = await fetch("https://api.apify.com/v2/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      expect(response.ok).toBe(true);

      const payload = await response.json();
      expect(payload?.data).toBeTruthy();
      expect(payload?.data?.id || payload?.data?.username).toBeTruthy();
    },
    20000,
  );
});
