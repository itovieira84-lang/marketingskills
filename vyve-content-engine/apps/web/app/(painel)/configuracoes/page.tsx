import { cookies } from "next/headers";
import { integrationStatus, listClients, listExternalTasks, listUsers, withCtx, many, can, config } from "@vyve/engine";
import { createApiKeyAction, createUserAction, verifyAnthropicAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { ROLE_LABEL, dt } from "@/lib/format";
import { Back, Badge, Button, Card, Empty, Field, Flash, PageHeader, Table, Td, inputCls } from "@/components/ui";

export const metadata = { title: "Configurações" };
const STATUS: Record<string, string> = { verified: "Verificada", configured: "Configurada (não testada)", not_configured: "Não configurada", error: "Erro" };

export default async function Configuracoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireSession();
  const ctx = ctxOf(s);
  const manage = can(s.role, "integrations.manage");
  const [integrations, tasks, users, clients, keys] = await Promise.all([
    integrationStatus(ctx), listExternalTasks(ctx),
    can(s.role, "users.manage") ? listUsers(ctx) : Promise.resolve([]),
    listClients(ctx),
    manage ? withCtx(ctx, (tx) => many(tx, "select id, label, revoked_at, created_at from vyve.api_keys order by created_at desc")) : Promise.resolve([]),
  ]);
  const newKey = manage ? (await cookies()).get("vyve_new_key")?.value : undefined;
  return (
    <>
      <PageHeader title="Configurações" sub="Integrações, chaves de API para o n8n, usuários e tarefas dos subagentes. Segredos ficam só em variáveis de ambiente do servidor." />
      <Flash sp={await searchParams} />
      {newKey ? <div className="mb-6 rounded-lg border border-ok/40 bg-ok/5 p-4"><p className="text-sm font-semibold text-ok">Nova chave de API (aparece só agora)</p><code className="mt-1 block break-all rounded bg-surface p-2 text-sm">{newKey}</code></div> : null}
      <div className="grid gap-6">
        <Card title="Integrações" actions={manage ? <form action={verifyAnthropicAction}><Back to="/configuracoes" /><Button variant="ghost">Testar Anthropic API</Button></form> : null}>
          <p className="mb-3 text-sm text-muted">“Verificada” só aparece depois de uma chamada real bem-sucedida. Modo de IA padrão: <strong>{config.defaultLlmMode}</strong> · modelo {config.model}.</p>
          <Table head={["Integração", "Escopo", "Status", "Variável", "Como configurar"]}>
            {integrations.map((i: any, k: number) => (
              <tr key={k}>
                <Td className="font-medium">{i.label}</Td>
                <Td className="text-muted">{i.client ?? "agência"}</Td>
                <Td><Badge status={i.status} label={STATUS[i.status] ?? i.status} />{i.last_error ? <span className="mt-1 block max-w-xs text-xs text-err">{i.last_error}</span> : null}</Td>
                <Td className="font-mono text-xs">{i.env?.join(", ") || "—"}</Td>
                <Td className="max-w-sm text-xs text-muted">{i.doc}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title={`Tarefas para os subagentes do Claude Code (${tasks.length})`}>
          {tasks.length ? (
            <>
              <ul className="mb-3 divide-y divide-line text-sm">{tasks.map((t: any) => <li key={t.id} className="flex flex-wrap justify-between gap-2 py-2"><span><strong>{t.step}</strong> · {t.client}</span><code className="text-xs text-muted">{t.id}</code></li>)}</ul>
              <p className="text-sm text-muted">No terminal do projeto, peça ao Claude Code: “responda as tarefas pendentes do VYVE”. A skill <code>vyve-orquestrar-lote</code> distribui cada tarefa ao subagente certo.</p>
            </>
          ) : <Empty>Nenhuma tarefa aguardando.</Empty>}
        </Card>

        {manage ? (
          <Card title="Chaves de API (n8n e automações)">
            <form action={createApiKeyAction} className="mb-4 flex flex-wrap items-end gap-3">
              <Back to="/configuracoes" />
              <Field label="Rótulo"><input name="label" defaultValue="n8n" className={inputCls} /></Field>
              <Button>Criar chave</Button>
            </form>
            {keys.length ? <ul className="text-sm">{keys.map((k: any) => <li key={k.id} className="flex justify-between border-t border-line py-1.5"><span>{k.label}</span><span className="text-muted">{k.revoked_at ? "revogada" : `criada ${dt(k.created_at)}`}</span></li>)}</ul> : null}
            <p className="mt-2 text-xs text-muted">Use no n8n como cabeçalho <code>Authorization: Bearer &lt;chave&gt;</code>. A chave age com o papel Sistema: cria briefings e agenda, mas não aprova peças.</p>
          </Card>
        ) : null}

        {can(s.role, "users.manage") ? (
          <Card title="Usuários e papéis">
            <Table head={["Nome", "E-mail", "Papel", "Desde"]}>
              {users.map((u: any) => <tr key={u.id}><Td>{u.name}</Td><Td className="text-muted">{u.email}</Td><Td>{ROLE_LABEL[u.role]}</Td><Td className="text-muted">{dt(u.created_at)}</Td></tr>)}
            </Table>
            <form action={createUserAction} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
              <Back to="/configuracoes" />
              <Field label="Nome"><input name="name" required className={inputCls} /></Field>
              <Field label="E-mail"><input name="email" type="email" required className={inputCls} /></Field>
              <Field label="Senha inicial"><input name="password" type="password" minLength={10} required className={inputCls} /></Field>
              <Field label="Papel"><select name="role" className={inputCls}>{["admin", "strategist", "creator", "reviewer", "client"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
              <Field label="Clientes (para papel Cliente)"><select name="client_ids" multiple className={`${inputCls} h-20`}>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <div className="self-end"><Button>Criar usuário</Button></div>
            </form>
          </Card>
        ) : null}
      </div>
    </>
  );
}
