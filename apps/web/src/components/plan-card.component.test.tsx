import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { manageBilling, upgradeToPro } from "@/app/actions";
import { PlanCard } from "./plan-card";

vi.mock("@/app/actions", () => ({ upgradeToPro: vi.fn(), manageBilling: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlanCard", () => {
  it("shows a lawyer on Trial their pages left and offers Pro", async () => {
    render(<PlanCard plan={{ plan: "trial", pageQuota: 500, pagesLeft: 120, managesBilling: false, pro: { pageQuota: 5_000 } }} />);

    expect(document.getElementById("plan-name")?.textContent).toBe("Trial");
    expect(document.getElementById("plan-pages-left")?.textContent).toBe("120 de 500 páginas restantes neste mês");
    expect(screen.getByText(/O Pro cobre 5\.000 páginas por mês/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Gerenciar cobrança" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Assinar o Pro" }));
    expect(upgradeToPro).toHaveBeenCalled();
  });

  it("lets a lawyer on Pro manage their billing, without offering Pro again", async () => {
    render(<PlanCard plan={{ plan: "pro", pageQuota: 5_000, pagesLeft: 4_200, managesBilling: true, pro: null }} />);

    expect(document.getElementById("plan-name")?.textContent).toBe("Pro");
    expect(screen.queryByRole("button", { name: "Assinar o Pro" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Gerenciar cobrança" }));
    expect(manageBilling).toHaveBeenCalled();
  });
});
