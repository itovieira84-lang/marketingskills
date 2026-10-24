// Gera os workflows do n8n em n8n/workflows/*.json (importáveis em Workflows → Import from file).
// Rode: node n8n/build-workflows.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = path.join(import.meta.dirname, "workflows");
const id = () => crypto.randomUUID();
const CRED = { httpHeaderAuth: { id: "VYVE_API", name: "VYVE API (Authorization: Bearer ...)" } };

const config = (x, y) => ({
  id: id(), name: "Config", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [x, y],
  parameters: { assignments: { assignments: [{ id: id(), name: "base_url", value: "https://SEU-PAINEL-VYVE", type: "string" }] }, includeOtherFields: true, options: {} },
});
const http = (name, method, route, x, y, body) => ({
  id: id(), name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position: [x, y], credentials: CRED,
  parameters: {
    method, url: `={{ $('Config').item.json.base_url }}${route}`,
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth",
    ...(body ? { sendBody: true, specifyBody: "json", jsonBody: body } : {}),
    options: { timeout: 600000 },
  },
});
const chain = (names) => Object.fromEntries(names.slice(0, -1).map((n, i) => [n, { main: [[{ node: names[i + 1], type: "main", index: 0 }]] }]));
const wf = (name, nodes, connections, note) => ({
  name, nodes: [...nodes, { id: id(), name: "Leia-me", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [nodes[0].position[0], nodes[0].position[1] - 260], parameters: { content: note, width: 520, height: 220 } }],
  connections, settings: { executionOrder: "v1" }, active: false, pinData: {},
});

const workflows = {
  "01-briefing-para-lote": wf("VYVE · Briefing recebido vira lote", [
    { id: id(), name: "Webhook briefing", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0], webhookId: id(), parameters: { httpMethod: "POST", path: "vyve-briefing", responseMode: "responseNode", options: {} } },
    config(220, 0),
    http("Criar lote", "POST", "/api/v1/briefings", 440, 0,
      "={{ JSON.stringify({ clientId: $('Webhook briefing').item.json.body.clientId, title: $('Webhook briefing').item.json.body.title, theme: $('Webhook briefing').item.json.body.theme, objective: $('Webhook briefing').item.json.body.objective, body: $('Webhook briefing').item.json.body.body, mix: $('Webhook briefing').item.json.body.mix, mode: $('Webhook briefing').item.json.body.mode }) }}"),
    { id: id(), name: "Responder", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [660, 0], parameters: { respondWith: "json", responseBody: "={{ JSON.stringify($json) }}", options: {} } },
  ], chain(["Webhook briefing", "Config", "Criar lote", "Responder"]),
  "## Briefing → lote\nRecebe POST com clientId, title, theme, objective, body, mix e mode (anthropic | claude-code | fixture).\nO VYVE devolve o lote existente se o mesmo briefing chegar duas vezes.\n\n1. Edite **Config → base_url**.\n2. Crie a credencial Header Auth: nome `Authorization`, valor `Bearer <chave criada em Configurações do painel>`."),

  "02-fila-e-publicacao": wf("VYVE · Processar fila e publicar o que venceu", [
    { id: id(), name: "A cada 15 min", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "minutes", minutesInterval: 15 }] } } },
    config(220, 0),
    http("Processar fila", "POST", "/api/v1/queue/drain", 440, 0, '={{ JSON.stringify({ maxSteps: 50 }) }}'),
    http("Publicar vencidas", "POST", "/api/v1/publish-due", 660, 0, '={{ JSON.stringify({ dryRun: true }) }}'),
  ], chain(["A cada 15 min", "Config", "Processar fila", "Publicar vencidas"]),
  "## Fila e publicação\nProcessa a fila dos agentes (dispensável se o worker `npm run worker` estiver rodando) e verifica o que está agendado.\n\n**Começa em simulação (dryRun: true).** Troque para `false` só depois de: app da Meta aprovado, token do cliente em variável de ambiente, ig_user_id cadastrado e VYVE_PUBLIC_BASE_URL público. Mesmo assim, só sai o que uma pessoa aprovou."),

  "03-metricas-e-analise": wf("VYVE · Coletar métricas e analisar a semana", [
    { id: id(), name: "Todo dia 8h", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "cronExpression", expression: "0 8 * * *" }] } } },
    config(220, 0),
    http("Coletar métricas", "POST", "/api/v1/metrics/collect", 440, 0, "={{ JSON.stringify({}) }}"),
    http("Listar clientes", "GET", "/api/v1/clients", 660, 0),
    { id: id(), name: "Um por cliente", type: "n8n-nodes-base.splitOut", typeVersion: 1, position: [880, 0], parameters: { fieldToSplitOut: "clients", options: {} } },
    http("Analisar 7 dias", "POST", "/api/v1/analyze", 1100, 0, "={{ JSON.stringify({ clientId: $json.id }) }}"),
  ], chain(["Todo dia 8h", "Config", "Coletar métricas", "Listar clientes", "Um por cliente", "Analisar 7 dias"]),
  "## Métricas e análise\nColeta métricas reais pela API do Instagram (clientes sem token: nada é coletado) e gera o relatório dos últimos 7 dias por cliente.\nSem dados, o relatório diz \"sem métricas\" e não estima números. Os aprendizados voltam para a pesquisa do próximo lote."),

  "04-avisos-de-aprovacao": wf("VYVE · Avisar o que espera aprovação", [
    { id: id(), name: "De hora em hora", type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0], parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } } },
    config(220, 0),
    http("Pendências", "GET", "/api/v1/approvals", 440, 0),
    { id: id(), name: "Tem pendência?", type: "n8n-nodes-base.if", typeVersion: 2, position: [660, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "loose" }, conditions: [{ id: id(), leftValue: "={{ $json.research.length + $json.scripts.length + $json.pieces.length }}", rightValue: 0, operator: { type: "number", operation: "gt" } }], combinator: "and" }, options: {} } },
    { id: id(), name: "Montar aviso", type: "n8n-nodes-base.set", typeVersion: 3.4, position: [880, -80], parameters: { assignments: { assignments: [
      { id: id(), name: "assunto", value: "={{ `VYVE: ${$json.research.length} pesquisa(s), ${$json.scripts.length} roteiro(s) e ${$json.pieces.length} peça(s) aguardando` }}", type: "string" },
      { id: id(), name: "texto", value: "={{ [...$json.research.map(r => `Pesquisa · ${r.client} · ${r.title} · ${r.url}`), ...$json.scripts.map(s => `Roteiro · ${s.client} · ${s.title} · ${s.url}`), ...$json.pieces.map(p => `Peça · ${p.client} · ${p.title} · ${p.url}`)].join('\\n') }}", type: "string" },
    ] }, options: {} } },
    { id: id(), name: "Enviar e-mail", type: "n8n-nodes-base.emailSend", typeVersion: 2.1, position: [1100, -80], parameters: { fromEmail: "vyve@SEU-DOMINIO", toEmail: "equipe@SEU-DOMINIO", subject: "={{ $json.assunto }}", emailFormat: "text", text: "={{ $json.texto }}", options: {} } },
  ], {
    ...chain(["De hora em hora", "Config", "Pendências", "Tem pendência?"]),
    "Tem pendência?": { main: [[{ node: "Montar aviso", type: "main", index: 0 }], []] },
    "Montar aviso": { main: [[{ node: "Enviar e-mail", type: "main", index: 0 }]] },
  },
  "## Avisos de aprovação\nLista pesquisas, roteiros e peças esperando decisão e manda um resumo por e-mail com os links do painel.\nA chave de API **não aprova nada**: aprovar é sempre uma pessoa no painel.\nTroque o nó de e-mail por Slack/WhatsApp se preferir. Defina VYVE_PANEL_URL no servidor para os links saírem completos."),
};

fs.mkdirSync(dir, { recursive: true });
for (const [file, w] of Object.entries(workflows)) fs.writeFileSync(path.join(dir, `${file}.json`), JSON.stringify(w, null, 2) + "\n");
console.log(`${Object.keys(workflows).length} workflows em ${dir}`);
