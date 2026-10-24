import { listClients } from "@vyve/engine";
import { withApiKey } from "@/lib/api";

export async function GET(req: Request) {
  return withApiKey(req, async (ctx) => ({ clients: (await listClients(ctx)).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })) }));
}
