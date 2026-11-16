import { z } from "zod";

export const oauthTokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_at: z.string().optional(),
  user_id: z.union([z.string(), z.number()]).transform(String).optional(),
  name: z.string().optional()
}).passthrough();

export const userInfoSchema = z.object({
  user_id: z.union([z.string().min(1), z.number().int()]).transform(String),
  is_active: z.boolean(),
  username: z.string().nullish(),
  name: z.string().min(1),
  picture: z.union([z.literal(""), z.url()]).nullish().transform(value => value || undefined),
  member_status: z.string().nullish(),
  groups: z.record(z.string(), z.object({ active: z.boolean() }).passthrough()).nullish()
}).passthrough();
export type UserInfo = z.infer<typeof userInfoSchema>;

export const memberSchema = z.object({ id: z.number().int(), username: z.string(), first_name: z.string().nullable().optional() }).passthrough();
export const memberPageSchema = z.object({
  has_prev: z.boolean(), prev_num: z.number().int().nullable(), has_next: z.boolean(), next_num: z.number().int().nullable(), data: z.array(memberSchema), total: z.number().int().nonnegative()
}).passthrough();

// Responses use UTC without an offset; offset-bearing ISO values also occur.
export const congressusDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/).refine(value => {
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return !Number.isNaN(Date.parse(normalized));
}, "Invalid Congressus date-time");

export const eventSchema = z.object({
  id: z.number().int().nonnegative(), name: z.string(), start: congressusDateTimeSchema, end: congressusDateTimeSchema,
  location: z.string().nullable().optional(), participation_mode: z.enum(["none", "single", "ticketing"]).nullable(),
  num_tickets_sold: z.number().int().nonnegative().nullable().optional()
}).passthrough();

export const ticketSchema = z.object({
  id: z.number().int().nonnegative().optional(), name: z.string().nullable().optional(), email: z.string().nullable().optional(),
  status_presence: z.enum(["unknown", "present", "not present"]).optional(), ticket_type_id: z.number().int().nonnegative()
}).passthrough();

export const participationSchema = z.object({
  id: z.number().int().nonnegative(), event_id: z.number().int().nonnegative(), member_id: z.number().int().nonnegative().nullish(),
  addressee: z.string(), status: z.string(), num_tickets_sold: z.number().int().nonnegative().optional(), tickets: z.array(ticketSchema).default([]),
  member: z.object({ id: z.number().int(), username: z.string().optional(), first_name: z.string().nullish(), insertion: z.string().nullish(), last_name: z.string().nullish() }).passthrough().nullish()
}).passthrough();

export const pageSchema = <T extends z.ZodType>(item: T) => z.object({
  has_prev: z.boolean(), prev_num: z.number().int().nullable(), has_next: z.boolean(), next_num: z.number().int().nullable(), data: z.array(item), total: z.number().int().nonnegative()
}).passthrough();

export type CongressusEvent = z.infer<typeof eventSchema>;
export type Participation = z.infer<typeof participationSchema>;
