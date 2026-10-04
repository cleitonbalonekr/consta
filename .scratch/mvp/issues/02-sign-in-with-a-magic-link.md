# 02: Sign in with a magic link

**What to build:** A lawyer enters their email, receives a sign-in link, and lands on their case files. Every app route needs a session; signed-out visitors go to sign-in. The first sign-in gives the lawyer a Trial plan with its page quota. Locally the sign-in link appears in the server console, so no email account is needed. Each lawyer sees only their own case files, including in demo mode.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Better Auth with magic-link sign-in and sign-out; its tables are part of the Drizzle migrations
- [ ] Signed-out requests to any app route redirect to sign-in; signed-in visits to sign-in redirect to the case file list
- [ ] The first sign-in creates the lawyer's Trial plan row with the Trial page quota
- [ ] `Metering.pagesLeft` returns the Trial quota for a new lawyer
- [ ] The Resend mailer adapter sends the sign-in email in real-adapter mode; in fake mode the fake mailer logs the link to the server console
- [ ] Demo modules key case files by lawyer: a second lawyer sees an empty list
- [ ] Integration tests cover the Trial plan on first sign-in and `pagesLeft`
- [ ] Component tests cover the sign-in form states (sending, sent, error)
- [ ] E2E journeys cover sign-in through the logged link, route protection, and two lawyers not seeing each other's case files
- [ ] Works locally in fake mode with no accounts
