import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { Card, ConfirmDialog, Pill, SegmentedTabs } from '../components/ui';
import { openAuthedStream } from '../store/authedStream';
import {
  REASON_LABEL,
  addThreadMessage,
  applyStaffEvent,
  emptyPanel,
  listsLoaded,
  select,
  threadLoaded,
  type ChatSummary,
  type PanelState,
  type StaffChatEvent,
} from '../staffChat';
import type { ServerMessage } from '../supportChat';
import { useToast } from '../toast';

type Tab = 'waiting' | 'mine';
interface Conversation extends ChatSummary {
  messages: ServerMessage[];
}

const SENDER_LABEL = { customer: 'Customer', bot: 'Bot', staff: 'Staff' } as const;

/**
 * sch-1.8 (SRS: chat panel for staff, many customers at once, Req-1 real time). Left: the waiting queue and the
 * staff member's own conversations, live, with unread counts. Right: the selected thread; claim, reply, close.
 * Drafts are kept per conversation, so switching threads loses nothing.
 */
export function StaffChatsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const me = user?.id ?? -1;
  const [state, setState] = useState<PanelState>(emptyPanel);
  const [tab, setTab] = useState<Tab>('waiting');
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [detail, setDetail] = useState<Conversation | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const selected = state.selected;

  const loadLists = useCallback(async () => {
    const [waiting, mine] = await Promise.all([
      api<{ conversations: ChatSummary[] }>('/staff/chats?status=waiting'),
      api<{ conversations: ChatSummary[] }>('/staff/chats?status=mine'),
    ]);
    setState((s) => listsLoaded(s, waiting.conversations, mine.conversations));
  }, []);

  const loadThread = useCallback(async (id: number) => {
    try {
      const { conversation } = await api<{ conversation: Conversation }>(`/staff/chats/${id}`);
      setDetail(conversation);
      setState((s) => threadLoaded(s, id, conversation.messages, conversation.status));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open the conversation', 'error');
      setDetail(null);
      setState((s) => select(s, null));
    }
  }, [toast]);

  useEffect(() => {
    void loadLists().catch(() => undefined);
  }, [loadLists]);

  // Live: the queue (staff stream) and this staff member's own conversations (their user stream).
  useEffect(() => {
    if (typeof EventSource === 'undefined' || me < 0) return;
    const onEvent = (e: Event) => {
      const event = { type: e.type, data: JSON.parse((e as MessageEvent<string>).data) } as StaffChatEvent;
      setState((s) => applyStaffEvent(s, event, me));
    };
    const attach = (types: string[]) => (source: EventSource) => {
      let dropped = false;
      for (const type of types) source.addEventListener(type, onEvent);
      source.onerror = () => {
        dropped = true;
      };
      source.onopen = () => {
        if (!dropped) return;
        dropped = false; // events sent while away are not replayed
        void loadLists().catch(() => undefined);
      };
    };
    const closeQueue = openAuthedStream('/api/staff/events', attach(['chat-waiting', 'chat-claimed', 'chat-message', 'chat-closed']));
    const closeOwn = openAuthedStream('/api/me/events', attach(['chat-message']));
    return () => {
      closeQueue();
      closeOwn();
    };
  }, [me, loadLists]);

  useEffect(() => {
    if (selected != null) void loadThread(selected);
  }, [selected, loadThread]);

  const thread = selected != null ? state.threads[selected] : undefined;
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [thread?.messages.length, selected]);

  const open = (id: number) => setState((s) => select(s, id));

  const claim = async (id: number) => {
    setBusy(true);
    try {
      const { conversation } = await api<{ conversation: Conversation }>(`/staff/chats/${id}/claim`, { method: 'POST' });
      setDetail(conversation);
      setTab('mine');
      await loadLists();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not claim the conversation', 'error');
      await loadLists().catch(() => undefined);
      if (selected === id) setState((s) => select(s, null));
    } finally {
      setBusy(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (selected == null) return;
    const text = (drafts[selected] ?? '').trim();
    if (!text) return;
    setBusy(true);
    try {
      const { message } = await api<{ message: ServerMessage }>(`/staff/chats/${selected}/messages`, { method: 'POST', body: { text } });
      setState((s) => addThreadMessage(s, selected, message));
      setDrafts((d) => ({ ...d, [selected]: '' }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Message not sent', 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    if (selected == null) return;
    setBusy(true);
    try {
      await api(`/staff/chats/${selected}/close`, { method: 'POST' });
      toast('Chat closed', 'success');
      setClosing(false);
      await loadThread(selected);
      await loadLists();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not close the chat', 'error');
    } finally {
      setBusy(false);
    }
  };

  const list = tab === 'waiting' ? state.waiting : state.mine;
  const summary = [...state.waiting, ...state.mine].find((c) => c.id === selected);
  const status = thread?.closed ? 'closed' : (summary?.status ?? detail?.status);
  const assignedToMe = (summary?.assignedStaff ?? detail?.assignedStaff)?.id === me;
  const customerName = summary?.customer.username ?? detail?.customer.username;

  return (
    <div className="staff-chats" data-testid="staff-chats">
      <h1>Customer chats</h1>
      <div className="staff-chats-grid">
        <Card className="staff-chats-list">
          <SegmentedTabs<Tab>
            label="Conversations"
            value={tab}
            onChange={setTab}
            testId="chat-tabs"
            tabs={[
              { value: 'waiting', label: 'Waiting', count: state.waiting.length },
              { value: 'mine', label: 'Mine', count: state.mine.length },
            ]}
          />
          {list.length === 0 ? (
            <p className="muted">{tab === 'waiting' ? 'No customer is waiting.' : 'You have no open chats.'}</p>
          ) : (
            <ul className="chat-list" data-testid={`chat-list-${tab}`}>
              {list.map((c) => {
                const unread = state.unread[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <button type="button" className={`chat-list-item ${c.id === selected ? 'is-active' : ''}`} aria-current={c.id === selected} onClick={() => open(c.id)} data-testid={`chat-item-${c.id}`}>
                      <span className="chat-list-top">
                        <strong>{c.customer.username}</strong>
                        {unread > 0 && (
                          <Pill tone="dark-red" testId={`chat-unread-${c.id}`}>
                            {unread} new
                          </Pill>
                        )}
                      </span>
                      <span className="chat-list-preview">{c.lastMessage?.text ?? ''}</span>
                      <span className="chat-list-reason">{REASON_LABEL[c.handoffReason] ?? c.handoffReason}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="staff-chats-thread" testId="chat-thread">
          {selected == null || !thread ? (
            <p className="muted">Choose a conversation on the left.</p>
          ) : (
            <>
              <header className="chat-thread-head">
                <h2 className="ui-card-title">{customerName}</h2>
                <Pill tone={status === 'waiting' ? 'cream' : status === 'closed' ? 'muted' : 'navy'} testId="chat-status">
                  {status === 'waiting' ? 'Waiting' : status === 'closed' ? 'Closed' : assignedToMe ? 'With you' : 'With another staff member'}
                </Pill>
              </header>
              <div className="chat-thread-log" role="log" aria-live="polite" ref={log} data-testid="chat-thread-log">
                {thread.messages.map((m) => (
                  <p key={m.id} className={`chat-msg chat-msg-${m.sender === 'customer' ? 'model' : m.sender === 'bot' ? 'system' : 'user'}`}>
                    <span className="sr-only">{SENDER_LABEL[m.sender]}: </span>
                    {m.text}
                  </p>
                ))}
              </div>
              {status === 'waiting' && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => claim(selected)} data-testid="chat-claim">
                  Claim this chat
                </button>
              )}
              {status !== 'closed' && status !== 'waiting' && assignedToMe && (
                <>
                  <form className="chat-form" onSubmit={send}>
                    <input
                      aria-label={`Reply to ${customerName}`}
                      placeholder="Type a reply"
                      maxLength={1000}
                      value={drafts[selected] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [selected]: e.target.value }))}
                      disabled={busy}
                      data-testid="chat-reply"
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy || !(drafts[selected] ?? '').trim()}>
                      Send
                    </button>
                  </form>
                  <button type="button" className="btn" disabled={busy} onClick={() => setClosing(true)} data-testid="chat-close">
                    Close chat
                  </button>
                </>
              )}
              {status === 'closed' && <p className="muted">This chat has ended.</p>}
            </>
          )}
        </Card>
      </div>
      {closing && (
        <ConfirmDialog title="Close this chat?" confirmLabel="Close chat" busy={busy} onConfirm={close} onCancel={() => setClosing(false)} testId="chat-close-confirm">
          {customerName} goes back to the assistant and can no longer write here.
        </ConfirmDialog>
      )}
    </div>
  );
}
