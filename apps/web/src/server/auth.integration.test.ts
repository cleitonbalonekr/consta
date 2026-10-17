import { LawyerId, Metering } from "@consta/core";
import { DrizzleUnitOfWork, schema } from "@consta/core/db";
import { InMemoryMailer } from "@consta/core/fakes";
import { createTestDb } from "@consta/core/testing";
import { describe, expect, it } from "vitest";
import { createAuth } from "./auth";
import type { Auth } from "./auth";

const options = { secret: "a-test-secret-that-is-long-enough-for-better-auth", baseURL: "http://localhost:3000", limitSignIns: false };

async function onPostgres() {
  const db = await createTestDb();
  const metering = new Metering({ uow: new DrizzleUnitOfWork(db) });
  const mailer = new InMemoryMailer();
  return { db, metering, mailer, auth: createAuth({ ...options, db, mailer, metering }) };
}

const lastSignInLink = (mailer: InMemoryMailer, email: string) =>
  mailer.outbox.flatMap((message) => (message.template === "sign-in" && message.to === email ? [message.data.url] : [])).at(-1);

/** Asks for a sign-in link, then follows the one the mailer received. */
async function signIn(auth: Auth, mailer: InMemoryMailer, email: string) {
  await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
  const token = new URL(lastSignInLink(mailer, email)!).searchParams.get("token")!;
  const { user } = await auth.api.magicLinkVerify({ query: { token }, headers: new Headers() });
  return LawyerId(user.id);
}

describe("sign-in with a magic link", () => {
  it("emails a link to the app's verify route", async () => {
    const { auth, mailer } = await onPostgres();

    await auth.api.signInMagicLink({ body: { email: "ana@example.com" }, headers: new Headers() });

    expect(mailer.outbox).toHaveLength(1);
    expect(lastSignInLink(mailer, "ana@example.com")).toMatch(/^http:\/\/localhost:3000\/api\/auth\/magic-link\/verify\?token=/);
  });

  it("gives a lawyer the Trial plan and its page quota on their first sign-in", async () => {
    const { auth, mailer, metering } = await onPostgres();

    const lawyer = await signIn(auth, mailer, "ana@example.com");

    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("signs the same lawyer in again without starting another Trial", async () => {
    const { db, auth, mailer } = await onPostgres();
    const first = await signIn(auth, mailer, "ana@example.com");

    const again = await signIn(auth, mailer, "ana@example.com");

    expect(again).toBe(first);
    expect(await db.select({ lawyerId: schema.lawyerPlan.lawyerId, plan: schema.lawyerPlan.plan }).from(schema.lawyerPlan)).toEqual([
      { lawyerId: first, plan: "trial" },
    ]);
  });
});
