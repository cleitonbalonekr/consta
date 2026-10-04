export type Theme = "light" | "dark";

/** Where the lawyer's theme choice is kept, in this browser only. */
export const THEME_STORAGE_KEY = "consta-theme";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong
 * theme: the stored choice, or else the system's.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}})();`;
