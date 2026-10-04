"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { removeCaseFile } from "@/app/actions";

type DeleteCaseFileProps = {
  caseFileId: string;
  name: string;
  /** Go back to the list afterwards, when deleting from the case file's own page. */
  returnToList?: boolean;
};

/** A delete button that asks for confirmation first. */
export function DeleteCaseFile({ caseFileId, name, returnToList = false }: DeleteCaseFileProps) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm() {
    setDeleting(true);
    setFailed(false);
    try {
      await removeCaseFile(caseFileId);
      dialog.current?.close();
      if (returnToList) router.push("/");
    } catch {
      setFailed(true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        id={`delete-case-file-${caseFileId}`}
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={`Excluir ${name}`}
        title="Excluir"
        className="grid size-9 place-items-center rounded-lg text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      <dialog
        ref={dialog}
        id={`confirm-delete-dialog-${caseFileId}`}
        aria-labelledby={`confirm-delete-title-${caseFileId}`}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-6 text-left text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <span className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
          <Trash2 className="size-5" aria-hidden />
        </span>
        <h2 id={`confirm-delete-title-${caseFileId}`} className="mt-4 text-lg font-semibold">
          Excluir estes autos?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          <span className="font-medium break-all text-foreground">{name}</span> e tudo o que foi lido dele serão apagados. Isso não pode ser desfeito,
          e as páginas já lidas continuam contando na sua cota do mês.
        </p>
        {failed && (
          <p id={`delete-error-${caseFileId}`} role="alert" className="mt-3 text-sm text-danger">
            Não conseguimos excluir agora. Tente de novo.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            id={`cancel-delete-${caseFileId}`}
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            id={`confirm-delete-${caseFileId}`}
            type="button"
            disabled={deleting}
            onClick={() => void confirm()}
            className="rounded-lg bg-danger px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </dialog>
    </>
  );
}
