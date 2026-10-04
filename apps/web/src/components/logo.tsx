/** The Consta mark: a page with a citation marker. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-fuchsia-500 text-accent-foreground shadow-[0_4px_14px_-4px_var(--accent)]">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M7 4h7l4 4v12H7z" />
          <path d="M10 12h5M10 15.5h3" />
        </svg>
      </span>
      <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">Consta</span>
    </span>
  );
}
