import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { signedInLawyer } from "@/server/lawyer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Entrar · Consta" };

export default async function SignInPage() {
  if (await signedInLawyer()) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="animate-rise rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Entrar no Consta</h1>
        <p className="mt-2 mb-6 text-sm text-muted">Sem senha: enviamos um link de acesso para o seu email.</p>
        <SignInForm />
      </div>
    </main>
  );
}
