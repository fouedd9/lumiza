import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/fr";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/script", () => ({
  default: ({
    strategy,
    ...props
  }: React.ComponentProps<"script"> & { strategy?: string }) => {
    void strategy;
    return <script data-testid="clarity-script" {...props} />;
  },
}));

import {
  isSensitiveCommercePath,
  MicrosoftClarity,
  validClarityProjectId,
} from "@/features/analytics/microsoft-clarity";
import { saveConsent } from "@/features/consent/consent";

const props = { projectId: "abc123xyz", production: true };

function commands() {
  return (window.clarity?.q ?? []).map((command) => Array.from(command));
}

describe("Microsoft Clarity", () => {
  beforeEach(() => {
    pathname = "/fr";
    window.localStorage.clear();
    delete window.clarity;
  });

  it("accepts only a project ID and excludes sensitive commerce routes", () => {
    expect(validClarityProjectId("abc123xyz")).toBe(true);
    expect(validClarityProjectId("https://example.com/evil")).toBe(false);
    expect(validClarityProjectId(undefined)).toBe(false);
    expect(isSensitiveCommercePath("/fr/checkout")).toBe(true);
    expect(isSensitiveCommercePath("/en/order/confirmation")).toBe(true);
    expect(isSensitiveCommercePath("/de/order/confirmation/extra")).toBe(true);
    expect(isSensitiveCommercePath("/fr/checkout-help")).toBe(false);
  });

  it("never initializes outside Vercel production or without a valid ID", () => {
    saveConsent({ analytics: true, marketing: true });
    const preview = render(<MicrosoftClarity {...props} production={false} />);
    expect(preview.queryByTestId("clarity-script")).not.toBeInTheDocument();
    expect(window.clarity).toBeUndefined();
    preview.unmount();

    const missing = render(
      <MicrosoftClarity production projectId={undefined} />,
    );
    expect(missing.queryByTestId("clarity-script")).not.toBeInTheDocument();
    expect(window.clarity).toBeUndefined();
  });

  it("does not load for undecided, denied, or Marketing-only consent", () => {
    const view = render(<MicrosoftClarity {...props} />);
    expect(view.queryByTestId("clarity-script")).not.toBeInTheDocument();
    expect(window.clarity).toBeUndefined();

    act(() => saveConsent({ analytics: false, marketing: true }));
    expect(view.queryByTestId("clarity-script")).not.toBeInTheDocument();
    expect(window.clarity).toBeUndefined();
  });

  it("loads after Analytics consent and sends Consent V2 with ads denied", async () => {
    const view = render(<MicrosoftClarity {...props} />);
    act(() => saveConsent({ analytics: true, marketing: false }));
    await waitFor(() =>
      expect(view.getByTestId("clarity-script")).toHaveAttribute(
        "src",
        "https://www.clarity.ms/tag/abc123xyz",
      ),
    );
    expect(commands()).toEqual([
      ["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }],
    ]);
  });

  it("updates consent immediately and keeps ad storage denied even with Marketing consent", async () => {
    saveConsent({ analytics: true, marketing: true });
    const view = render(<MicrosoftClarity {...props} />);
    await waitFor(() =>
      expect(view.getByTestId("clarity-script")).toBeInTheDocument(),
    );
    expect(commands().at(-1)).toEqual([
      "consentv2",
      { ad_Storage: "denied", analytics_Storage: "granted" },
    ]);

    act(() => saveConsent({ analytics: false, marketing: true }));
    expect(commands().at(-1)).toEqual([
      "consentv2",
      { ad_Storage: "denied", analytics_Storage: "denied" },
    ]);

    act(() => saveConsent({ analytics: true, marketing: false }));
    expect(commands().at(-1)).toEqual([
      "consentv2",
      { ad_Storage: "denied", analytics_Storage: "granted" },
    ]);
  });

  it("does not load on checkout or confirmation and denies an existing session on route change", async () => {
    pathname = "/fr/order/confirmation";
    saveConsent({ analytics: true, marketing: true });
    const view = render(<MicrosoftClarity {...props} />);
    expect(view.queryByTestId("clarity-script")).not.toBeInTheDocument();
    expect(window.clarity).toBeUndefined();

    pathname = "/fr";
    view.rerender(<MicrosoftClarity {...props} />);
    await waitFor(() =>
      expect(view.getByTestId("clarity-script")).toBeInTheDocument(),
    );

    pathname = "/fr/checkout";
    view.rerender(<MicrosoftClarity {...props} />);
    expect(view.queryByTestId("clarity-script")).not.toBeInTheDocument();
    expect(commands().at(-1)).toEqual([
      "consentv2",
      { ad_Storage: "denied", analytics_Storage: "denied" },
    ]);
  });
});
