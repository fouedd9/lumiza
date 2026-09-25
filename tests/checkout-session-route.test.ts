import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/commerce-env.server", () => ({ getCommerceEnv: vi.fn() }));
vi.mock("@/features/commerce/services/checkout", () => ({
  beginCheckout: vi.fn(),
}));

import { getCommerceEnv } from "@/config/commerce-env.server";
import { beginCheckout } from "@/features/commerce/services/checkout";
import { POST } from "@/app/api/checkout/session/route";

const requestBody = {
  attemptId: "a37e6d6e-3b0d-4f72-9e1a-9ca900dda143",
  country: "FR",
  items: [
    {
      packId: "solo",
      composition: { black: 1, gold: 0, silver: 0 },
      quantity: 1,
    },
  ],
  locale: "de",
};

describe("checkout session route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCommerceEnv).mockReturnValue({
      success: true,
      data: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
    } as never);
    vi.mocked(beginCheckout).mockResolvedValue({
      clientSecret: "test",
      token: "test",
      reference: "test",
      quote: {},
    } as never);
  });

  it("accepts the exact FR solo black payload with German locale", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/checkout/session", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(beginCheckout).toHaveBeenCalledWith(
      {
        attemptId: requestBody.attemptId,
        country: "FR",
        items: requestBody.items,
      },
      "de",
    );
  });

  it("rejects a misconfigured Supabase environment without accepting checkout", async () => {
    vi.mocked(getCommerceEnv).mockReturnValue({ success: false } as never);
    const response = await POST(
      new Request("http://localhost:3000/api/checkout/session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "unavailable" });
    expect(beginCheckout).not.toHaveBeenCalled();
  });

  it("passes multiple pack compositions through to the checkout service", async () => {
    const body = {
      ...requestBody,
      items: [
        {
          packId: "solo",
          composition: { black: 1, gold: 0, silver: 0 },
          quantity: 1,
        },
        {
          packId: "duo",
          composition: { black: 0, gold: 1, silver: 1 },
          quantity: 2,
        },
      ],
    };
    const response = await POST(
      new Request("http://localhost:3000/api/checkout/session", {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(200);
    expect(beginCheckout).toHaveBeenCalledWith(
      { attemptId: body.attemptId, country: "FR", items: body.items },
      "de",
    );
  });

  it.each(["BE", "DE", "CH"])(
    "accepts %s but strips a forged browser shipping amount",
    async (country) => {
      const response = await POST(
        new Request("http://localhost:3000/api/checkout/session", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
          body: JSON.stringify({
            ...requestBody,
            country,
            shippingCents: 0,
            totalCents: 1,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(beginCheckout).toHaveBeenCalledWith(
        {
          attemptId: requestBody.attemptId,
          country,
          items: requestBody.items,
        },
        "de",
      );
    },
  );

  it.each(["ES", "IT", "NL", "ZZ"])(
    "rejects unsupported country %s",
    async (country) => {
      const response = await POST(
        new Request("http://localhost:3000/api/checkout/session", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
          body: JSON.stringify({ ...requestBody, country }),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "unsupported_country" });
      expect(beginCheckout).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      {
        packId: "pro",
        composition: { black: 10, gold: 10, silver: 10 },
        quantity: 1,
      },
    ],
    [
      {
        packId: "pro",
        composition: { black: -1, gold: 6, silver: 5 },
        quantity: 1,
      },
    ],
    [{ packId: "duo", composition: { gold: 1.5, silver: 0.5 }, quantity: 1 }],
    [{ packId: "duo", composition: { gold: 1, blue: 1 }, quantity: 1 }],
    [{ packId: "duo", composition: { gold: 1 }, quantity: 1 }],
    [{ packId: "pro", composition: { gold: 10 }, quantity: 1000000 }],
    [{ packId: "duo", composition: {}, quantity: 1 }],
  ])(
    "rejects manipulated composition %# before checkout service",
    async (items) => {
      const response = await POST(
        new Request("http://localhost:3000/api/checkout/session", {
          method: "POST",
          headers: {
            origin: "http://localhost:3000",
            "content-type": "application/json",
          },
          body: JSON.stringify({ ...requestBody, items }),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "invalid" });
      expect(beginCheckout).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed JSON without leaking parser details", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/checkout/session", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: "{not-json",
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: "invalid" });
    expect(beginCheckout).not.toHaveBeenCalled();
  });
});
