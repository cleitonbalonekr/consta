import { NotImplemented } from "@consta/core";
import type { Mailer } from "@consta/core/ports";

/** Phase 6 (S1): ingestion-ready and ingestion-failed emails through Resend. */
export function createResendMailer(_config: { apiKey: string; from: string }): Mailer {
  return {
    async send() {
      throw new NotImplemented("ResendMailer.send");
    },
  };
}
