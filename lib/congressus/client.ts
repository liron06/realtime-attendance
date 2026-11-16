import { env } from "@/lib/env";
import { eventSchema, pageSchema, participationSchema, userInfoSchema } from "./types";
import { z } from "zod";

export type CongressusErrorCode =
  | "CONGRESSUS_NOT_CONFIGURED"
  | "CONGRESSUS_UNAUTHORIZED"
  | "CONGRESSUS_FORBIDDEN"
  | "CONGRESSUS_NOT_FOUND"
  | "CONGRESSUS_RATE_LIMITED"
  | "CONGRESSUS_SERVER_ERROR"
  | "CONGRESSUS_HTTP_ERROR"
  | "CONGRESSUS_TIMEOUT"
  | "CONGRESSUS_NETWORK_ERROR"
  | "CONGRESSUS_INVALID_JSON"
  | "CONGRESSUS_SCHEMA_ERROR"
  | "CONGRESSUS_PAGINATION_ERROR";

export type SafeSchemaIssue = { path: string; code: string };

export class CongressusError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: number,
    public code: CongressusErrorCode = "CONGRESSUS_HTTP_ERROR",
    public schemaIssues: readonly SafeSchemaIssue[] = []
  ) {
    super(message);
    this.name = "CongressusError";
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number; maxAttempts?: number };
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function httpError(response: Response) {
  const retryAfter = retryAfterSeconds(response);
  if (response.status === 401) return new CongressusError(401, "Congressus-authenticatie is geweigerd.", retryAfter, "CONGRESSUS_UNAUTHORIZED");
  if (response.status === 403) return new CongressusError(403, "De API-key heeft onvoldoende rechten.", retryAfter, "CONGRESSUS_FORBIDDEN");
  if (response.status === 404) return new CongressusError(404, "De Congressus-resource is niet toegankelijk.", retryAfter, "CONGRESSUS_NOT_FOUND");
  if (response.status === 429) return new CongressusError(429, "Congressus-limiet bereikt.", retryAfter, "CONGRESSUS_RATE_LIMITED");
  if (response.status >= 500) return new CongressusError(response.status, "Congressus is tijdelijk niet beschikbaar.", retryAfter, "CONGRESSUS_SERVER_ERROR");
  return new CongressusError(response.status, "Congressus-verzoek mislukt.", retryAfter, "CONGRESSUS_HTTP_ERROR");
}

function safeSchemaIssues(error: z.ZodError): SafeSchemaIssue[] {
  return error.issues.map(issue => ({ path: issue.path.map(String).join("."), code: issue.code }));
}

function isTimeout(error: unknown) {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const apiKey = env().CONGRESSUS_API_KEY;
  if (!apiKey) throw new CongressusError(503, "Congressus is niet geconfigureerd.", undefined, "CONGRESSUS_NOT_CONFIGURED");
  const { timeoutMs = 15_000, maxAttempts = 3, ...init } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${env().CONGRESSUS_API_BASE_URL}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}`, ...init.headers },
        cache: "no-store"
      });
    } catch (error) {
      const timeout = isTimeout(error);
      if (attempt < maxAttempts) {
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      throw new CongressusError(timeout ? 504 : 502, timeout ? "Congressus-verzoek duurde te lang." : "Congressus is niet bereikbaar.", undefined, timeout ? "CONGRESSUS_TIMEOUT" : "CONGRESSUS_NETWORK_ERROR");
    }

    if (!response.ok) {
      const error = httpError(response);
      const retryable = response.status === 429 || response.status >= 500;
      const waitSeconds = error.retryAfter ?? 0;
      if (retryable && attempt < maxAttempts && waitSeconds <= 5) {
        await sleep(waitSeconds > 0 ? waitSeconds * 1000 : 250 * 2 ** (attempt - 1));
        continue;
      }
      throw error;
    }
    if (response.status === 204) return undefined as T;

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CongressusError(502, "Congressus gaf geen geldige JSON terug.", undefined, "CONGRESSUS_INVALID_JSON");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new CongressusError(502, "Het Congressus-responsecontract wijkt af.", undefined, "CONGRESSUS_SCHEMA_ERROR", safeSchemaIssues(parsed.error));
    return parsed.data;
  }
  throw new CongressusError(502, "Congressus-verzoek mislukt.", undefined, "CONGRESSUS_NETWORK_ERROR");
}

export async function allPages<T>(path: string, schema: z.ZodType<T>) {
  const values: T[] = [];
  let page = 1;
  const visited = new Set<number>();
  for (let requestCount = 0; requestCount < 100; requestCount++) {
    if (visited.has(page)) throw new CongressusError(502, "Congressus-paginering bevat een cyclus.", undefined, "CONGRESSUS_PAGINATION_ERROR");
    visited.add(page);
    const join = path.includes("?") ? "&" : "?";
    const result = await request(`${path}${join}page=${page}&page_size=100`, pageSchema(schema));
    values.push(...result.data);
    if (!result.has_next) return values;
    if (result.next_num === null || result.next_num < 1) throw new CongressusError(502, "Congressus-paginering mist een volgende pagina.", undefined, "CONGRESSUS_PAGINATION_ERROR");
    page = result.next_num;
  }
  throw new CongressusError(502, "Congressus-paginering overschrijdt de veiligheidslimiet.", undefined, "CONGRESSUS_PAGINATION_ERROR");
}

export function eventPeriod(now = new Date()) {
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 90);
  const until = new Date(now);
  until.setUTCFullYear(until.getUTCFullYear() + 1);
  const compact = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
  return `${compact(from)}..${compact(until)}`;
}

export const listEvents = (now = new Date()) => allPages(`/events?order=start:desc&period_filter=${eventPeriod(now)}`, eventSchema);
export const listParticipations = (eventId: number) => allPages(`/events/${eventId}/participations`, participationSchema);
export const setPresence = (eventId: number, participationId: number, ticketId?: number, status = "present") => request(ticketId ? `/events/${eventId}/participations/${participationId}/tickets/${ticketId}/set-presence` : `/events/${eventId}/participations/${participationId}/set-presence`, zVoid, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_presence: status }) });
const zVoid = { parse: (value: unknown) => value, safeParse: (value: unknown) => ({ success: true, data: value }) } as z.ZodType<void>;

export async function fetchUserInfo(accessToken: string) {
  const response = await fetch(`${env().CONGRESSUS_BASE_URL}/oauth/userinfo`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) throw new CongressusError(response.status, "Lidmaatschapsgegevens konden niet worden opgehaald.");
  return userInfoSchema.parse(await response.json());
}
