import { describe, expect, it } from "vitest";

import { supabaseProjectUrlSchema } from "@/config/env";

describe("Supabase project URL", () => {
  it("accepts the project base URL but rejects the REST endpoint that caused checkout HTTP 400", () => {
    expect(
      supabaseProjectUrlSchema.safeParse("https://example.supabase.co").success,
    ).toBe(true);
    expect(
      supabaseProjectUrlSchema.safeParse("https://example.supabase.co/rest/v1/")
        .success,
    ).toBe(false);
  });
});
