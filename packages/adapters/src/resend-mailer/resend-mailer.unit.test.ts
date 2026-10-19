import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendMailer } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status = 200) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Resend mailer", () => {
  it("sends the sign-in email with the link to the lawyer", async () => {
    const fetch = stubFetch();
    const mailer = createResendMailer({ apiKey: "re_test", from: "Consta <noreply@consta.app>" });

    await mailer.send({ template: "sign-in", to: "ana@example.com", data: { url: "https://consta.app/api/auth/magic-link/verify?token=a&callbackURL=%2F" } });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer re_test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: "Consta <noreply@consta.app>", to: ["ana@example.com"], subject: "Seu link de acesso ao Consta" });
    expect(body.text).toContain("https://consta.app/api/auth/magic-link/verify?token=a&callbackURL=%2F");
    expect(body.html).toContain('href="https://consta.app/api/auth/magic-link/verify?token=a&amp;callbackURL=%2F"');
  });

  it("fails when Resend refuses the email", async () => {
    stubFetch(422);
    const mailer = createResendMailer({ apiKey: "re_test", from: "Consta <noreply@consta.app>" });

    await expect(mailer.send({ template: "sign-in", to: "ana@example.com", data: { url: "https://consta.app/x" } })).rejects.toThrow(
      "status 422",
    );
  });
});
