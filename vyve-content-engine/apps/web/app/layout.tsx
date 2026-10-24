import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });

export const metadata: Metadata = {
  title: { default: "VYVE Content Engine", template: "%s · VYVE" },
  description: "Painel da agência: briefing, pesquisa, roteiros, produção, aprovação, calendário e análise.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${publicSans.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
