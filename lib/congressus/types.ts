import { z } from "zod";
export const oauthTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_at: z.string().optional(),
  user_id: z.union([z.string(), z.number()]).transform(String).optional(),
  name: z.string().optional()
}).passthrough();

export const userInfoSchema = z.object({
  user_id: z.union([z.string(), z.number()]).transform(String),
  is_active: z.boolean(),
  username: z.string().nullish(),
  name: z.string(),
  picture: z.url().nullish(),
  member_status: z.string().nullish(),
  groups: z.record(z.string(), z.object({ active: z.boolean() }).passthrough()).nullish()
}).passthrough();
export type UserInfo = z.infer<typeof userInfoSchema>;

// GET /v30/members: `username` is an exploded arrayfilter. Congressus geeft
// MemberWithoutRelations terug; first_name is volgens OpenAPI nullable.
export const memberSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  first_name: z.string().nullable().optional()
}).passthrough();

export const memberPageSchema = z.object({
  has_prev: z.boolean(),
  prev_num: z.number().int().nullable(),
  has_next: z.boolean(),
  next_num: z.number().int().nullable(),
  data: z.array(memberSchema),
  total: z.number().int().nonnegative()
}).passthrough();
export const eventSchema = z.object({ id: z.number(), name: z.string(), start: z.iso.datetime(), end: z.iso.datetime(), location: z.string().nullable().optional(), participation_mode: z.enum(["none","single","ticketing"]).default("single"), num_tickets_sold: z.number().nullable().optional() });
export const ticketSchema = z.object({ id: z.number(), name: z.string().nullable().optional(), email: z.string().nullable().optional(), status_presence: z.enum(["unknown","present","not present"]), ticket_type_id: z.number() });
export const participationSchema = z.object({ id: z.number(), event_id: z.number(), member_id: z.number().nullable().optional(), addressee: z.string(), status: z.string(), num_tickets_sold: z.number(), tickets: z.array(ticketSchema).default([]), member: z.object({ id: z.number(), username: z.string().optional(), first_name: z.string().optional(), insertion: z.string().nullable().optional(), last_name: z.string().optional() }).passthrough().optional() });
export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item), has_next: z.boolean().optional(), next_num: z.number().nullable().optional(), total: z.number() });
export type CongressusEvent = z.infer<typeof eventSchema>;
export type Participation = z.infer<typeof participationSchema>;
