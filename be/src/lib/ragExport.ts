/** rag-train-7: one approved example as a training record. */
export interface TrainingRecord {
  question: string;
  chunks: string[];
  reply: string | null;
  idealReply: string | null;
  label: string | null;
}

/**
 * Builds the record field by field, so nothing about the visitor (user id, visitor hash, email, name) or the
 * reviewer can reach the file, whatever the caller's query happens to include.
 */
export function toTrainingRecord(example: {
  label: string | null;
  idealReply: string | null;
  turn: { userText: string; botText: string | null; retrievals: { rank: number; chunk: { text: string } }[] };
}): TrainingRecord {
  return {
    question: example.turn.userText,
    chunks: [...example.turn.retrievals].sort((a, b) => a.rank - b.rank).map((r) => r.chunk.text),
    reply: example.turn.botText,
    idealReply: example.idealReply,
    label: example.label,
  };
}

/** JSON Lines: one record per line, newline-terminated; empty string for no records. */
export const toJsonl = (records: TrainingRecord[]) => records.map((r) => `${JSON.stringify(r)}\n`).join('');
