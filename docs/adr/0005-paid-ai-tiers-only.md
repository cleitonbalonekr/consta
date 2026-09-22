# Case-file content goes only to paid AI tiers that don't train on it

Case files hold personal data about people who aren't our lawyers and are covered by professional secrecy, so every AI provider (Anthropic, Voyage, Mistral) is used on a paid tier with training turned off, even where a free tier exists. Voyage's opt-out needs a payment method on file and must be turned on before the first real case file is ingested. This is an LGPD constraint that the code can't show: never add a provider, or move a key to a free tier, without checking its data-use terms.
