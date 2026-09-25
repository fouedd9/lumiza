import { z } from "zod";

const siteUrlSchema = z.url();

export function getPublicSiteUrl(): URL | null {
  const result = siteUrlSchema.safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  return result.success ? new URL(result.data) : null;
}
