import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("SEO metadata routes", () => {
  it("allows public pages, protects APIs and declares the production sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://lumiza.vercel.app/sitemap.xml",
    });
  });

  it("publishes only localized homepages with reciprocal language alternates", () => {
    const entries = sitemap();
    const languages = {
      fr: "https://lumiza.vercel.app/fr",
      en: "https://lumiza.vercel.app/en",
      de: "https://lumiza.vercel.app/de",
      "x-default": "https://lumiza.vercel.app/fr",
    };

    expect(entries).toEqual([
      {
        url: "https://lumiza.vercel.app/fr",
        alternates: { languages },
      },
      {
        url: "https://lumiza.vercel.app/en",
        alternates: { languages },
      },
      {
        url: "https://lumiza.vercel.app/de",
        alternates: { languages },
      },
    ]);
  });
});
