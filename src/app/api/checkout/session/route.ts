import { NextResponse } from "next/server";

import { getCommerceEnv } from "@/config/commerce-env.server";
import {
  beginCheckout,
  CheckoutError,
} from "@/features/commerce/services/checkout";
import { checkoutRequestSchema } from "@/features/commerce/schemas/cart";
import { isShippingCountry } from "@/features/commerce/domain/shipping";
import { isSupportedLocale } from "@/i18n/routing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const env = getCommerceEnv();
  if (!env.success)
    return NextResponse.json({ code: "unavailable" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin !== new URL(env.data.NEXT_PUBLIC_SITE_URL).origin) {
    return NextResponse.json({ code: "invalid" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) {
    return NextResponse.json({ code: "invalid" }, { status: 413 });
  }
  try {
    const raw = await request.text();
    if (raw.length > 8_192)
      return NextResponse.json({ code: "invalid" }, { status: 413 });
    let body: Record<string, unknown>;
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return NextResponse.json({ code: "invalid" }, { status: 400 });
      }
      body = value as Record<string, unknown>;
    } catch {
      return NextResponse.json({ code: "invalid" }, { status: 400 });
    }
    if (!isShippingCountry(body.country)) {
      return NextResponse.json(
        { code: "unsupported_country" },
        { status: 400 },
      );
    }
    const parsed = checkoutRequestSchema.safeParse(body);
    const locale = body.locale;
    if (
      !parsed.success ||
      typeof locale !== "string" ||
      !isSupportedLocale(locale)
    ) {
      return NextResponse.json({ code: "invalid" }, { status: 400 });
    }
    const result = await beginCheckout(parsed.data, locale);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      const status =
        error.reason === "invalid"
          ? 400
          : error.reason === "expired"
            ? 409
            : error.reason === "inventory"
              ? 409
              : error.reason === "unavailable"
                ? 503
                : 503;
      return NextResponse.json({ code: error.reason }, { status });
    }
    console.error(
      "Checkout session failed",
      error instanceof Error ? error.name : "unknown",
    );
    return NextResponse.json({ code: "retry" }, { status: 503 });
  }
}
