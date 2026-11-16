import { db } from "@/lib/db";
export async function rateLimit(key: string, limit: number, seconds: number) {
  const now = new Date(); const expiresAt = new Date(now.getTime() + seconds * 1000);
  return db.$transaction(async tx => {
    const current = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!current || current.expiresAt <= now) {
      await tx.rateLimitBucket.upsert({ where: { key }, create: { key, count: 1, windowStart: now, expiresAt }, update: { count: 1, windowStart: now, expiresAt } });
      return { allowed: true, remaining: limit - 1 };
    }
    if (current.count >= limit) return { allowed: false, remaining: 0, retryAfter: Math.ceil((current.expiresAt.getTime()-now.getTime())/1000) };
    await tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return { allowed: true, remaining: limit - current.count - 1 };
  });
}
