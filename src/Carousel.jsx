import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Reusable carousel that slides ONE card at a time (not page-by-page).
 * Auto-plays continuously, pauses on hover/touch.
 *
 * Props:
 *  - items: array of React nodes (the cards)
 *  - itemsPerView: how many cards visible at once (default 4)
 *  - itemsPerViewTablet: cards visible at <=960px (default 2)
 *  - itemsPerViewMobile: cards visible at <=640px (default 1)
 *  - autoPlay: auto-advance one card at a time (default true)
 *  - interval: ms between each single-card advance (default 5000)
 *  - className: extra class for the carousel track
 */
export default function Carousel({
  items = [],
  itemsPerView = 4,
  itemsPerViewTablet = 2,
  itemsPerViewMobile = 1,
  autoPlay = true,
  interval = 1000,
  className = '',
}) {
  const [index, setIndex] = useState(0); // index of the FIRST visible card
  const [perView, setPerView] = useState(itemsPerView);
  const [paused, setPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const trackRef = useRef(null);

  // Max starting index so the last `perView` cards are fully visible
  const maxIndex = Math.max(0, items.length - perView);

  // Responsive: detect viewport and set itemsPerView
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w <= 640) setPerView(itemsPerViewMobile);
      else if (w <= 960) setPerView(itemsPerViewTablet);
      else setPerView(itemsPerView);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [itemsPerView, itemsPerViewTablet, itemsPerViewMobile]);

  // Clamp index when perView changes
  useEffect(() => {
    if (index > maxIndex) setIndex(maxIndex);
  }, [maxIndex, index]);

  // Advance by ONE card, loop back to start when reaching the end
  const next = useCallback(() => {
    setIndex(i => (i >= maxIndex ? 0 : i + 1));
  }, [maxIndex]);

  const prev = useCallback(() => {
    setIndex(i => (i <= 0 ? maxIndex : i - 1));
  }, [maxIndex]);

  // Auto-play — advance one card every `interval` ms
  useEffect(() => {
    if (!autoPlay || paused || items.length <= perView) return;
    const timer = setTimeout(() => next(), interval);
    return () => clearTimeout(timer);
  }, [autoPlay, paused, index, items.length, perView, interval, next]);

  // Touch handlers
  const onTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX);
    setTouchEnd(null);
    setPaused(true);
  };
  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (touchStart !== null && touchEnd !== null) {
      const diff = touchStart - touchEnd;
      const threshold = 40;
      if (diff > threshold) next();
      if (diff < -threshold) prev();
    }
    setTouchStart(null);
    setTouchEnd(null);
    setTimeout(() => setPaused(false), 2000);
  };

  // Each card takes 100/perView % of the viewport width.
  // To show card at `index` as the first visible one, shift by `index * cardWidth`.
  const cardWidth = 100 / perView;
  const shift = -(index * cardWidth);

  if (!items.length) return null;

  return (
    <div
      className="ps-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Track */}
      <div
        className={`ps-carousel-track ${className}`}
        ref={trackRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          display: 'flex',
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: `translateX(${shift}%)`,
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="ps-carousel-item"
            style={{
              flex: `0 0 ${cardWidth}%`,
              maxWidth: `${cardWidth}%`,
              padding: '0 12px',
              boxSizing: 'border-box',
            }}
          >
            {item}
          </div>
        ))}
      </div>

      {/* Arrow controls */}
      {items.length > perView && (
        <>
          <button
            className="ps-carousel-arrow prev"
            onClick={prev}
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            className="ps-carousel-arrow next"
            onClick={next}
            aria-label="Next"
          >
            ›
          </button>
        </>
      )}

      {/* Dot indicators — one per card position */}
      {items.length > perView && (
        <div className="ps-carousel-dots">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              className={`ps-carousel-dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Go to card ${i + 1}`}
            >
              {i === index && autoPlay && !paused && (
                <span
                  className="ps-carousel-dot-progress"
                  style={{ animationDuration: `${interval}ms` }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
