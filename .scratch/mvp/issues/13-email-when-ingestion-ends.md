# 13: Email when ingestion ends

**What to build:** When ingestion finishes, the lawyer receives one email: ready, with a link to the case file, or failed, with the reason. Emails are in Portuguese. Locally they appear in the server console in fake mode.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Ready and failed emails are sent exactly once per outcome, even when a step is retried
- [ ] Templates are Portuguese and include the case file name and a link or reason
- [ ] Integration tests use the in-memory mailer to assert one email per outcome
- [ ] Works locally in fake mode, with the email logged to the console
