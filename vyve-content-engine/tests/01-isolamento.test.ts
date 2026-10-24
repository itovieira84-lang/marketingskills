import { test, after } from "node:test";
import assert from "node:assert/strict";
import { newTeam } from "./helpers";
import { closePool, createClient, createUser, getClient, listClients, createApiKey, ctxFromApiKey, login, ForbiddenError, withCtx, many } from "../packages/engine/src/index";

after(() => closePool());

test("equipes não enxergam dados umas das outras (RLS)", async () => {
  const a = await newTeam("A"), b = await newTeam("B");
  const ca = await createClient(a, { name: "Cliente da A" });
  assert.equal((await listClients(b)).length, 0);
  assert.equal(await getClient(b, ca.id), null);
  const rows = await withCtx(b, (tx) => many(tx, "select * from vyve.brands"));
  assert.equal(rows.length, 0, "marca da equipe A não aparece para a B");
});

test("papel Cliente só vê o próprio cliente", async () => {
  const a = await newTeam("A");
  const c1 = await createClient(a, { name: "Cliente 1" });
  await createClient(a, { name: "Cliente 2" });
  const u = await createUser(a, { email: `cli-${c1.id.slice(0, 6)}@teste.local`, name: "Cliente", password: "senha-cliente-123", role: "client", clientIds: [c1.id] });
  const ctx = { teamId: a.teamId, userId: u.id, role: "client" as const };
  const seen = await listClients(ctx);
  assert.deepEqual(seen.map((c: any) => c.name), ["Cliente 1"]);
});

test("permissões por papel: criador não cadastra cliente", async () => {
  const a = await newTeam("A");
  const u = await createUser(a, { email: `criador-${a.teamId.slice(0, 6)}@teste.local`, name: "Criador", password: "senha-criador-123", role: "creator" });
  await assert.rejects(createClient({ teamId: a.teamId, userId: u.id, role: "creator" }, { name: "X" }), ForbiddenError);
});

test("login com senha e chave de API com papel sistema", async () => {
  const a = await newTeam("A");
  assert.ok(await login(a.email, "senha-de-teste-123"));
  assert.equal(await login(a.email, "errada"), null);
  const token = await createApiKey(a, "n8n");
  const ctx = await ctxFromApiKey(token);
  assert.equal(ctx?.teamId, a.teamId);
  assert.equal(ctx?.role, "system");
  assert.equal(await ctxFromApiKey("vyve_invalida"), null);
});
