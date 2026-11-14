const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function currentQuotaDay(now = Date.now()): string {
  return new Date(now + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

export async function readUsage(db: D1Database, subject: string, day: string): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM usage WHERE subject = ? AND day = ?")
    .bind(subject, day)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export interface QuotaCheckTarget {
  subject: string;
  limit: number;
}

export async function incrementUsage(db: D1Database, subjects: string[], day: string): Promise<void> {
  const upsert = db.prepare(
    `INSERT INTO usage (subject, day, count) VALUES (?, ?, 1)
     ON CONFLICT (subject, day) DO UPDATE SET count = count + 1`
  );
  await db.batch(subjects.map((subject) => upsert.bind(subject, day)));
}

export async function decrementUsage(db: D1Database, subjects: string[], day: string): Promise<void> {
  if (subjects.length === 0) return;
  const dec = db.prepare(
    `UPDATE usage SET count = MAX(0, count - 1) WHERE subject = ? AND day = ?`
  );
  await db.batch(subjects.map((subject) => dec.bind(subject, day)));
}

export async function tryConsumeQuota(
  db: D1Database,
  targets: QuotaCheckTarget[],
  day: string
): Promise<boolean> {
  if (targets.some((t) => !Number.isFinite(t.limit) || t.limit <= 0)) {
    return false;
  }
  const reserve = db.prepare(
    `INSERT INTO usage (subject, day, count) VALUES (?, ?, 1)
     ON CONFLICT (subject, day) DO UPDATE SET count = count + 1 WHERE usage.count < ?`
  );
  const results = await db.batch(targets.map((t) => reserve.bind(t.subject, day, t.limit)));
  const consumed = targets
    .filter((_, idx) => (results[idx]?.meta?.changes ?? 0) > 0)
    .map((t) => t.subject);

  if (consumed.length !== targets.length) {
    if (consumed.length > 0) {
      await decrementUsage(db, consumed, day);
    }
    return false;
  }
  return true;
}

export async function pruneOldUsage(db: D1Database, keepFromDay: string): Promise<void> {
  await db.prepare("DELETE FROM usage WHERE day < ?").bind(keepFromDay).run();
}

