import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { FaqList } from "@/components/sections/faq-section";

describe("FaqList", () => {
  it("uses native accessible disclosure elements", async () => {
    const user = userEvent.setup();
    render(
      <FaqList
        items={[{ question: "Is it cordless?", answer: "Yes, during use." }]}
      />,
    );

    const summary = screen.getByText("Is it cordless?");
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Yes, during use.")).toBeInTheDocument();
  });
});
