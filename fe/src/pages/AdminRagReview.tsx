import { useEffect, useState } from 'react';
import { api, toApiError } from '../api';
import { useToast } from '../toast';

type Label = 'good' | 'bad' | 'needs_fix';

export interface ReviewTurn {
  id: number;
  createdAt: string;
  user: string | null;
  question: string;
  reply: string | null;
  outcome: string;
  guardTriggered: string | null;
  feedback: 'up' | 'down' | null;
  chunks: { rank: number; score: number; cited: boolean; title: string; text: string }[];
}

const LABELS: { value: Label; text: string }[] = [
  { value: 'good', text: 'Good' },
  { value: 'bad', text: 'Bad' },
  { value: 'needs_fix', text: 'Needs fix' },
];

/** rag-train-6: staff with rag.review label saved bot turns and approve or reject them as training examples. */
export function AdminRagReviewPage() {
  const toast = useToast();
  const [turns, setTurns] = useState<ReviewTurn[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ turns: ReviewTurn[] }>('/rag/review')
      .then((d) => setTurns(d.turns))
      .catch((e) => setError(toApiError(e).message));
  }, []);

  const done = (id: number, message: string) => {
    setTurns((all) => all?.filter((t) => t.id !== id) ?? null);
    toast(message, 'success');
  };

  return (
    <div data-testid="rag-review-page">
      <h1>Bot review</h1>
      <p className="text-muted">Saved chat bot answers waiting for review. Approved ones can be exported as training examples.</p>
      {/* rag-train-7: a plain link, so the browser saves the JSONL file with the session cookie */}
      <p>
        <a className="btn btn-secondary" href="/api/rag/examples/export" download data-testid="rag-export">
          Download approved examples (JSONL)
        </a>
      </p>
      {error && (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      )}
      {turns === null && !error && <p className="text-muted">Loading...</p>}
      {turns?.length === 0 && <p className="text-muted" data-testid="rag-review-empty">Nothing waiting for review.</p>}
      {turns?.map((t) => <ReviewCard key={t.id} turn={t} onDone={done} />)}
    </div>
  );
}

function ReviewCard({ turn, onDone }: { turn: ReviewTurn; onDone: (id: number, message: string) => void }) {
  const [label, setLabel] = useState<Label | ''>('');
  const [idealReply, setIdealReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (decision: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      await api(`/rag/review/${turn.id}`, {
        body: { decision, ...(label ? { label } : {}), ...(idealReply.trim() ? { idealReply: idealReply.trim() } : {}) },
      });
      onDone(turn.id, decision === 'approve' ? 'Approved' : 'Rejected');
    } catch (e) {
      setError(toApiError(e).message);
      setBusy(false);
    }
  };

  const id = `review-${turn.id}`;
  return (
    <article className="card p-4 mb-4 rag-review-card" data-testid="rag-review-item" aria-labelledby={`${id}-q`}>
      <p className="text-sm text-muted">
        {new Date(turn.createdAt).toLocaleString()} · {turn.user ?? 'Guest'} · {turn.outcome}
        {turn.guardTriggered ? ` (${turn.guardTriggered})` : ''}
        {turn.feedback ? ` · visitor said ${turn.feedback === 'up' ? 'helpful' : 'not helpful'}` : ''}
      </p>
      <h2 id={`${id}-q`} className="rag-review-q">
        {turn.question}
      </h2>
      <p className="rag-review-reply">{turn.reply ?? <em>No reply</em>}</p>
      {turn.chunks.length > 0 && (
        <details>
          <summary>{turn.chunks.length} excerpts used</summary>
          <ol>
            {turn.chunks.map((c) => (
              <li key={c.rank}>
                <strong>{c.title}</strong> ({c.score.toFixed(2)}
                {c.cited ? ', cited' : ''}): {c.text}
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="form-group mb-3">
        <label className="label" htmlFor={`${id}-label`}>
          Label
        </label>
        <select id={`${id}-label`} className="input" value={label} onChange={(e) => setLabel(e.target.value as Label | '')}>
          <option value="">Choose...</option>
          {LABELS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.text}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group mb-3">
        <label className="label" htmlFor={`${id}-ideal`}>
          Better reply {label === 'needs_fix' ? '(required)' : '(optional)'}
        </label>
        <textarea id={`${id}-ideal`} className="input" rows={3} maxLength={4000} value={idealReply} onChange={(e) => setIdealReply(e.target.value)} />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy || !label} onClick={() => void decide('approve')}>
          Approve
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void decide('reject')}>
          Reject
        </button>
      </div>
    </article>
  );
}
