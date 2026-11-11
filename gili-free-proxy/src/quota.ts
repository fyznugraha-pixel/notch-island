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

export async function incrementUsage(db: D1Database, subjects: string[], day: string): Promise<void> {
  const upsert = db.prepare(
    `INSERT INTO usage (subject, day, count) VALUES (?, ?, 1)
     ON CONFLICT (subject, day) DO UPDATE SET count = count + 1`
  );
  await db.batch(subjects.map((subject) => upsert.bind(subject, day)));
}

export async function pruneOldUsage(db: D1Database, keepFromDay: string): Promise<void> {
  await db.prepare("DELETE FROM usage WHERE day < ?").bind(keepFromDay).run();
}

