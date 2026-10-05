import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";

const authClient = createAuthClient({ plugins: [magicLinkClient()] });

/** Asks the server to email a sign-in link that lands on the case file list. Throws when it refuses. */
export async function sendSignInLink(email: string): Promise<void> {
  const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
  if (error) throw new Error(`The sign-in link was refused with status ${error.status}.`);
}
