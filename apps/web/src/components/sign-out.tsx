import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";

/** The signed-in lawyer's email and a button that ends their session. */
export function SignOut({ email }: { email: string }) {
  return (
    <form action={signOut} className="flex items-center gap-1">
      <span id="signed-in-email" className="hidden max-w-56 truncate text-xs text-subtle sm:inline">
        {email}
      </span>
      <button
        id="sign-out"
        type="submit"
        aria-label="Sair"
        title="Sair"
        className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </form>
  );
}
