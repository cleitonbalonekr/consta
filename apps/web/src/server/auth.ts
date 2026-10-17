import { LawyerId } from "@consta/core";
import type { Metering } from "@consta/core";
import { schema } from "@consta/core/db";
import type { Db } from "@consta/core/db";
import type { Mailer } from "@consta/core/ports";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

export type AuthDeps = {
  /** The modules' Postgres, which holds Better Auth's tables too. */
  db: Db;
  mailer: Mailer;
  /** Gives a lawyer the Trial plan on their first sign-in. */
  metering: Metering;
  /** Limits sign-in emails per IP. The fake mailer sends none, so it needs no limit. */
  limitSignIns: boolean;
  /** Both default to Better Auth's environment variables; the URL is otherwise read from the request. */
  secret?: string;
  baseURL?: string;
};

export type Auth = ReturnType<typeof createAuth>;

/**
 * Better Auth with magic-link sign-in. A lawyer's id is their Better Auth user id.
 * Routes are served under `/api/auth`.
 */
export function createAuth({ db, mailer, metering, limitSignIns, secret, baseURL }: AuthDeps) {
  return betterAuth({
    secret,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    rateLimit: { enabled: limitSignIns },
    databaseHooks: {
      user: {
        create: {
          // Runs after the user row commits, so the plan's foreign key finds it.
          after: async (user) => {
            await metering.startTrial(LawyerId(user.id));
          },
        },
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await mailer.send({ template: "sign-in", to: email, data: { url } });
        },
      }),
      // Lets server actions set and clear the session cookie; Better Auth wants it last.
      nextCookies(),
    ],
  });
}
