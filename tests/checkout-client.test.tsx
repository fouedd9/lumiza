import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutClient } from "@/features/commerce/components/checkout-client";
import { saveCart } from "@/features/commerce/components/cart-store";
import { lumizaProduct } from "@/features/product/data/product";
import fr from "@/../messages/fr.json";
import en from "@/../messages/en.json";
import de from "@/../messages/de.json";

vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve({}) }));
vi.mock("@stripe/react-stripe-js", () => ({
  EmbeddedCheckoutProvider: ({
    children,
    options,
  }: {
    children: React.ReactNode;
    options: { clientSecret: string };
  }) => (
    <div
      data-testid="stripe-provider"
      data-client-secret={options.clientSecret}
    >
      {children}
    </div>
  ),
  EmbeddedCheckout: () => <div data-testid="embedded-checkout" />,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const catalog = { packs: lumizaProduct.packs, colors: lumizaProduct.colors };
const messages = { fr, en, de };
let cartQuantity = 0;
function freshCart() {
  cartQuantity += 1;
  return [
    {
      packId: "solo" as const,
      composition: { black: 1, gold: 0, silver: 0 },
      quantity: cartQuantity,
    },
  ];
}

function checkout(locale: "fr" | "en" | "de" = "fr") {
  return (
    <CheckoutClient
      locale={locale}
      catalog={catalog}
      publishableKey="pk_test_example"
      labels={messages[locale].Checkout}
    />
  );
}

function response(body: object, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("automatic embedded checkout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("shows a mixed DUO and SOLO composition without treating a finish as the whole pack", async () => {
    saveCart([
      {
        packId: "duo",
        composition: { black: 0, gold: 1, silver: 1 },
        quantity: 1,
      },
      {
        packId: "solo",
        composition: { black: 1, gold: 0, silver: 0 },
        quantity: 1,
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(checkout("fr"));
    expect(screen.getByText("1 × Or")).toBeInTheDocument();
    expect(screen.getByText("1 × Argent")).toBeInTheDocument();
    expect(screen.getByText("1 × Noir")).toBeInTheDocument();
    expect(
      screen.getByText(fr.Checkout.subtotal).parentElement,
    ).toHaveTextContent("94,98");
  });

  it("initializes a valid cart automatically, shows loading, and mounts Stripe without a CTA", async () => {
    saveCart(freshCart());
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(fr.Checkout.loading)).toBeInTheDocument();
    expect(screen.getByText(fr.Checkout.loadingDetail)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /continuer vers le paiement/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/LUMIZA · SOLO/)).toBeInTheDocument();
    resolve(response({ clientSecret: "cs_test_one", token: "test-token" }));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    expect(screen.getByText(fr.Checkout.cancel)).toBeInTheDocument();
  });

  it("never initializes Stripe for an empty cart", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(checkout());
    expect(screen.getByText(fr.Checkout.empty)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: fr.Checkout.back }),
    ).toHaveAttribute("href", "/#offers");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["fr", "en", "de"] as const)(
    "localizes loading, error and retry in %s",
    async (locale) => {
      saveCart(freshCart());
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response({ code: "retry" }, false))
        .mockResolvedValueOnce(
          response({ clientSecret: `cs_${locale}`, token: `token-${locale}` }),
        );
      vi.stubGlobal("fetch", fetchMock);
      render(checkout(locale));
      expect(
        screen.getByText(messages[locale].Checkout.loading),
      ).toBeInTheDocument();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        messages[locale].Checkout.retry,
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: messages[locale].Checkout.retryButton,
        }),
      );
      expect(
        await screen.findByTestId("embedded-checkout"),
      ).toBeInTheDocument();
      const attempts = fetchMock.mock.calls.map(
        (call) => JSON.parse(call[1].body).attemptId,
      );
      expect(attempts).toHaveLength(2);
      expect(attempts[0]).toBe(attempts[1]);
    },
  );

  it("shares initialization through Strict Mode, rerenders and remounts", async () => {
    saveCart(freshCart());
    let resolve!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<StrictMode>{checkout("en")}</StrictMode>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(<StrictMode>{checkout("en")}</StrictMode>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    view.unmount();
    const next = render(checkout("en"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(response({ clientSecret: "cs_shared", token: "token-shared" }));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    next.unmount();
    render(checkout("en"));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards a stale in-flight selection and displays the current cart session", async () => {
    saveCart(freshCart());
    const resolvers: Array<(value: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolvers.push(done);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    saveCart([
      {
        packId: "duo",
        composition: { black: 0, gold: 2, silver: 0 },
        quantity: 1,
      },
    ]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers[0](response({ clientSecret: "cs_stale", token: "stale" }));
    expect(screen.queryByTestId("embedded-checkout")).not.toBeInTheDocument();
    resolvers[1](response({ clientSecret: "cs_current", token: "current" }));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    expect(screen.getByText(/LUMIZA · DUO/)).toBeInTheDocument();
  });

  it("keeps the active payment tied to its original cart without another session", async () => {
    saveCart(freshCart());
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ clientSecret: "cs_active", token: "active" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout());
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    saveCart([
      {
        packId: "duo",
        composition: { black: 0, gold: 2, silver: 0 },
        quantity: 1,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/LUMIZA · SOLO/)).toBeInTheDocument();
    expect(screen.queryByText(/LUMIZA · DUO/)).not.toBeInTheDocument();
  });

  it("reuses the same session when the checkout language changes", async () => {
    saveCart(freshCart());
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ clientSecret: "cs_locale", token: "locale" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const first = render(checkout("fr"));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    first.unmount();
    render(checkout("de"));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    expect(screen.getByText(de.Checkout.country)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("automatically starts a fresh attempt only after the server confirms expiration", async () => {
    saveCart(freshCart());
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ code: "expired" }, false))
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_new", token: "new" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout("fr"));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    const attempts = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1].body).attemptId,
    );
    expect(attempts[0]).not.toBe(attempts[1]);
  });

  it("cancels the French session before initializing Germany and updates shipping once", async () => {
    saveCart([
      {
        packId: "duo",
        composition: { black: 2, gold: 0, silver: 0 },
        quantity: 1,
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_fr", token: "token-fr" }),
      )
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_de", token: "token-de" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout("fr"));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: fr.Checkout.country }),
      "DE",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByTestId("stripe-provider")).toHaveAttribute(
      "data-client-secret",
      "cs_de",
    );
    expect(screen.getByText(/10,00/)).toBeInTheDocument();
    expect(screen.getByText(/69,99/)).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).token).toBe("token-fr");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).country).toBe("DE");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).attemptId).not.toBe(
      JSON.parse(fetchMock.mock.calls[2][1].body).attemptId,
    );
  });

  it("switches Germany back to France only after cancellation", async () => {
    saveCart([
      {
        packId: "duo",
        composition: { black: 0, gold: 0, silver: 2 },
        quantity: 1,
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_initial_fr", token: "initial-fr" }),
      )
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(response({ clientSecret: "cs_de", token: "de" }))
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_return_fr", token: "return-fr" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout("en"));
    expect(await screen.findByTestId("embedded-checkout")).toBeInTheDocument();
    const selector = screen.getByRole("combobox", {
      name: en.Checkout.country,
    });
    await userEvent.selectOptions(selector, "DE");
    await waitFor(() =>
      expect(screen.getByTestId("stripe-provider")).toHaveAttribute(
        "data-client-secret",
        "cs_de",
      ),
    );
    await userEvent.selectOptions(selector, "FR");
    await waitFor(() =>
      expect(screen.getByTestId("stripe-provider")).toHaveAttribute(
        "data-client-secret",
        "cs_return_fr",
      ),
    );
    expect(screen.getByText("€0.00")).toBeInTheDocument();
    expect(screen.getByText(en.Checkout.total).parentElement).toHaveTextContent(
      "€59.99",
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("replaces each embedded form through FR → DE → BE → CH → FR without refreshing", async () => {
    saveCart([
      {
        packId: "solo",
        composition: { black: 0, gold: 0, silver: 1 },
        quantity: 1,
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_fr_1", token: "fr-1" }),
      )
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(response({ clientSecret: "cs_de", token: "de" }))
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(response({ clientSecret: "cs_be", token: "be" }))
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(response({ clientSecret: "cs_ch", token: "ch" }))
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(
        response({ clientSecret: "cs_fr_2", token: "fr-2" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(checkout("fr"));
    const selector = screen.getByRole("combobox", {
      name: fr.Checkout.country,
    });
    expect(await screen.findByTestId("stripe-provider")).toHaveAttribute(
      "data-client-secret",
      "cs_fr_1",
    );
    for (const [country, secret, total] of [
      ["DE", "cs_de", "44,99"],
      ["BE", "cs_be", "44,99"],
      ["CH", "cs_ch", "44,99"],
      ["FR", "cs_fr_2", "34,99"],
    ]) {
      await userEvent.selectOptions(selector, country);
      await waitFor(() =>
        expect(screen.getByTestId("stripe-provider")).toHaveAttribute(
          "data-client-secret",
          secret,
        ),
      );
      expect(
        screen.getByText(fr.Checkout.total).parentElement,
      ).toHaveTextContent(total);
    }
    expect(fetchMock).toHaveBeenCalledTimes(9);
    const sessionCountries = fetchMock.mock.calls
      .filter((call) => call[0] === "/api/checkout/session")
      .map((call) => JSON.parse(call[1].body).country);
    expect(sessionCountries).toEqual(["FR", "DE", "BE", "CH", "FR"]);
  });

  it("keeps an older in-flight country session hidden until it is canceled", async () => {
    saveCart([
      {
        packId: "duo",
        composition: { black: 0, gold: 2, silver: 0 },
        quantity: 2,
      },
    ]);
    let resolveInitial!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            resolveInitial = done;
          }),
      )
      .mockResolvedValueOnce(response({ code: "canceled" }))
      .mockResolvedValueOnce(response({ clientSecret: "cs_be", token: "be" }));
    vi.stubGlobal("fetch", fetchMock);
    render(checkout("fr"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: fr.Checkout.country }),
      "BE",
    );
    expect(
      screen.getByRole("combobox", { name: fr.Checkout.country }),
    ).toBeDisabled();
    expect(screen.getByText(fr.Checkout.updatingDelivery)).toBeInTheDocument();
    expect(screen.getByText(/129,98/)).toBeInTheDocument();
    expect(screen.queryByTestId("embedded-checkout")).not.toBeInTheDocument();
    resolveInitial(
      response({ clientSecret: "cs_stale_fr", token: "stale-fr" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByTestId("stripe-provider")).toHaveAttribute(
      "data-client-secret",
      "cs_be",
    );
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).country).toBe("BE");
  });

  it.each(["fr", "en", "de"] as const)(
    "lists localized shipping countries in %s",
    async (locale) => {
      const color = { fr: "black", en: "gold", de: "silver" }[locale] as
        "black" | "gold" | "silver";
      saveCart([
        {
          packId: "pro",
          composition: {
            black: color === "black" ? 10 : 0,
            gold: color === "gold" ? 10 : 0,
            silver: color === "silver" ? 10 : 0,
          },
          quantity: 1,
        },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn(() => new Promise<Response>(() => {})),
      );
      render(checkout(locale));
      const selector = screen.getByRole("combobox", {
        name: messages[locale].Checkout.country,
      });
      expect(selector.querySelectorAll("option")).toHaveLength(4);
      expect(
        screen.getByRole("option", {
          name: messages[locale].Checkout.countries.BE,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", {
          name: messages[locale].Checkout.countries.CH,
        }),
      ).toBeInTheDocument();
      expect(
        [...selector.querySelectorAll("option")].map((option) => [
          option.value,
          option.textContent,
        ]),
      ).toEqual(Object.entries(messages[locale].Checkout.countries));
    },
  );
});
