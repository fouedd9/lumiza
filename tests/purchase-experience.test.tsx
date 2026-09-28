import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/features/analytics/meta-pixel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/analytics/meta-pixel")>();
  return { ...actual, trackMetaEvent: vi.fn(() => true) };
});

import { trackMetaEvent } from "@/features/analytics/meta-pixel";
import { closeCart } from "@/features/commerce/components/cart-drawer-state";
import {
  PurchaseExperience,
  type PurchaseLabels,
} from "@/features/product/components/purchase-experience";
import { lumizaProduct } from "@/features/product/data/product";
import type { ResolvedProductMedia } from "@/features/product/data/product-media";

const media: ResolvedProductMedia[] = [
  {
    id: "front",
    src: "/images/product/lumiza-black.webp",
    width: 800,
    height: 800,
    alt: "Black LUMIZA",
    kind: "product",
    color: "black",
    temporary: false,
  },
  {
    id: "gold",
    src: "/images/product/lumiza-gold.webp",
    width: 800,
    height: 800,
    alt: "Gold LUMIZA",
    kind: "product",
    color: "gold",
    temporary: false,
  },
  {
    id: "silver",
    src: "/images/product/lumiza-silver.webp",
    width: 800,
    height: 800,
    alt: "Silver LUMIZA",
    kind: "product",
    color: "silver",
    temporary: false,
  },
];
const labels: PurchaseLabels = {
  brand: "LUMIZA",
  name: "Cordless lamp",
  description: "USB-rechargeable",
  color: "Finish",
  selected: "Selected",
  quantity: "Packs",
  increase: "Increase",
  decrease: "Decrease",
  finishIncrease: "Increase",
  finishDecrease: "Decrease",
  add: "Add to cart",
  max: "Maximum reached",
  unavailable: "Unavailable",
  compose: "Compose your pack of",
  composeSuffix: "",
  selectedCount: "selected",
  remainingSingle: "lamp left to choose",
  remainingPlural: "lamps left to choose",
  gallery: {
    gallery: "Gallery",
    previous: "Previous",
    next: "Next",
    expand: "Expand",
    close: "Close",
  },
  colors: { black: "Black", gold: "Gold", silver: "Silver" },
  packs: {
    legend: "Choose a pack",
    lamp: "lamp",
    lamps: "lamps",
    save: "Save",
    professional: "Professional offer",
  },
};

describe("premium purchase configuration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    closeCart();
    vi.mocked(trackMetaEvent).mockClear().mockReturnValue(true);
  });

  it("composes a mixed DUO, updates price, and adds one configured cart line", async () => {
    const user = userEvent.setup();
    render(
      <PurchaseExperience
        locale="en"
        media={media}
        catalog={{ packs: lumizaProduct.packs, colors: lumizaProduct.colors }}
        labels={labels}
      />,
    );

    await user.click(screen.getByRole("radio", { name: /DUO/ }));
    expect(screen.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Increase Gold" }));
    await user.click(screen.getByRole("button", { name: "Increase Silver" }));
    expect(screen.getByRole("radio", { name: /DUO/ })).toBeChecked();
    expect(screen.getByText("2 / 2 selected")).toBeInTheDocument();
    expect(screen.getByAltText("Silver LUMIZA")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add to cart/ }),
    ).toHaveTextContent("€59.99");
    await user.click(screen.getByRole("button", { name: /Add to cart/ }));
    expect(JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)).toEqual([
      {
        packId: "duo",
        composition: { black: 0, gold: 1, silver: 1 },
        quantity: 1,
      },
    ]);
    expect(trackMetaEvent).toHaveBeenCalledWith(
      "AddToCart",
      expect.objectContaining({
        content_ids: ["LUMIZA-LED-01-DUO"],
        value: 59.99,
        currency: "EUR",
      }),
    );
  });

  it("does not send AddToCart while the selection is invalid", async () => {
    render(
      <PurchaseExperience
        locale="en"
        media={media}
        catalog={{ packs: lumizaProduct.packs, colors: lumizaProduct.colors }}
        labels={labels}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Add to cart/ }));
    expect(
      vi
        .mocked(trackMetaEvent)
        .mock.calls.some(([event]) => event === "AddToCart"),
    ).toBe(false);
  });

  it("keeps the selected finish aligned with gallery navigation", async () => {
    const user = userEvent.setup();
    render(
      <PurchaseExperience
        locale="en"
        media={media}
        catalog={{ packs: lumizaProduct.packs, colors: lumizaProduct.colors }}
        labels={labels}
      />,
    );

    expect(screen.getByAltText("Black LUMIZA")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByAltText("Gold LUMIZA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("enforces composition counters and resets an incomplete composition on pack switch", async () => {
    const user = userEvent.setup();
    render(
      <PurchaseExperience
        locale="en"
        media={media}
        catalog={{ packs: lumizaProduct.packs, colors: lumizaProduct.colors }}
        labels={labels}
      />,
    );
    await user.click(screen.getByRole("radio", { name: /DUO/ }));
    await user.click(screen.getByRole("button", { name: "Increase Gold" }));
    expect(screen.getByText(/1 lamp left to choose/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: /PRO/ }));
    expect(screen.getByText(/0 \/ 10 selected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add to cart/ })).toBeDisabled();
    for (let index = 0; index < 5; index++)
      await user.click(screen.getByRole("button", { name: "Increase Gold" }));
    for (let index = 0; index < 3; index++)
      await user.click(screen.getByRole("button", { name: "Increase Silver" }));
    for (let index = 0; index < 2; index++)
      await user.click(screen.getByRole("button", { name: "Increase Black" }));
    expect(screen.getByText("10 / 10 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Increase Black" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Add to cart/ }));
    expect(JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)).toEqual([
      {
        packId: "pro",
        composition: { black: 2, gold: 5, silver: 3 },
        quantity: 1,
      },
    ]);
  }, 15000);

  it("does not render a disabled database variant as an option", () => {
    render(
      <PurchaseExperience
        locale="en"
        media={media}
        catalog={{ packs: lumizaProduct.packs, colors: ["black"] }}
        labels={labels}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Gold" }),
    ).not.toBeInTheDocument();
  });
});
