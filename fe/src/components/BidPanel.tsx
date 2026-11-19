import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, api, money, type Auction, type Bid, type BidEvent } from '../api';
import { useAuth } from '../auth';
import { useAppDispatch } from '../store';
import { bidReceived } from '../store/auctionSlice';
import { bidPlaced } from '../store/creditSlice';
import { useCredit } from '../store/useCredit';
import { QUICK_STEPS, bidAmount, changeSinceStart, formatTyping, precheck, quickAmounts } from '../bidMath';
import { useToast } from '../toast';
import { marksCrossed, splitCountdown } from '../brand';
import { Countdown, useNow } from './AuctionBits';
import { Badge, Burst, initials } from './ui';
import { chartLabel, priceChart } from '../priceChart';
import { relativeTime } from '../relativeTime';

export type { Bid };

/**
 * ui-1b.2: the lot page bid panel from the 1b mockup. The header (time pill, bid count, highest bid and its
 * change since the start) shows in every state; the form only while the auction is live.
 */
export function BidPanel({ auction, bids, onReload }: { auction: Auction; bids: Bid[]; onReload: () => void }) {
  const change = changeSinceStart(auction.currentPrice, auction.initialPrice);
  return (
    <div className="bid-panel">
      <CountdownPanel auction={auction} onElapsed={onReload} />
      <div className="bid-panel-price">
        <div className="row spread">
          <div className="lot-price-label">{auction.currentPrice ? 'Current bid' : 'Starting price'}</div>
          <span className="bid-count-line">
            <span data-testid="bid-count">{auction.bidCount}</span> bid{auction.bidCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="row">
          <span className="ui-money ui-money-xl" data-testid="current-price">
            {money(auction.currentPrice ?? auction.initialPrice)}
          </span>
          {change != null && (
            <span className="bid-change" data-testid="price-change" title="Change since the starting price">
              {change >= 0 ? '+' : ''}
              {change}%
            </span>
          )}
        </div>
        <PriceChart auction={auction} bids={bids} />
      </div>
      <BidForm auction={auction} bids={bids} onReload={onReload} />
    </div>
  );
}

/**
 * The one bid call (BidPanel form and the pop-4.1 phone band): client pre-check with the server's wording, POST,
 * then the same reducers as pushed events. `pow` counts successful bids (drives the POW! burst).
 */
export function useBidAction(auction: Auction, bids: Bid[], onReload: () => void) {
  const { user } = useAuth();
  const { credit, locked } = useCredit();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pow, setPow] = useState(0);
  const min = auction.nextMinBid ?? auction.initialPrice;
  const leading = bids.find((b) => b.status === 'active');

  const place = async (value: number) => {
    // Same messages as the server; the server still checks everything and its answer wins. A leader raising
    // their own bid gets the old hold back first (be/src/routes/bids.ts), so it counts as available here.
    const ownHold = user && leading?.bidder.id === user.id ? leading.amount : 0;
    const problem = precheck(value, min, credit - locked + ownHold);
    setError(problem ?? '');
    if (problem) return;
    setBusy(true);
    try {
      const res = await api<{ event: BidEvent; released: number }>(`/auctions/${auction.id}/bids`, { body: { amount: value } });
      // Same reducer as pushed events; the pushed copy of this bid is then ignored as a duplicate.
      dispatch(bidReceived(res.event));
      // crd-003: only locked credit changes on a bid; no refetch of the user or credit.
      dispatch(bidPlaced({ amount: res.event.bid.amount, released: res.released }));
      toast(`Bid of ${money(value)} placed`, 'success');
      setPow((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields.amount ?? err.message);
        // Someone may have bid first: reload so the panel shows the new minimum.
        onReload();
      }
    } finally {
      setBusy(false);
    }
  };
  return { place, error, busy, pow, min, leading };
}

/** pop-2.3: POW! pops once per successful bid and is announced; errors never get a sound word. */
export function PowBurst({ count, error, className = '' }: { count: number; error: string; className?: string }) {
  if (!count || error) return null;
  return <Burst key={count} word="POW!" animate announce className={className} testId="pow-burst" />;
}

function BidForm({ auction, bids, onReload }: { auction: Auction; bids: Bid[]; onReload: () => void }) {
  const { user } = useAuth();
  const { credit, locked } = useCredit();
  const location = useLocation();
  const [amount, setAmount] = useState('');
  const { place, error, busy, pow, min, leading } = useBidAction(auction, bids, onReload);

  useEffect(() => {
    if (auction.nextMinBid != null) setAmount(formatTyping(String(auction.nextMinBid)));
  }, [auction.nextMinBid]);

  if (auction.status === 'cancelled') return <p className="muted">This auction was cancelled and no longer accepts bids.</p>;
  if (auction.status === 'ended') return <p className="muted">This auction has ended and no longer accepts bids.</p>;
  if (auction.status === 'upcoming') return <p className="muted">Bidding opens when the auction starts.</p>;
  if (!user)
    return (
      <Link to="/login" state={{ from: location.pathname }} className="btn btn-primary bid-submit">
        Log in to bid
      </Link>
    );
  if (auction.isOwner) return <p className="muted">You can't bid on your own auction.</p>;

  const value = bidAmount(amount, min);
  const quick = quickAmounts(auction.currentPrice, auction.initialPrice);

  // rt-001: where the viewer stands, kept current by pushed bid events.
  const hasBid = bids.some((b) => b.bidder.id === user.id);
  const standing = !hasBid ? null : leading?.bidder.id === user.id ? 'leading' : 'outbid';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void place(value);
  };

  return (
    <form onSubmit={submit} noValidate className="bid-form">
      <PowBurst count={pow} error={error} className="bid-pow" />
      {standing && (
        <p className={`bid-standing is-${standing}`} data-testid="my-standing" role="status">
          {standing === 'leading' ? (
            <Badge kind="you" testId="bid-ok">
              You're the top bidder!
            </Badge>
          ) : (
            <span data-testid="outbid-notice">You've been outbid — jump back in?</span>
          )}
        </p>
      )}
      <div className="field">
        <div className="row spread">
          <label htmlFor="bid-amount">Your bid</label>
          <span className="small">
            Minimum next bid <span data-testid="next-min-bid">{money(min)}</span>
          </span>
        </div>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          {/* ui-1a.3: 'Custom bid' on a card opens the lot with ?bid=1 to start typing straight away. */}
          <input
            id="bid-amount"
            inputMode="decimal"
            value={amount}
            placeholder={formatTyping(String(min))}
            onChange={(e) => setAmount(formatTyping(e.target.value))}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'bid-error' : undefined}
            autoFocus={new URLSearchParams(location.search).get('bid') === '1'}
            data-testid="bid-input"
          />
        </div>
      </div>
      <div className="quick-bids">
        {quick.map((q, i) => (
          <button key={i} type="button" className="btn btn-secondary btn-sm" onClick={() => setAmount(formatTyping(String(q)))} data-testid={`quick-bid-${QUICK_STEPS[i]}`}>
            {money(q)}
          </button>
        ))}
      </div>
      {error && (
        <p className="bid-error" id="bid-error" role="alert" data-testid="bid-error">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-lg bid-submit" type="submit" disabled={busy} data-testid="place-bid">
        {busy ? 'Placing...' : `Place bid! ${money(value)}`}
      </button>
      <p className="muted small bid-footnote">
        Credit: {money(credit)} · Locked credit: {money(locked)}
      </p>
      <p className="muted small bid-footnote">Bids are binding · locked from your available credit until you are outbid</p>
    </form>
  );
}

/**
 * ui-1b.3: 'Bid history · Live' list, newest first: initials avatar, bidder, amount, relative time (full date
 * in the tooltip, refreshed every 30 s). The viewer's own bids are cream with a 'You' pill. Rows keep table
 * semantics (row 0 is a hidden header) so a row index means the same as in the old table.
 */
export function BidHistory({ bids }: { bids: Bid[] }) {
  const { user } = useAuth();
  const now = useNow(30_000);
  return (
    <section className="ui-card bid-history-card" aria-labelledby="bid-history-title">
      <header className="ui-card-head">
        <h2 className="ui-card-title" id="bid-history-title">
          Bid history <span className="live-dot">· Live</span>
        </h2>
        <span className="muted small">
          {bids.length} bid{bids.length === 1 ? '' : 's'}
        </span>
      </header>
      {bids.length === 0 ? (
        <p className="muted">No bids yet.</p>
      ) : (
        <div className="bid-history" role="table" aria-labelledby="bid-history-title" data-testid="bid-history">
          <div role="row" className="sr-only">
            <span role="columnheader">Bidder</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Time</span>
            <span role="columnheader">Status</span>
          </div>
          {bids.map((b) => {
            const mine = b.bidder.id === user?.id;
            return (
              <div role="row" key={b.id} className={`bid-row ${mine ? 'is-mine' : ''}`} data-testid={`bid-row-${b.id}`}>
                <span role="cell" className="bid-who">
                  <span className="avatar avatar-sm" aria-hidden="true">
                    {initials(null, b.bidder.username)}
                  </span>
                  <span>
                    {b.bidder.username}
                    {mine && (
                      <Badge kind="you" testId="you">
                        You
                      </Badge>
                    )}
                  </span>
                </span>
                <span role="cell" className="bid-amount">
                  {money(b.amount)}
                </span>
                <span role="cell" className="muted small" title={new Date(b.createdAt).toLocaleString()}>
                  {relativeTime(b.createdAt, now)}
                </span>
                <span role="cell" className={`bid-status is-${b.status === 'active' ? 'leading' : b.status}`}>
                  {b.status === 'active' ? 'leading' : b.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** ui-1b.3: area chart of the price from the start through every bid; hidden without bids. */
function PriceChart({ auction, bids }: { auction: Auction; bids: Bid[] }) {
  const W = 300;
  const H = 72;
  const g = priceChart(auction.initialPrice, bids.map((b) => b.amount), W, H);
  if (!g) return null;
  const last = g.points[g.points.length - 1];
  return (
    <svg
      className="price-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={chartLabel(auction.initialPrice, last.price, bids.length, money)}
      data-testid="price-chart"
      data-points={g.points.length}
    >
      <polygon points={g.area} className="price-chart-area" />
      <polyline points={g.line} className="price-chart-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * pop-2.2: comic countdown on ink with the page's one red shadow. The text line ('Ends in 1h 2m 3s', ui-1b.2) is
 * the role=timer with aria-live=off; the HRS:MIN:SEC boxes are visual only. The 5-minute and 1-minute marks are
 * announced once each in a separate polite region (a lot opened inside a mark announces it once).
 */
export function CountdownPanel({ auction, onElapsed }: { auction: Auction; onElapsed: () => void }) {
  const now = useNow();
  const left = new Date(auction.endTime).getTime() - now;
  const live = auction.status === 'active' && left > 0;
  const prev = useRef(Number.POSITIVE_INFINITY);
  const [announce, setAnnounce] = useState('');
  useEffect(() => {
    if (!live) return;
    const crossed = marksCrossed(prev.current, left);
    prev.current = left;
    if (crossed.length) setAnnounce(crossed[crossed.length - 1]);
  }, [left, live]);
  const { hours, minutes, seconds } = splitCountdown(left);
  return (
    <div className={`countdown-panel ${live ? '' : 'is-idle'}`} data-testid="countdown-panel">
      <div className="countdown-caption" role="timer" aria-live="off" aria-atomic="true">
        <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onElapsed} format="ends-in" />
      </div>
      {live && (
        <div className="countdown-boxes" aria-hidden="true">
          <span className="cd-box" data-testid="cd-hours">
            {hours}
            <small>Hrs</small>
          </span>
          <span className="cd-sep">:</span>
          <span className="cd-box" data-testid="cd-minutes">
            {minutes}
            <small>Min</small>
          </span>
          <span className="cd-sep">:</span>
          <span className="cd-box is-seconds" data-testid="cd-seconds">
            {seconds}
            <small>Sec</small>
          </span>
        </div>
      )}
      <p className="sr-only" aria-live="polite" data-testid="countdown-announce">
        {announce}
      </p>
    </div>
  );
}

/**
 * pop-4.1: phone quick bid. A zap-yellow band stuck to the bottom of the lot page (CSS shows it at <= 640px only)
 * with the current bid, the time left, the ladder's quick amounts as chips and one 'Bid $X!' button. It uses the
 * same useBidAction as the form, so the checks and the API call are the same.
 */
export function MobileBidBand({ auction, bids, onReload }: { auction: Auction; bids: Bid[]; onReload: () => void }) {
  const { user } = useAuth();
  const now = useNow();
  const [pick, setPick] = useState(0);
  const { place, error, busy, pow } = useBidAction(auction, bids, onReload);
  const left = new Date(auction.endTime).getTime() - now;
  if (auction.status !== 'active' || left <= 0 || !user || auction.isOwner) return null;
  const quick = quickAmounts(auction.currentPrice, auction.initialPrice);
  const amount = quick[pick];
  const { hours, minutes, seconds } = splitCountdown(left);
  return (
    <section className="bid-band" aria-label="Quick bid" data-testid="bid-band">
      <PowBurst count={pow} error={error} className="band-pow" />
      <div className="band-top">
        <div>
          <div className="overline">Current bid</div>
          <strong className="band-price" data-testid="band-price">
            {money(auction.currentPrice ?? auction.initialPrice)}
          </strong>
        </div>
        <div className="band-clock">
          <div className="overline">Ends in</div>
          <span data-testid="band-clock">
            {hours}:{minutes}:{seconds}
          </span>
        </div>
      </div>
      <div className="band-chips" role="group" aria-label="Bid amount">
        {quick.map((q, i) => (
          <button
            key={i}
            type="button"
            className={`btn btn-sm ${i === pick ? 'btn-trust' : 'btn-quiet'}`}
            aria-pressed={i === pick}
            onClick={() => setPick(i)}
            data-testid={`band-chip-${QUICK_STEPS[i]}`}
          >
            {money(q)}
          </button>
        ))}
      </div>
      <p className="band-note" data-testid="band-note">
        {auction.bidCount} bid{auction.bidCount === 1 ? '' : 's'} · You'll bid {money(amount)}
      </p>
      {error && (
        <p className="bid-error" role="alert" data-testid="band-error">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-lg band-bid" disabled={busy} onClick={() => void place(amount)} data-testid="band-bid">
        {busy ? 'Placing...' : `Bid ${money(amount)}!`}
      </button>
    </section>
  );
}
