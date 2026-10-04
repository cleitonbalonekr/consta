"use client";

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
        className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-red-50 hover:text-red-700"
      >
        Excluir
      </button>
      <dialog
        ref={dialog}
        id={`confirm-delete-dialog-${caseFileId}`}
        aria-labelledby={`confirm-delete-title-${caseFileId}`}
        className="m-auto w-full max-w-md rounded-lg p-6 text-left shadow-xl backdrop:bg-zinc-950/40"
      >
        <h2 id={`confirm-delete-title-${caseFileId}`} className="text-lg font-semibold text-zinc-900">
          Excluir estes autos?
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">{name}</span> e tudo o que foi lido dele serão apagados. Isso não pode ser desfeito, e as
          páginas já lidas continuam contando na sua cota do mês.
        </p>
        {failed && (
          <p id={`delete-error-${caseFileId}`} role="alert" className="mt-3 text-sm text-red-700">
            Não conseguimos excluir agora. Tente de novo.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button id={`cancel-delete-${caseFileId}`} type="button" onClick={() => dialog.current?.close()} className="rounded-md px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
            Cancelar
          </button>
          <button
            id={`confirm-delete-${caseFileId}`}
            type="button"
            disabled={deleting}
            onClick={() => void confirm()}
            className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {deleting ? "Excluindo…" : "Excluir"}
          </button>
        </div>
      </dialog>
    </>
  );
}
