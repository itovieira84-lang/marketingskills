import { listClients, config, DEFAULT_MIX } from "@vyve/engine";
import { createBriefingAction } from "@/lib/actions";
import { requirePermission, ctxOf } from "@/lib/session";
import { FORMAT_LABEL } from "@/lib/format";
import { Back, Button, Card, Field, Flash, PageHeader, inputCls } from "@/components/ui";

export const metadata = { title: "Novo briefing" };

const MODES = [
  { v: "anthropic", label: "Anthropic API", hint: "Agentes rodam sozinhos no worker. Exige ANTHROPIC_API_KEY; gera custo por lote." },
  { v: "claude-code", label: "Claude Code (subagentes)", hint: "Cada etapa de IA vira uma tarefa para os subagentes do Claude Code responderem. Sem chave de API." },
  { v: "fixture", label: "Teste (dados fictícios)", hint: "Conteúdo de exemplo marcado como FICTÍCIO. Nunca usar com cliente." },
];

export default async function NovoBriefing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("briefing.create");
  const clients = await listClients(ctxOf(s));
  const sp = await searchParams;
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const def = config.defaultLlmMode;
  return (
    <>
      <PageHeader title="Novo briefing" sub="Escreva a ideia central ou envie um arquivo .txt/.md. O sistema planeja o mix, pesquisa com fontes e escreve os roteiros." />
      <Flash sp={sp} />
      <form action={createBriefingAction} className="grid gap-6 lg:grid-cols-3">
        <Back to="/briefings/novo" />
        <Card title="Briefing" className="lg:col-span-2">
          <div className="space-y-4">
            <Field label="Cliente">
              <select name="client_id" required defaultValue={sp.cliente ?? ""} className={inputCls}>
                <option value="" disabled>Escolha</option>
                {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Título do lote"><input name="title" required minLength={3} className={inputCls} placeholder="ex.: Semana do recomeço" /></Field>
            <Field label="Tema central"><input name="theme" required minLength={3} className={inputCls} /></Field>
            <Field label="Objetivo"><input name="objective" className={inputCls} placeholder="ex.: gerar conversas no direct sobre a mentoria" /></Field>
            <Field label="Contexto, ideias e materiais" hint="Pode colar transcrição, roteiro bruto ou anotações."><textarea name="body" rows={8} className={inputCls} /></Field>
            <Field label="Ou envie um arquivo (.txt ou .md)"><input name="file" type="file" accept=".txt,.md,text/plain,text/markdown" className="text-sm" /></Field>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Mix do lote (até 30)">
            <div className="space-y-2">
              {Object.keys(FORMAT_LABEL).map((k) => (
                <label key={k} className="flex items-center justify-between gap-3 text-sm">
                  <span>{FORMAT_LABEL[k]}</span>
                  <input name={`mix_${k}`} type="number" min={0} max={30} defaultValue={(DEFAULT_MIX as any)[k] ?? 0} className={`${inputCls} w-20`} />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Padrão: 10 Reels, 6 carrosséis, 6 cards, 6 sequências de Stories e 2 newsletters.</p>
          </Card>
          <Card title="Como a IA vai rodar">
            <fieldset className="space-y-3">
              {MODES.map((m) => (
                <label key={m.v} className="flex gap-2 text-sm">
                  <input type="radio" name="mode" value={m.v} defaultChecked={m.v === def} disabled={m.v === "anthropic" && !hasKey} className="mt-1" />
                  <span><span className="font-medium">{m.label}</span>{m.v === "anthropic" && !hasKey ? <span className="ml-1 text-xs text-warn">(chave não configurada)</span> : null}<span className="block text-xs text-muted">{m.hint}</span></span>
                </label>
              ))}
            </fieldset>
          </Card>
          <Button className="w-full">Criar lote</Button>
        </div>
      </form>
    </>
  );
}
