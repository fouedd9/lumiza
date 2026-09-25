import "server-only";

import { z } from "zod";
import { supabaseProjectUrlSchema } from "./env";

const siteOriginSchema = z.url().refine((value) => {
  if (value.trim() !== value) return false;
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  );
});

const baseCommerceEnvSchema = z.object({
  STRIPE_MODE: z.enum(["test", "live"]).optional(),
  NEXT_PUBLIC_SUPABASE_URL: supabaseProjectUrlSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  STRIPE_SECRET_KEY: z.string().min(16),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").min(12),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(16),
  NEXT_PUBLIC_SITE_URL: siteOriginSchema,
  CRON_SECRET: z.string().startsWith("cron_").min(37).optional(),
});

/** TEST remains the local default; deployed commerce must declare its mode. */
export function parseCommerceEnv(input: unknown, production = false) {
  return baseCommerceEnvSchema
    .superRefine((value, context) => {
      const mode = value.STRIPE_MODE ?? "test";
      if (production && !value.STRIPE_MODE) {
        context.addIssue({
          code: "custom",
          path: ["STRIPE_MODE"],
          message: "Explicit commerce mode required in production",
        });
      }
      for (const [key, prefix] of [
        ["STRIPE_SECRET_KEY", `sk_${mode}_`],
        ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `pk_${mode}_`],
      ] as const) {
        if (!value[key].startsWith(prefix)) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Stripe key does not match commerce mode",
          });
        }
      }
      if (
        value.SUPABASE_SERVICE_ROLE_KEY ===
        value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ) {
        context.addIssue({
          code: "custom",
          path: ["SUPABASE_SERVICE_ROLE_KEY"],
          message: "Privileged and public keys must differ",
        });
      }
      if (production) {
        const url = new URL(value.NEXT_PUBLIC_SITE_URL);
        if (
          url.protocol !== "https:" ||
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ) {
          context.addIssue({
            code: "custom",
            path: ["NEXT_PUBLIC_SITE_URL"],
            message: "Public HTTPS origin required",
          });
        }
        if (!value.CRON_SECRET) {
          context.addIssue({
            code: "custom",
            path: ["CRON_SECRET"],
            message: "Reconciliation secret required",
          });
        }
      }
    })
    .transform((value) => ({
      ...value,
      STRIPE_MODE: value.STRIPE_MODE ?? "test",
    }))
    .safeParse(input);
}

export function getCommerceEnv() {
  return parseCommerceEnv(
    {
      STRIPE_MODE: process.env.STRIPE_MODE || undefined,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      CRON_SECRET: process.env.CRON_SECRET || undefined,
    },
    process.env.NODE_ENV === "production",
  );
}

export function requireCommerceEnv() {
  const parsed = getCommerceEnv();
  if (!parsed.success) throw new Error("Commerce is not configured");
  return parsed.data;
}

export function isCommerceReady() {
  return getCommerceEnv().success;
}
