import { useRef, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Auction } from '../api';
import { lotLabel, priceLabel, toneFor } from '../brand';
import { FIELD_LABELS, SORT_LABELS, browseApiQuery, browseParams, isFiltered, readBrowse, type Browse, type Sort } from '../browseQuery';
import { AuctionCard } from '../components/AuctionCard';
import { liveCountLabel, splitSections } from '../homeSections';
import { Badge, Button, Halftone, LotGlyph, SegmentedTabs, SpeechBubble } from '../components/ui';

function Section({ id, title, empty, auctions, onElapsed }: { id: string; title: string; empty: string; auctions: Auction[]; onElapsed: () => void }) {
  return (
    <section aria-labelledby={id} data-testid={`section-${id}`} className="home-section">
      <h2 id={id} className="browse-title">
        {title} <span className="muted small">({auctions.length})</span>
      </h2>
      <LotGrid auctions={auctions} empty={empty} onElapsed={onElapsed} />
    </section>
  );
}

function LotGrid({ auctions, empty, onElapsed }: { auctions: Auction[]; empty: string; onElapsed: () => void }) {
  return auctions.length === 0 ? (
    <p className="muted">{empty}</p>
  ) : (
    <div className="lot-grid">
      {auctions.map((a, i) => (
        <AuctionCard key={a.id} auction={a} onElapsed={onElapsed} index={i} />
      ))}
    </div>
  );
}

/** pop-1.1: the one display-xl headline on a halftone band, with the hottest live lot (most bids, home-1.1 order). */
function Hero({ hot }: { hot: Auction | undefined }) {
  return (
    <section className="hero-band halftone-yellow" aria-labelledby="hero-title" data-testid="hero">
      <div className="hero-copy">
        <h1 id="hero-title" className="hero-title">
          Going, going... GONE!
        </h1>
        <p className="hero-intro">Live auctions on art, collectibles and more. Bid from your credit, watch every bid land live, and take it home when the hammer drops.</p>
        <div className="hero-actions">
          <Button variant="secondary" href="#live">
            Browse live lots
          </Button>
          <Button variant="quiet" href="#how-it-works">
            How it works
          </Button>
        </div>
      </div>
      {hot && <HotLot auction={hot} />}
    </section>
  );
}

function HotLot({ auction }: { auction: Auction }) {
  const image = auction.goods.images[0];
  const category = auction.goods.category?.name;
  return (
    <Link to={`/auctions/${auction.id}`} className="hot-lot" data-testid="hot-lot">
      <SpeechBubble className="hot-lot-bubble" tilt={-5}>
        Hot lot!
      </SpeechBubble>
      <Halftone tone="pink" className="hot-lot-art">
        {image ? <img src={image} alt="" /> : <LotGlyph />}
        <span className="lot-badge-left">
          <Badge kind="live">Live</Badge>
        </span>
      </Halftone>
      <div className="hot-lot-body">
        <div className="overline">
          {lotLabel(auction.id)}
          {category && ` · ${category}`}
        </div>
        <div className="hot-lot-name">{auction.name}</div>
        <div className="hot-lot-price-row">
          <span className="overline">Current bid</span>
          <strong className="hot-lot-price" data-testid="hot-lot-price">
            {priceLabel(auction.currentPrice, auction.bidCount)}
          </strong>
        </div>
      </div>
    </Link>
  );
}

/** pop-1.3: the three steps, worded to the site's real rules (credit, live bids, settlement). */
function HowItWorks() {
  const steps = [
    { title: 'Spot it!', text: 'Browse live lots by category, or search by name, seller or product.' },
    { title: 'Bid it!', text: 'Bid from your available credit. Every bid follows the increment ladder and shows up live for everyone watching.' },
    { title: 'Win it!', text: 'When the hammer drops, the top bid wins. The lot is yours and your credit settles on its own.' },
  ];
  return (
    <section id="how-it-works" className="how-it-works" aria-labelledby="how-title" data-testid="how-it-works">
      <h2 id="how-title" className="browse-title">
        How it works
      </h2>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title} className="step">
            <Halftone tone={toneFor(i)} className="step-no">
              <span>{i + 1}</span>
            </Halftone>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const browse = readBrowse(params);
  const apiQuery = browseApiQuery(browse);
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api<{ categories: { id: number; name: string }[] }>('/categories').then((r) => setCategories(r.categories));
  }, []);

  const load = useCallback(() => {
    api<{ auctions: Auction[]; justCompletedLimit: number }>(`/auctions${apiQuery}`).then((r) => setAuctions(r.auctions));
  }, [apiQuery]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // ui-1a.2: every change pushes a history entry, so Back restores the previous filter.
  const go = (next: Partial<Browse>) => setParams(browseParams({ ...browse, ...next }));
  const { trending, completed } = splitSections(auctions ?? []);
  const searching = !!browse.q;
  const filtered = isFiltered(browse);
  const chips = [
    { value: 'all', label: 'All' },
    { value: 'ending', label: 'Ending soon' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortRef.current &&
        !sortRef.current.contains(event.target as Node)
      ) {
        setSortOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="home">
      {/* pop-1.1 / pop-1.2: the hero and the category ticker frame the unfiltered browse page. */}
      {!filtered && (
        <>
          <Hero hot={auctions ? trending[0] : undefined} />
          <nav className="category-ticker" id="categories" aria-label="Categories" data-testid="category-ticker">
            {categories.map((c) => (
              <Link key={c.id} to={`/?category=${c.id}`}>
                {c.name}
              </Link>
            ))}
          </nav>
        </>
      )}
      {/* home-1.2 / pop-1.2: 'Live lots', the same for guests and customers. */}
      <section aria-labelledby="live" data-testid="section-live" className="home-section">
        <div className="browse-head">
          <div>
            <h2 id="live" className="browse-title">
              Live lots
            </h2>
            {auctions && (
              // The cards refresh on a 30 s poll, not live, so the mockup's 'bids update in real time' is left out.
              <p className="muted browse-sub" data-testid="live-count">
                {liveCountLabel(trending.length)}
              </p>
            )}
          </div>
          <label className="sort-control">
            <span className="sort-label">Sort:</span>
            <div className="custom-select" data-testid="sort" ref={sortRef}>
              <button
                type="button"
                className="custom-select-trigger"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen((prev) => !prev)}
              >
                {SORT_LABELS[browse.sort]}
                <span className="custom-select-arrow">▾</span>
              </button>

              {sortOpen && (
                <div className="custom-select-menu" role="listbox">
                  {Object.entries(SORT_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      role="option"
                      aria-selected={browse.sort === k}
                      className={`custom-select-option ${browse.sort === k ? 'active' : ''
                        }`}
                      onClick={() => {
                        go({ sort: k as Sort });
                        setSortOpen(false);
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </label>
        </div>
        <div className="chip-bar">
          <SegmentedTabs tabs={chips} value={browse.category || 'all'} onChange={(v) => go({ category: v === 'all' ? '' : v })} label="Categories" testId="category-chips" />
        </div>
        {searching && auctions && (
          <p data-testid="search-summary" className="row">
            <span>
              {auctions.length} result{auctions.length === 1 ? '' : 's'} for <strong>"{browse.q}"</strong> in {FIELD_LABELS[browse.field].toLowerCase()}
            </span>
            <button className="btn btn-ghost btn-small" type="button" onClick={() => go({ q: '', field: 'all' })}>
              Clear
            </button>
          </p>
        )}
        {filtered && auctions?.length === 0 && (
          <div className="empty-state" data-testid="no-match">
            <p>No lots match.</p>
            <button className="btn btn-primary" type="button" onClick={() => setParams({})}>
              Clear filters
            </button>
          </div>
        )}
        {!auctions ? (
          <p className="muted">Loading auctions...</p>
        ) : (
          <LotGrid auctions={trending} empty={filtered ? 'No live auctions match.' : 'No auctions are live right now.'} onElapsed={load} />
        )}
      </section>
      {auctions && (
        <Section
          id="completed"
          title="Just completed"
          empty={filtered ? 'No completed auctions match.' : 'No recently completed auctions.'}
          auctions={completed}
          onElapsed={load}
        />
      )}
      {!filtered && <HowItWorks />}
    </div>
  );
}
