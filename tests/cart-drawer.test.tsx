import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  CartButton,
  type CartLabels,
} from "@/features/commerce/components/cart-drawer";
import { closeCart } from "@/features/commerce/components/cart-drawer-state";
import { saveCart } from "@/features/commerce/components/cart-store";
import type { CartItem } from "@/features/commerce/schemas/cart";
import { lumizaProduct } from "@/features/product/data/product";
import type { AppLocale } from "@/i18n/routing";

const labels: CartLabels = {
  title: "Your cart",
  open: "Open cart",
  close: "Close cart",
  empty: "Your cart is empty.",
  continue: "Continue shopping",
  checkout: "Checkout",
  remove: "Remove",
  subtotal: "Subtotal",
  shipping: "Shipping",
  nextStep: "At next step",
  max: "Maximum reached",
  increase: "Increase",
  decrease: "Decrease",
  lamp: "lamp",
  lamps: "lamps",
  perPack: "per pack",
  unavailable: "Unavailable",
  composition: "Per pack:",
  packsLabel: "packs",
  colors: { black: "Black", gold: "Gold", silver: "Silver" },
};

function solid(
  packId: CartItem["packId"],
  color: "black" | "gold" | "silver",
  quantity = 1,
): CartItem {
  const size = { solo: 1, duo: 2, pro: 10 }[packId];
  return {
    packId,
    composition: {
      black: color === "black" ? size : 0,
      gold: color === "gold" ? size : 0,
      silver: color === "silver" ? size : 0,
    },
    quantity,
  };
}

async function openWithCart(
  items: CartItem[],
  locale: AppLocale = "en",
  colors = labels.colors,
) {
  saveCart(items);
  const user = userEvent.setup();
  const view = render(
    <CartButton
      locale={locale}
      packs={lumizaProduct.packs}
      labels={{ ...labels, colors }}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Open cart/ }));
  return { user, view };
}

function cartImageSources() {
  return screen
    .getAllByRole("img")
    .map((image) => decodeURIComponent(image.getAttribute("src") ?? ""));
}

describe("cart drawer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    closeCart();
  });

  it("traps the interaction, closes with Escape and restores focus to the cart trigger", async () => {
    saveCart([solid("solo", "black")]);
    const user = userEvent.setup();
    render(
      <CartButton locale="en" packs={lumizaProduct.packs} labels={labels} />,
    );
    const trigger = screen.getByRole("button", { name: /Open cart/ });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: /Your cart/ }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("removes only the chosen line and recalculates the display subtotal", async () => {
    saveCart([solid("solo", "black"), solid("duo", "gold")]);
    const user = userEvent.setup();
    render(
      <CartButton locale="en" packs={lumizaProduct.packs} labels={labels} />,
    );
    await user.click(screen.getByRole("button", { name: /Open cart/ }));
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)).toEqual([
      solid("duo", "gold"),
    ]);
    expect(screen.getByText("Subtotal").parentElement).toHaveTextContent(
      "€59.99",
    );
  });

  it.each([
    ["gold", "lumiza-gold.webp", "Gold LUMIZA lamp illuminated, front view"],
    [
      "silver",
      "lumiza-silver.webp",
      "Silver LUMIZA lamp illuminated, front view",
    ],
    ["black", "lumiza-black.webp", "Black LUMIZA lamp illuminated, front view"],
  ] as const)(
    "uses the real %s photograph for a cart line",
    async (color, filename, alt) => {
      await openWithCart([solid("solo", color)]);
      expect(cartImageSources()).toHaveLength(1);
      expect(cartImageSources()[0]).toContain(filename);
      expect(screen.getByAltText(alt)).toBeInTheDocument();
    },
  );

  it("keeps Gold and Black images distinct in a mixed cart", async () => {
    await openWithCart([solid("solo", "gold"), solid("solo", "black", 2)]);
    expect(cartImageSources()[0]).toContain("lumiza-gold.webp");
    expect(cartImageSources()[1]).toContain("lumiza-black.webp");
  });

  it("resolves Gold, Black and Silver per line, not per pack or global selection", async () => {
    await openWithCart([
      solid("solo", "gold"),
      solid("solo", "black", 2),
      solid("duo", "silver"),
    ]);
    expect(cartImageSources()).toEqual([
      expect.stringContaining("lumiza-gold.webp"),
      expect.stringContaining("lumiza-black.webp"),
      expect.stringContaining("lumiza-silver.webp"),
    ]);
    expect(cartImageSources().join(" ")).not.toMatch(
      /concept|placeholder|\.svg/,
    );
  });

  it("keeps the photograph when quantity changes", async () => {
    const { user } = await openWithCart([solid("solo", "gold")]);
    const source = cartImageSources()[0];
    await user.click(screen.getByRole("button", { name: "Increase SOLO" }));
    expect(cartImageSources()[0]).toBe(source);
    expect(
      JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)[0],
    ).toEqual(solid("solo", "gold", 2));
  });

  it("uses the same finish photograph across different packs", async () => {
    await openWithCart([
      solid("solo", "gold"),
      solid("duo", "gold"),
      solid("pro", "gold"),
    ]);
    expect(cartImageSources()).toHaveLength(3);
    expect(
      cartImageSources().every((src) => src.includes("lumiza-gold.webp")),
    ).toBe(true);
  });

  it("re-resolves the real images from persisted finish IDs after remount", async () => {
    const items: CartItem[] = [
      solid("solo", "gold"),
      solid("solo", "black", 2),
      solid("duo", "silver"),
    ];
    const { view } = await openWithCart(items);
    expect(window.localStorage.getItem("lumiza-cart-v2")).not.toMatch(
      /webp|images/,
    );
    view.unmount();
    closeCart();
    render(
      <CartButton locale="en" packs={lumizaProduct.packs} labels={labels} />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Open cart/ }));
    expect(cartImageSources()).toEqual([
      expect.stringContaining("lumiza-gold.webp"),
      expect.stringContaining("lumiza-black.webp"),
      expect.stringContaining("lumiza-silver.webp"),
    ]);
  });

  it("migrates a valid legacy cart without losing pack quantity or finish", async () => {
    window.localStorage.setItem(
      "lumiza-cart-v1",
      JSON.stringify([
        { packId: "duo", color: "gold", quantity: 2 },
        { packId: "pro", color: "black", quantity: 1 },
      ]),
    );
    const user = userEvent.setup();
    render(
      <CartButton locale="en" packs={lumizaProduct.packs} labels={labels} />,
    );
    await user.click(screen.getByRole("button", { name: /Open cart/ }));
    expect(JSON.parse(window.localStorage.getItem("lumiza-cart-v2")!)).toEqual([
      solid("duo", "gold", 2),
      solid("pro", "black"),
    ]);
    expect(cartImageSources()).toEqual([
      expect.stringContaining("lumiza-gold.webp"),
      expect.stringContaining("lumiza-black.webp"),
    ]);
  });

  it("fails safely on malformed legacy cart data", async () => {
    window.localStorage.setItem(
      "lumiza-cart-v1",
      JSON.stringify([{ packId: "duo", color: "gold", quantity: -1 }]),
    );
    render(
      <CartButton locale="en" packs={lumizaProduct.packs} labels={labels} />,
    );
    expect(
      screen.getByRole("button", { name: "Open cart" }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("lumiza-cart-v2")).toBeNull();
  });

  it("groups real finish photographs for a mixed pack", async () => {
    await openWithCart([
      {
        packId: "duo",
        composition: { black: 0, gold: 1, silver: 1 },
        quantity: 1,
      },
    ]);
    expect(cartImageSources()).toEqual([
      expect.stringContaining("lumiza-gold.webp"),
      expect.stringContaining("lumiza-silver.webp"),
    ]);
    expect(screen.getByText("1 × Gold")).toBeInTheDocument();
    expect(screen.getByText("1 × Silver")).toBeInTheDocument();
  });

  it.each([
    ["fr", { black: "Noir", gold: "Or", silver: "Argent" }],
    ["en", { black: "Black", gold: "Gold", silver: "Silver" }],
    ["de", { black: "Schwarz", gold: "Gold", silver: "Silber" }],
  ] as const)(
    "does not derive media from %s display labels",
    async (locale, colors) => {
      await openWithCart([solid("solo", "gold")], locale, colors);
      expect(cartImageSources()[0]).toContain("lumiza-gold.webp");
    },
  );
});
