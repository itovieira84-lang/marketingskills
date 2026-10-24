import { redirect } from "next/navigation";
import { loginAction } from "@/lib/actions";
import { getSession } from "@/lib/session";
import { Button, Field, inputCls } from "@/components/ui";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getSession()) redirect("/");
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 font-display text-4xl font-extrabold tracking-tight text-white">VYVE<span className="text-cobalt">.</span></p>
        <form action={loginAction} className="space-y-4 rounded-lg bg-surface p-6">
          <h1 className="text-xl font-bold">Entrar no painel</h1>
          {erro ? <p role="alert" className="rounded-md bg-err/5 px-3 py-2 text-sm text-err">{erro}</p> : null}
          <Field label="E-mail"><input name="email" type="email" required autoComplete="username" className={inputCls} /></Field>
          <Field label="Senha"><input name="password" type="password" required autoComplete="current-password" className={inputCls} /></Field>
          <Button className="w-full">Entrar</Button>
        </form>
        <p className="mt-4 text-xs text-white/60">Acesso por equipe. Clientes só enxergam os próprios conteúdos.</p>
      </div>
    </main>
  );
}
