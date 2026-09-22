export type Email =
  | { template: "ingestion-ready"; to: string; data: { caseFileName: string; url: string } }
  | { template: "ingestion-failed"; to: string; data: { caseFileName: string; reason: string } };

export interface Mailer {
  send(email: Email): Promise<void>;
}
