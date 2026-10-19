"use client";

import { LoaderCircle, MailCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { sendSignInLink } from "@/lib/auth-client";

type SignInState = { step: "idle" } | { step: "sending" } | { step: "sent"; email: string } | { step: "error" };

type SignInFormProps = {
  /** Emails the sign-in link. Tests pass a fake. */
  sendLink?: (email: string) => Promise<void>;
};

/** Asks for the lawyer's email and sends them a sign-in link. */
export function SignInForm({ sendLink = sendSignInLink }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SignInState>({ step: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    setState({ step: "sending" });
    try {
      await sendLink(address);
      setState({ step: "sent", email: address });
    } catch {
      setState({ step: "error" });
    }
  }

  if (state.step === "sent") {
    return (
      <div id="sign-in-link-sent" role="status" className="flex animate-rise flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-success-soft text-success">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <p className="font-semibold text-foreground">Enviamos um link de acesso para {state.email}</p>
        <p className="text-sm text-muted">Abra seu email e clique no link para entrar. Ele expira em poucos minutos.</p>
        <button
          id="sign-in-other-email"
          type="button"
          onClick={() => setState({ step: "idle" })}
          className="mt-1 text-sm font-medium text-foreground underline decoration-line-strong underline-offset-4 hover:decoration-foreground"
        >
          Usar outro email
        </button>
      </div>
    );
  }

  const sending = state.step === "sending";
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="sign-in-email" className="text-sm font-medium text-foreground">
        Seu email
      </label>
      <input
        id="sign-in-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="voce@escritorio.adv.br"
        className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-foreground placeholder:text-subtle focus:border-accent focus:outline-none"
      />
      <button
        id="send-sign-in-link"
        type="submit"
        disabled={sending}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:bg-surface-muted disabled:text-subtle"
      >
        {sending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {sending ? "Enviando…" : "Enviar link de acesso"}
      </button>
      {state.step === "error" && (
        <p id="sign-in-error" role="alert" className="flex items-center gap-2 text-sm text-danger">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          Não conseguimos enviar o link agora. Tente de novo.
        </p>
      )}
    </form>
  );
}
