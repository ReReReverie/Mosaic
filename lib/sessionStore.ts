import { neon } from "@neondatabase/serverless";
import type { AnalysisResult } from "@/core/types";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

/** Persist metadata only; source files remain in the active browser session. */
export async function saveAnalysisSession(result: AnalysisResult): Promise<void> {
  if (!sql) return;

  try {
    await sql`
      INSERT INTO creative_reference_sessions (session_id, brief, result)
      VALUES (${result.sessionId}, ${result.brief}, ${JSON.stringify(result)}::jsonb)
      ON CONFLICT (session_id) DO UPDATE SET
        brief = EXCLUDED.brief,
        result = EXCLUDED.result
    `;
  } catch {
    // Persistence is intentionally best-effort so a database outage does not
    // discard an otherwise successful analysis.
  }
}

export async function getAnalysisSession(
  sessionId: string
): Promise<AnalysisResult | null> {
  if (!sql) return null;

  try {
    const rows = await sql`
      SELECT result
      FROM creative_reference_sessions
      WHERE session_id = ${sessionId}
      LIMIT 1
    `;
    const row = rows[0] as { result?: AnalysisResult } | undefined;
    return row?.result ?? null;
  } catch {
    return null;
  }
}
