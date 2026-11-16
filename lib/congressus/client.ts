import { env } from "@/lib/env";
import { eventSchema, pageSchema, participationSchema, userInfoSchema } from "./types";
import type { z } from "zod";

export class CongressusError extends Error { constructor(public status: number, message: string, public retryAfter?: number) { super(message); } }

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const apiKey = env().CONGRESSUS_API_KEY;
  if (!apiKey) throw new CongressusError(503, "Congressus is niet geconfigureerd.");
  const response = await fetch(`${env().CONGRESSUS_API_BASE_URL}${path}`, { ...init, signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, ...init?.headers }, cache: "no-store" });
  if (!response.ok) throw new CongressusError(response.status, response.status === 429 ? "Congressus-limiet bereikt." : "Congressus-verzoek mislukt.", Number(response.headers.get("retry-after") ?? 0) || undefined);
  if (response.status === 204) return undefined as T;
  return schema.parse(await response.json());
}
export async function allPages<T>(path: string, schema: z.ZodType<T>) {
  const values: T[] = [];
  for (let page=1; page<=100; page++) {
    const join = path.includes("?") ? "&" : "?";
    const result = await request(`${path}${join}page=${page}&page_size=100`, pageSchema(schema));
    values.push(...result.data);
    if (!result.has_next && !result.next_num) break;
  }
  return values;
}
export const listEvents = () => allPages("/events?order=start:desc", eventSchema);
export const listParticipations = (eventId: number) => allPages(`/events/${eventId}/participations`, participationSchema);
export const setPresence = (eventId: number, participationId: number, ticketId?: number, status="present") => request(ticketId ? `/events/${eventId}/participations/${participationId}/tickets/${ticketId}/set-presence` : `/events/${eventId}/participations/${participationId}/set-presence`, zVoid, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_presence: status }) });
const zVoid = { parse: (v: unknown) => v } as z.ZodType<void>;
export async function fetchUserInfo(accessToken: string) {
  const response = await fetch(`${env().CONGRESSUS_BASE_URL}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new CongressusError(response.status, "Lidmaatschapsgegevens konden niet worden opgehaald.");
  return userInfoSchema.parse(await response.json());
}
