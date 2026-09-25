import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeSwitcher } from "@/components/theme/theme-switcher";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

const labels = {
  light: "Light theme",
  dark: "Dark theme",
  system: "System theme",
};

describe("ThemeSwitcher", () => {
  beforeEach(() => setTheme.mockClear());

  it("exposes all three translated theme options", async () => {
    render(<ThemeSwitcher label="Choose theme" labels={labels} />);

    expect(
      screen.getByRole("group", { name: "Choose theme" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Light theme" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dark theme" }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "System theme" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("updates the persisted theme through next-themes", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher label="Choose theme" labels={labels} />);

    await user.click(screen.getByRole("button", { name: "Dark theme" }));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
