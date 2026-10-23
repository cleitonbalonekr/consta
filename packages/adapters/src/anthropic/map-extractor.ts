import Anthropic from "@anthropic-ai/sdk";
import { CalendarDate, factKinds, pecaTypes } from "@consta/core";
import type { FactDraft, MapExtractor, PageText, PecaDraft, Usage } from "@consta/core/ports";
import type { AnthropicConfig } from "./index";
import { ClaudePrices } from "./prices";

/** A window's peças and facts, with room for the model's thinking before it answers. */
const MAX_TOKENS = 32_000;


const INSTRUCTIONS = `You read consecutive pages of a Brazilian lawsuit's case file (the autos) and map them.

Return every peça in these pages: one document inside the case file, such as a petição inicial, contestação, despacho, decisão, sentença, laudo or procuração. For each peça give:
- type: the closest of ${pecaTypes.join(", ")}. Use "documento" for evidence attached by a party, and "outro" only when nothing else fits.
- title: a short title in Brazilian Portuguese, as a lawyer would write it in an index.
- date: the date the peça bears, as YYYY-MM-DD, or null when it shows none.
- firstPage and lastPage: the page numbers where it starts and ends, inside these pages.
- summary: two or three sentences in Brazilian Portuguese saying what the peça asks, decides or proves.

The pages may begin in the middle of the open peça, the last peça of the previous pages. If they do, return the open peça first, with its firstPage unchanged, the lastPage where it ends in these pages, and a summary of all of it. Otherwise, start with the peça that begins on the first page.

Also return the facts stated in these pages, each with the page it is on:
- kind: one of ${factKinds.join(", ")}. A person is a party, lawyer, judge, witness or expert; a role says who that person is in the case; a date is when something happened; an amount is a sum of money; an event is something that happened in the case.
- value: the fact as written.
- normalizedValue: a date as YYYY-MM-DD, an amount as a decimal number in reais such as 10000.00, a person's full name; null when there is nothing to normalize.
- context: a few words saying what the fact is about.

A page marked unread is a scanned page whose text was not read: it can be part of a peça, but no fact comes from it.`;

const NULLABLE_STRING = { anyOf: [{ type: "string" }, { type: "null" }] };

/** The answer's shape, which structured outputs hold Claude to. */
const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pecas", "facts"],
  properties: {
    pecas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "date", "firstPage", "lastPage", "summary"],
        properties: {
          type: { type: "string", enum: [...pecaTypes] },
          title: { type: "string" },
          date: NULLABLE_STRING,
          firstPage: { type: "integer" },
          lastPage: { type: "integer" },
          summary: { type: "string" },
        },
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "value", "normalizedValue", "context", "page"],
        properties: {
          kind: { type: "string", enum: [...factKinds] },
          value: { type: "string" },
          normalizedValue: NULLABLE_STRING,
          context: { type: "string" },
          page: { type: "integer" },
        },
      },
    },
  },
};

/**
 * Phase 3: the document map and facts of a window of pages, from one Claude call with
 * structured output. Ingestion keeps each window far under 100,000 tokens, where Claude
 * Haiku 5.5 costs five times as much. Throws when Claude declines, runs out of tokens or
 * answers outside the schema, so the map step runs again. Throws for a model it has no
 * price for, so metering never guesses.
 */
export class ClaudeMapExtractor implements MapExtractor {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor({ apiKey, model }: AnthropicConfig & { model: string }) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    ClaudePrices.of(model);
  }

  async extract({ pages, openPeca }: { pages: PageText[]; openPeca: PecaDraft | null }) {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: INSTRUCTIONS,
      output_config: { effort: "medium", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      messages: [{ role: "user", content: this.prompt(pages, openPeca) }],
    });
    const message = await stream.finalMessage();
    const window = `pages ${pages[0]?.page} to ${pages.at(-1)?.page}`;
    if (message.stop_reason === "refusal") throw new Error(`Claude declined to map ${window}.`);
    if (message.stop_reason === "max_tokens") throw new Error(`Claude stopped at max_tokens mapping ${window}.`);

    const answer = this.parse(message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join(""));
    return { ...answer, usage: [this.usage(message)] };
  }

  private prompt(pages: PageText[], openPeca: PecaDraft | null): string {
    const open = openPeca ? `<open_peca>${JSON.stringify(openPeca)}</open_peca>` : "<open_peca>none</open_peca>";
    const shown = pages.map(({ page, text, source }) =>
      source === "scanned" ? `<page number="${page}" unread="true"></page>` : `<page number="${page}">\n${text}\n</page>`,
    );
    return [open, ...shown].join("\n\n");
  }

  /** Structured outputs keep the answer in the schema; a date that is no YYYY-MM-DD day of the calendar becomes no date. */
  private parse(text: string): { pecas: PecaDraft[]; facts: FactDraft[] } {
    let answer: { pecas: PecaDraft[]; facts: FactDraft[] };
    try {
      // The schema sent with the request gives the answer this shape.
      answer = JSON.parse(text) as typeof answer;
    } catch {
      throw new Error("Claude answered the map step without JSON.");
    }
    return {
      pecas: answer.pecas.map((peca) => ({ ...peca, date: peca.date ? (CalendarDate.parse(peca.date)?.iso ?? null) : null })),
      facts: answer.facts,
    };
  }

  private usage(message: Anthropic.Message): Usage {
    const { units, costUsd } = ClaudePrices.cost(message.model, message.usage);
    return { kind: "extract", provider: "anthropic", model: message.model, units, unit: "token", costUsd };
  }
}
