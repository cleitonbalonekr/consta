import { InvalidWebhook } from "@consta/core";
import { container } from "@/server/container";

export const dynamic = "force-dynamic";

/**
 * Stripe's webhook: keeps each lawyer's plan and page quota in sync with what they pay. The
 * signature covers the exact bytes Stripe sent, so the body is read as text, unparsed.
 * A 400 tells Stripe the request wasn't its own; any other error makes it retry.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature") ?? "";
  try {
    await container().plans.receiveWebhook(await request.text(), signature);
  } catch (error) {
    if (error instanceof InvalidWebhook) return Response.json({ error: "Invalid signature." }, { status: 400 });
    throw error;
  }
  return Response.json({ received: true });
}
