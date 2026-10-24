import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, can, type Session, type Permission } from "@vyve/engine";

export const SESSION_COOKIE = "vyve_session";

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return readSession(store.get(SESSION_COOKIE)?.value);
}

/** Exige sessão válida; sem ela, volta para o login. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function requirePermission(perm: Permission): Promise<Session> {
  const s = await requireSession();
  if (!can(s.role, perm)) throw new Error(`Seu papel (${s.role}) não permite: ${perm}`);
  return s;
}

export const ctxOf = (s: Session) => ({ teamId: s.teamId, userId: s.userId, role: s.role });
