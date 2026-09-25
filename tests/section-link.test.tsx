import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionLink } from "@/components/ui/section-link";

describe("SectionLink", () => {
  it("links the main call to action to the offers section", () => {
    render(<SectionLink href="#offers">Explore our offers</SectionLink>);

    expect(
      screen.getByRole("link", { name: "Explore our offers" }),
    ).toHaveAttribute("href", "#offers");
  });
});
