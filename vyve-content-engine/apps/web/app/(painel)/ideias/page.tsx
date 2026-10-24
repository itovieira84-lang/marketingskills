import { listIdeas } from "@vyve/engine";
import { requireSession, ctxOf } from "@/lib/session";
import { FORMAT_LABEL, dt } from "@/lib/format";
import { Card, Empty, PageHeader, Table, Td } from "@/components/ui";

export const metadata = { title: "Banco de ideias" };
const SCORE: Record<string, string> = { authority: "Autoridade", engagement: "Engajamento", shareability: "Compartilhamento", conversion: "Conversão" };

export default async function Ideias() {
  const s = await requireSession();
  const ideas = await listIdeas(ctxOf(s));
  return (
    <>
      <PageHeader title="Banco de ideias" sub="Cada roteiro nasce de uma ideia com abordagem própria. As notas (1 a 5) são estimativas qualitativas do agente, não previsões de resultado." />
      <Card>
        {ideas.length ? (
          <Table head={["Ideia", "Formato", "Funil", "Potencial estimado", "Cliente", "Data"]}>
            {ideas.map((i: any) => (
              <tr key={i.id}>
                <Td><span className="font-medium">{i.title}</span><span className="block text-xs text-muted">{i.angle}</span></Td>
                <Td>{FORMAT_LABEL[i.format]}</Td>
                <Td className="capitalize">{i.funnel_stage}</Td>
                <Td className="text-xs text-muted">{Object.entries(i.scores ?? {}).filter(([k]) => SCORE[k]).map(([k, v]) => `${SCORE[k]} ${v}`).join(" · ")}</Td>
                <Td>{i.client_name}</Td>
                <Td className="whitespace-nowrap text-muted">{dt(i.created_at)}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>As ideias aparecem quando o agente de roteiros termina um lote.</Empty>}
      </Card>
    </>
  );
}
