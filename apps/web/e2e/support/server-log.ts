import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where playwright.config.ts sends the E2E server's console. In fake mode the
 * mailer logs each sign-in link there instead of emailing it.
 */
export const SERVER_LOG = path.join(__dirname, "../../e2e-server.log");

/** The newest sign-in link the server logged for this email. Waits for it to appear. */
export async function signInLinkFor(email: string): Promise<string> {
  const line = new RegExp(`Sign-in link for ${email.replace(/[.+]/g, "\\$&")}: (\\S+)`, "g");
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const log = await readFile(SERVER_LOG, "utf8").catch(() => "");
        link = [...log.matchAll(line)].at(-1)?.[1];
        return link;
      },
      { message: `No sign-in link for ${email} in ${SERVER_LOG}. A server you start yourself must write its output there.` },
    )
    .toBeDefined();
  return link!;
}
