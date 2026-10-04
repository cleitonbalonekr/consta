import { CaseFileId, NotFound } from "@consta/core";
import type { AnswerEvent } from "@consta/core";
import { ANSWER_STREAM_TYPE, encodeAnswerEvents } from "@/lib/answer-stream";
import { parseQuestionRequest } from "@/lib/question-request";
import { container } from "@/server/container";
import { currentLawyer } from "@/server/lawyer";

export const dynamic = "force-dynamic";

/** Asks a question about one case file and streams the answer, one event per line. */
export async function POST(request: Request, ctx: RouteContext<"/api/case-files/[caseFileId]/questions">) {
  const { caseFileId } = await ctx.params;
  const question = parseQuestionRequest(CaseFileId(caseFileId), await request.json().catch(() => null));
  if (!question) return Response.json({ error: "Pergunta inválida." }, { status: 400 });

  const events = container().answering.ask(await currentLawyer(), question)[Symbol.asyncIterator]();
  let first: IteratorResult<AnswerEvent>;
  try {
    // Wait for the first event, so a case file the lawyer doesn't own is a 404 rather than a broken stream.
    first = await events.next();
  } catch (error) {
    if (error instanceof NotFound) return Response.json({ error: "Autos ou peça não encontrados." }, { status: 404 });
    throw error;
  }

  return new Response(encodeAnswerEvents(prepend(first, events)), {
    headers: { "Content-Type": ANSWER_STREAM_TYPE, "Cache-Control": "no-store" },
  });
}

async function* prepend<T>(first: IteratorResult<T>, rest: AsyncIterator<T>): AsyncIterable<T> {
  if (first.done) return;
  yield first.value;
  for (let next = await rest.next(); !next.done; next = await rest.next()) yield next.value;
}
