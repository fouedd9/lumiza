import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Price } from "@/components/shared/price";

describe("Price", () => {
  it("renders a semantic localized price", () => {
    render(<Price amountInCents={5999} currency="EUR" locale="fr" />);

    const price = screen.getByLabelText(/59,99\s€/);
    expect(price).toBeInTheDocument();
    expect(price).toHaveAttribute("value", "59.99");
  });
});
