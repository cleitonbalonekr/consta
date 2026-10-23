import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignOut } from "@/components/sign-out";
import { ThemeToggle } from "@/components/theme-toggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { signedInLawyer } from "@/server/lawyer";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Consta",
  description: "Perguntas sobre os autos, com a página de cada resposta.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lawyer = await signedInLawyer();
  return (
    // The theme script sets data-theme before React hydrates, so the attribute differs from the server's on purpose.
    <html lang="pt-BR" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex h-full flex-col font-sans">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-background/80 px-4 backdrop-blur-xl sm:px-6">
          <Link id="home-link" href="/" aria-label="Consta, seus autos" className="rounded-lg">
            <Logo />
          </Link>
          <div className="flex items-center gap-1">
            {lawyer && (
              <Link id="plan-link" href="/plano" className="rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground">
                Plano
              </Link>
            )}
            {lawyer && <SignOut email={lawyer.email} />}
            <ThemeToggle />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
