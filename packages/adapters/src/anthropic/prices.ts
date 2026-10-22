/** The token counts of one Claude reply, as the Messages API reports them. */
type ReplyUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

type Price = { input: number; output: number; cacheRead: number };

/** A model's price, and its higher price for a prompt over `above` tokens when it has one. */
type ListedPrice = Price & { longPrompt?: { above: number } & Price };

/**
 * List prices in USD per million tokens. The requested models, and the models the
 * server-side fallback answers on for them, each at its own rate. Claude Haiku 5.5 costs
 * five times as much for a prompt over 100,000 tokens. Its cache-read price is a tenth of
 * its input price, unchecked: the map extractor, its only caller, does not cache.
 */
const USD_PER_MILLION_TOKENS: Record<string, ListedPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, longPrompt: { above: 100_000, input: 0.5, output: 2.5, cacheRead: 0.05 } },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};

/** A cache write costs 1.25 times an input token. */
const CACHE_WRITE = 1.25;

/** What a Claude reply cost. Throws for a model with no price, so metering never guesses. */
export class ClaudePrices {
  static of(model: string): ListedPrice {
    const price = USD_PER_MILLION_TOKENS[model];
    if (!price) throw new Error(`No price for the Claude model ${model}.`);
    return price;
  }

  static cost(model: string, usage: ReplyUsage): { units: number; costUsd: number } {
    const written = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    const prompt = usage.input_tokens + written + read;
    const listed = ClaudePrices.of(model);
    const price = listed.longPrompt && prompt > listed.longPrompt.above ? listed.longPrompt : listed;
    const inputUsd = (usage.input_tokens + written * CACHE_WRITE) * price.input + read * price.cacheRead;
    return { units: prompt + usage.output_tokens, costUsd: (inputUsd + usage.output_tokens * price.output) / 1_000_000 };
  }
}
