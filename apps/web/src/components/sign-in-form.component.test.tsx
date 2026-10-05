import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./sign-in-form";

afterEach(cleanup);

async function requestLink(email = "ana@example.com") {
  await userEvent.type(screen.getByLabelText("Seu email"), email);
  await userEvent.click(screen.getByRole("button", { name: "Enviar link de acesso" }));
}

describe("SignInForm", () => {
  it("shows that the link is on its way while it is sent", async () => {
    render(<SignInForm sendLink={() => new Promise(() => {})} />);

    await requestLink();

    const button = screen.getByRole("button", { name: "Enviando…" });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("asks the lawyer to open their email once the link is sent", async () => {
    const sendLink = vi.fn(async () => {});
    render(<SignInForm sendLink={sendLink} />);

    await requestLink(" ana@example.com ");

    expect(sendLink).toHaveBeenCalledWith("ana@example.com");
    expect(screen.getByRole("status").textContent).toContain("Enviamos um link de acesso para ana@example.com");
    expect(screen.queryByLabelText("Seu email")).toBeNull();
  });

  it("lets the lawyer use another email after the link is sent", async () => {
    render(<SignInForm sendLink={async () => {}} />);
    await requestLink();

    await userEvent.click(screen.getByRole("button", { name: "Usar outro email" }));

    expect((screen.getByLabelText("Seu email") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("explains a failure and lets the lawyer try again", async () => {
    const sendLink = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<SignInForm sendLink={sendLink} />);

    await requestLink();

    expect(screen.getByRole("alert").textContent).toContain("Não conseguimos enviar o link");
    await userEvent.click(screen.getByRole("button", { name: "Enviar link de acesso" }));
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
