import { z } from "zod";

const siteUrlSchema = z.url();
const productionSiteUrl = new URL("https://lumiza.vercel.app");

export function getPublicSiteUrl(): URL | null {
  const result = siteUrlSchema.safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  return result.success ? new URL(result.data) : null;
}

/** Canonical public URL used by SEO metadata routes outside configured production. */
export function getCanonicalSiteUrl(): URL {
  const configuredUrl = getPublicSiteUrl();
  return configuredUrl &&
    configuredUrl.hostname !== "localhost" &&
    configuredUrl.hostname !== "127.0.0.1"
    ? configuredUrl
    : productionSiteUrl;
}
