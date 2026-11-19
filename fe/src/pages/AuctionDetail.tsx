import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CONDITION_LABELS, money, type Auction } from '../api';
import { badgesFor, lotLabel } from '../brand';
import { StatusBadge, useNow } from '../components/AuctionBits';
import { BidHistory, BidPanel, MobileBidBand } from '../components/BidPanel';
import { CancelAuction } from '../components/CancelAuction';
import { Gallery } from '../components/Gallery';
import { Messages } from '../components/Messages';
import { Pill } from '../components/ui';
import { useAppDispatch, useAppSelector } from '../store';
import { loadAuction } from '../store/auctionSlice';
import { useAuctionEvents } from '../store/useAuctionEvents';

/** Characters of the description shown under the title before 'Read the full description'. */
const EXCERPT = 220;

export function AuctionDetailPage() {
  const auctionId = Number(useParams().id);
  const dispatch = useAppDispatch();
  // rt-001: auction and bids live in the Redux store; pushed bid events update it in place.
  const { auction: loaded, bids: storedBids, error: loadError, requestedId } = useAppSelector((s) => s.auction);
  const current = requestedId === auctionId && loaded?.id === auctionId;
  const auction = current ? loaded : null;
  const bids = current ? storedBids : [];
  const error = requestedId === auctionId ? loadError : '';
  const now = useNow();
  const [tab, setTab] = useState<LotTab>('description');

  const load = useCallback(() => {
    dispatch(loadAuction(auctionId));
  }, [dispatch, auctionId]);

  useEffect(() => {
    load();
  }, [load]);
  useAuctionEvents(Number.isFinite(auctionId) ? auctionId : null);

  if (error && !auction) return <p className="error">{error}</p>;
  if (!auction) return <p className="muted">Loading...</p>;

  const category = auction.goods.category;
  const description = auction.description ?? '';
  const excerpt = description.length > EXCERPT ? `${description.slice(0, EXCERPT).trimEnd()}...` : description;
  const openDescription = () => {
    setTab('description');
    document.getElementById('lot-tabs')?.scrollIntoView();
    document.getElementById('tab-description')?.focus();
  };

  // ui-1b.1 / pop-2.1: two columns (gallery + tabs | lot head, bid panel, history); on phones the aside follows the gallery.
  return (
    <div className="lot-detail">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        {category && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/?category=${category.id}`}>{category.name}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{lotLabel(auction.id)}</span>
      </nav>
      <div className="lot-gallery">
        <Gallery images={auction.goods.images} name={auction.name} badges={badgesFor(auction, now)} />
      </div>
      <aside className="lot-aside">
        <header className="lot-head" data-testid="lot-info">
          <div className="overline" data-testid="lot-meta">
            {lotLabel(auction.id)}
            {category && ` · ${category.name}`} · {auction.seller.username}
          </div>
          <h1 className="lot-name">{auction.name}</h1>
          <p className="lot-seller">
            Sold by <strong>{auction.seller.username}</strong>
          </p>
          {!auction.hasReserve && <Pill tone="muted">No reserve</Pill>}
          {excerpt && <p className="lot-excerpt">{excerpt}</p>}
          {description && (
            <button type="button" className="link-button" onClick={openDescription} data-testid="read-description">
              Read the full description
            </button>
          )}
        </header>
        <div className="ui-card lot-bid-card">
          <BidPanel auction={auction} bids={bids} onReload={load} />
          <CancelAuction auction={auction} onDone={load} />
        </div>
        <BidHistory bids={bids} />
      </aside>
      <div className="lot-main">
        <LotTabs auction={auction} tab={tab} onTab={setTab} />
        <Messages auctionId={auction.id} sellerId={auction.seller.id} closed={auction.status === 'ended' || auction.status === 'cancelled'} onClosed={load} />
      </div>
      {/* pop-4.1: phone-only quick-bid band, the last grid item so it sticks inside the lot page only. */}
      <MobileBidBand auction={auction} bids={bids} onReload={load} />
    </div>
  );
}

type LotTab = 'description' | 'condition' | 'seller';
const TABS: { id: LotTab; label: string }[] = [
  { id: 'description', label: 'Description' },
  { id: 'condition', label: 'Condition' },
  { id: 'seller', label: 'Seller' },
];

/** Opens the chat widget (ChatBox listens for this event). */
const openChat = () => window.dispatchEvent(new CustomEvent('open-chat'));

/**
 * pop-2.5: Description / Condition / Seller tabs (WAI-ARIA, manual activation: arrow keys move focus,
 * Enter/Space select) and the lot facts. Only fields the lot really has are shown.
 */
function LotTabs({ auction, tab, onTab }: { auction: Auction; tab: LotTab; onTab: (t: LotTab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : step ? (i + step + TABS.length) % TABS.length : null;
    if (to === null) return;
    e.preventDefault();
    refs.current[to]?.focus();
  };
  const category = auction.goods.category;
  const condition = auction.goods.condition && (CONDITION_LABELS[auction.goods.condition] ?? auction.goods.condition);
  return (
    <section className="lot-tabs" id="lot-tabs" aria-label="Lot details">
      <div role="tablist" aria-label="Lot details" className="pop-tabs" data-testid="lot-tabs">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={`pop-tab pop-tab-${t.id}`}
            onClick={() => onTab(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="pop-tabpanel" data-testid="lot-tabpanel">
        {tab === 'description' && <p className="lot-description">{auction.description || 'The seller has not added a description.'}</p>}
        {tab === 'condition' && (
          <>
            <p data-testid="condition-text">{condition ? `Condition: ${condition}` : 'The seller has not given a condition.'}</p>
            <p>
              Have a question about condition?{' '}
              <button type="button" className="link-button" onClick={openChat} data-testid="ask-desk">
                Ask the auction desk in the chat
              </button>
            </p>
          </>
        )}
        {tab === 'seller' && (
          <>
            <p>
              Seller: <strong data-testid="seller-name">{auction.seller.username}</strong>
            </p>
            {/* ui-1a.2 search can filter by seller name. */}
            <Link to={`/?q=${encodeURIComponent(auction.seller.username)}&field=seller`}>See more lots from this seller</Link>
          </>
        )}
      </div>
      <dl className="lot-facts" data-testid="lot-facts">
        {category && (
          <div>
            <dt>Category</dt>
            <dd>{category.name}</dd>
          </div>
        )}
        {condition && (
          <div>
            <dt>Condition</dt>
            <dd>{condition}</dd>
          </div>
        )}
        <div>
          <dt>Starting price</dt>
          <dd>{money(auction.initialPrice)}</dd>
        </div>
        <div>
          <dt>Starts</dt>
          <dd>{new Date(auction.startTime).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd data-testid="end-time">{new Date(auction.endTime).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={auction.status} />
          </dd>
        </div>
        {auction.winner && (
          <div>
            <dt>Winner</dt>
            <dd data-testid="winner">{auction.winner.username}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
