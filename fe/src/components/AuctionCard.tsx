import { Link, useNavigate } from 'react-router-dom';
import { money, type Auction } from '../api';
import { useAuth } from '../auth';
import { badgesFor, lotLabel, toneFor } from '../brand';
import { Countdown, NewTag, useNow } from './AuctionBits';
import { priceLabel as priceCaption, stripState } from './auctionCardState';
import { Badge, Halftone, LotGlyph } from './ui';

/**
 * pop-1.2: the brand LotCard. The art (halftone panel in a tone that differs from its neighbours) and text form
 * one link; ui-1a.3's quick-bid row sits below it inside the same frame, never inside the link.
 * Badges come from badgesFor (max two: Live / lot number, Ending soon! / time left / GONE!). The ticking time
 * left (ui-1a.1 countdown) stays in the text block; the viewer's own position is shown with the 'you' badge.
 */
export function AuctionCard({ auction, onElapsed, index = 0 }: { auction: Auction; onElapsed?: () => void; index?: number }) {
  const { user } = useAuth();
  const now = useNow();
  const ended = auction.status === 'ended';
  const [left, right] = badgesFor(auction, now);
  const strip = stripState(auction, !!user);
  const image = auction.goods.images[0];
  const category = auction.goods.category?.name;
  return (
    <article className={`lot-card ${ended ? 'is-ended' : ''}`} data-testid={`auction-card-${auction.id}`}>
      <Link to={`/auctions/${auction.id}`} className="card-link lot-link">
        <Halftone tone={toneFor(index)} className="lot-media">
          {image ? <img src={image} alt="" className="lot-image" loading="lazy" /> : <LotGlyph className="lot-glyph" />}
          <span className="lot-badge-left">
            <Badge kind={left.kind}>{left.label}</Badge>
            <NewTag status={auction.status} startTime={auction.startTime} />
          </span>
          {right && (
            <span className="lot-badge-right">
              <Badge kind={right.kind} testId={right.kind === 'ending' ? 'ending-soon' : `badge-${right.kind}`}>
                {right.label}
              </Badge>
            </span>
          )}
        </Halftone>
        <div className="lot-body">
          <div className="overline lot-overline">
            {left.kind === 'live' && `${lotLabel(auction.id)} · `}
            {category ?? 'Uncategorised'}
          </div>
          <h3 className="lot-title" title={auction.name}>
            {auction.name}
          </h3>
          <div className="lot-price">
            <div>
              <div className="lot-price-label">{priceCaption(auction)}</div>
              <strong className="lot-price-value">{money(auction.currentPrice ?? auction.initialPrice)}</strong>
            </div>
            <span className="lot-bid-count" data-testid="card-bid-count">
              {auction.bidCount ? `${auction.bidCount} bid${auction.bidCount === 1 ? '' : 's'}` : 'No bids yet'}
            </span>
          </div>
          <div className="lot-time">
            <ClockIcon />
            <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onElapsed} />
          </div>
          {ended && (
            <div className="small muted" data-testid="card-winner">
              {auction.winner ? `Won by ${auction.winner.username}` : 'No winner'}
            </div>
          )}
          {strip && <MyBidStrip state={strip} amount={auction.myBid?.amount} />}
        </div>
      </Link>
      {auction.status === 'active' && !auction.isOwner && auction.nextMinBid != null && <QuickBid auction={auction} />}
    </article>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** ui-1a.1: where the viewer stands on a live lot. Leading uses the bam-blue 'you' badge; outbid stays plain text. */
function MyBidStrip({ state, amount }: { state: 'leading' | 'outbid' | 'none'; amount?: number }) {
  if (state === 'none') {
    return (
      <div className="my-bid-strip is-none" data-testid="my-bid-strip" data-state="none">
        You haven't bid yet
      </div>
    );
  }
  return (
    <div className={`my-bid-strip is-${state}`} data-testid="my-bid-strip" data-state={state}>
      {state === 'leading' ? <Badge kind="you">Top bidder</Badge> : <span className="my-bid-state">Outbid</span>}
      <span>
        Your bid <strong>{money(amount)}</strong>
      </span>
    </div>
  );
}

function QuickBid({ auction }: { auction: Auction }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // 'Bid $X' opens the lot, whose form is pre-filled with the minimum next bid; 'Custom bid' also focuses it.
  const open = (url: string) => navigate(user ? url : `/login?from=${encodeURIComponent(url)}`);

  return (
    <div className="lot-actions">
      <button type="button" className="btn btn-secondary btn-sm lot-action" onClick={() => open(`/auctions/${auction.id}`)} data-testid="quick-bid">
        Bid {money(auction.nextMinBid)}
      </button>
      <button type="button" className="btn btn-quiet btn-sm lot-action" onClick={() => open(`/auctions/${auction.id}?bid=1`)} data-testid="custom-bid">
        Custom bid
      </button>
    </div>
  );
}
