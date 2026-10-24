import { notFound } from "next/navigation";
import { getClient, can } from "@vyve/engine";
import { addConsentAction, revokeConsentAction, setIntegrationAction, updateAssetRightsAction, updateBrandAction, uploadAssetAction } from "@/lib/actions";
import { requireSession, ctxOf } from "@/lib/session";
import { dt } from "@/lib/format";
import { Back, Badge, Button, Card, Empty, Field, Flash, PageHeader, Table, Td, Thumb, inputCls } from "@/components/ui";

const RIGHTS: Record<string, string> = { own: "Próprio", licensed: "Licenciado", authorized: "Autorizado", unknown: "Desconhecido", restricted: "Restrito" };
const KINDS: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", logo: "Logo", font: "Fonte", document: "Documento", reference: "Referência" };

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const s = await requireSession();
  const data = await getClient(ctxOf(s), id);
  if (!data) notFound();
  const { client, brand, assets, consents, integrations } = data;
  const here = `/clientes/${id}`;
  const colors = brand?.colors ?? {};
  const fonts = brand?.fonts ?? {};
  const canBrand = can(s.role, "brand.edit");
  const activeConsents = consents.filter((c: any) => !c.revoked_at);
  return (
    <>
      <PageHeader title={client.name} sub={[client.segment, client.tone && `Tom: ${client.tone}`].filter(Boolean).join(" · ") || "Sem segmento informado"} />
      <Flash sp={await searchParams} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Biblioteca de marca">
          <div className="mb-4 flex items-center gap-4">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-md border border-line" style={{ background: colors.background }}>
              {brand?.logo_asset_id ? <Thumb assetId={brand.logo_asset_id} mime="image/png" alt={`Logo ${client.name}`} className="h-16 w-16" /> : <span className="text-xs text-muted">sem logo</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(colors).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5 text-xs"><span className="h-5 w-5 rounded ring-1 ring-line" style={{ background: String(v) }} />{k} <code className="text-muted">{String(v)}</code></span>
              ))}
            </div>
          </div>
          <p className="mb-4 text-xs text-muted">O logo é usado sem deformação (proporção original). Sem logo enviado, as peças saem sem logo e nenhum é inventado.</p>
          {canBrand ? (
            <form action={updateBrandAction} className="space-y-3">
              <Back to={here} /><input type="hidden" name="client_id" value={id} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["primary", "secondary", "background", "text"] as const).map((k) => (
                  <Field key={k} label={{ primary: "Primária", secondary: "Secundária", background: "Fundo", text: "Texto" }[k]}>
                    <input name={k} type="color" defaultValue={colors[k] ?? "#000000"} className="h-10 w-full rounded border border-line" />
                  </Field>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fonte de títulos"><input name="font_heading" defaultValue={fonts.heading} className={inputCls} /></Field>
                <Field label="Fonte de texto"><input name="font_body" defaultValue={fonts.body} className={inputCls} /></Field>
              </div>
              <Field label="Tom e linguagem"><textarea name="voice" rows={2} defaultValue={brand?.voice} className={inputCls} /></Field>
              <Field label="Restrições" hint={'Uma por linha. Linhas "não usar: termo" viram bloqueio automático na revisão.'}><textarea name="restrictions" rows={3} defaultValue={brand?.restrictions} className={inputCls} /></Field>
              <Button>Salvar marca</Button>
            </form>
          ) : null}
        </Card>

        <Card title="Consentimentos de imagem e voz">
          <p className="mb-3 text-xs text-muted">Fotos e vídeos com pessoas só entram na produção com consentimento ativo. Voz de uma pessoa real nunca é clonada nem sintetizada pelo sistema.</p>
          {consents.length ? (
            <ul className="mb-4 divide-y divide-line text-sm">
              {consents.map((c: any) => (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <span className="min-w-0"><span className="font-medium">{c.person_name}</span> <Badge status={c.revoked_at ? "rejeitado" : "aprovado"} label={c.revoked_at ? "revogado" : c.scope} />
                    <span className="block break-words text-xs text-muted">Por {c.granted_by} em {dt(c.granted_at)} · {c.evidence}</span></span>
                  {!c.revoked_at && canBrand ? (
                    <form action={revokeConsentAction}><Back to={here} /><input type="hidden" name="consent_id" value={c.id} /><Button variant="danger">Revogar</Button></form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <div className="mb-4"><Empty>Nenhum consentimento registrado.</Empty></div>}
          {canBrand ? (
            <form action={addConsentAction} className="grid gap-3 sm:grid-cols-2">
              <Back to={here} /><input type="hidden" name="client_id" value={id} />
              <Field label="Pessoa"><input name="person" required className={inputCls} /></Field>
              <Field label="Escopo"><select name="scope" className={inputCls}><option value="image">Imagem</option><option value="likeness">Semelhança</option><option value="voice">Voz (só uso da gravação original)</option></select></Field>
              <Field label="Autorizado por"><input name="granted_by" required className={inputCls} /></Field>
              <Field label="Evidência" hint="Link, documento ou mensagem que comprova"><input name="evidence" required className={inputCls} /></Field>
              <div className="sm:col-span-2"><Button variant="ghost">Registrar consentimento</Button></div>
            </form>
          ) : null}
        </Card>

        <Card title={`Materiais (${assets.length})`} className="lg:col-span-2">
          {can(s.role, "asset.upload") ? (
            <form action={uploadAssetAction} className="mb-5 grid gap-3 rounded-md bg-paper p-3 sm:grid-cols-3">
              <Back to={here} /><input type="hidden" name="client_id" value={id} />
              <Field label="Arquivos"><input name="file" type="file" multiple required className="text-sm" /></Field>
              <Field label="Tipo"><select name="kind" className={inputCls}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Direitos de uso"><select name="rights" className={inputCls}>{Object.entries(RIGHTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Rótulo (opcional)"><input name="label" className={inputCls} /></Field>
              <Field label="Consentimento"><select name="consent_id" className={inputCls}><option value="">—</option>{activeConsents.map((c: any) => <option key={c.id} value={c.id}>{c.person_name} ({c.scope})</option>)}</select></Field>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="has_person" /> Mostra uma pessoa</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="voice_of_person" /> Áudio com voz de pessoa real</label>
              </div>
              <div className="sm:col-span-3"><Button>Enviar</Button> <span className="ml-2 text-xs text-muted">Direito "desconhecido" ou "restrito" impede o uso na produção.</span></div>
            </form>
          ) : null}
          {assets.length ? (
            <Table head={["Prévia", "Arquivo", "Dimensões", "Direitos", ""]}>
              {assets.map((a: any) => (
                <tr key={a.id}>
                  <Td><Thumb assetId={a.mime.startsWith("image/") || a.mime.startsWith("video/") ? a.id : null} mime={a.mime} alt={a.label} className="h-16 w-16 rounded" /></Td>
                  <Td><span className="block font-medium">{a.label}</span><span className="text-xs text-muted">{KINDS[a.kind] ?? a.kind} · {(Number(a.bytes) / 1e6).toFixed(1)} MB{a.metadata?.has_person ? " · com pessoa" : ""}</span></Td>
                  <Td className="whitespace-nowrap text-muted">{a.width ? `${a.width}×${a.height}` : "—"}{a.duration_s ? ` · ${Number(a.duration_s).toFixed(1)} s` : ""}</Td>
                  <Td><Badge status={["own", "licensed", "authorized"].includes(a.rights_status) ? "aprovado" : "pendente"} label={RIGHTS[a.rights_status]} />{a.consent_id ? <span className="ml-1 text-xs text-ok">consentimento</span> : null}</Td>
                  <Td>
                    {canBrand ? (
                      <form action={updateAssetRightsAction} className="flex flex-wrap items-center gap-1">
                        <Back to={here} /><input type="hidden" name="asset_id" value={a.id} />
                        <select name="rights" defaultValue={a.rights_status} className={`${inputCls} w-32 py-1`}>{Object.entries(RIGHTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                        <select name="consent_id" defaultValue={a.consent_id ?? ""} className={`${inputCls} w-32 py-1`}><option value="">sem consentimento</option>{activeConsents.map((c: any) => <option key={c.id} value={c.id}>{c.person_name}</option>)}</select>
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="has_person" defaultChecked={Boolean(a.metadata?.has_person)} />pessoa</label>
                        <Button variant="ghost" className="py-1">Salvar</Button>
                      </form>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : <Empty>Nenhum material enviado. Sem vídeo original, os Reels saem como storyboard (pendente de produção).</Empty>}
        </Card>

        <Card title="Integrações do cliente" className="lg:col-span-2">
          <p className="mb-3 text-sm text-muted">O token do Instagram fica numa variável de ambiente do servidor. Aqui você só informa o <strong>nome</strong> dessa variável e o ID da conta.</p>
          {integrations.length ? (
            <ul className="mb-4 text-sm">{integrations.map((i: any) => <li key={i.provider} className="flex flex-wrap items-center gap-2"><strong>{i.provider}</strong> <Badge status={i.status} /> <code className="text-muted">{i.secret_env ?? "sem variável"}</code> {i.config?.ig_user_id ? <span className="text-muted">ig_user_id {i.config.ig_user_id}</span> : null}</li>)}</ul>
          ) : null}
          {can(s.role, "integrations.manage") ? (
            <form action={setIntegrationAction} className="grid gap-3 sm:grid-cols-4">
              <Back to={here} /><input type="hidden" name="client_id" value={id} /><input type="hidden" name="provider" value="instagram" />
              <Field label="Variável com o token"><input name="secret_env" placeholder="IG_TOKEN_CLIENTE" pattern="[A-Z][A-Z0-9_]{2,63}" className={inputCls} /></Field>
              <Field label="ig_user_id"><input name="ig_user_id" className={inputCls} /></Field>
              <div className="self-end"><Button variant="ghost">Salvar Instagram</Button></div>
            </form>
          ) : null}
        </Card>
      </div>
    </>
  );
}
