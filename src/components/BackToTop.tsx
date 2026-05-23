// src/components/BackToTop.tsx
// Botón back-to-top con relleno de progreso de scroll.
// Relleno: pseudo-elemento ::before que crece desde bottom: 0 (overflow: hidden).
// CSS var --btt-progress (0..1) controla la altura del relleno.

import { useEffect } from 'react';

export default function BackToTop() {
  useEffect(() => {
    const btn = document.getElementById('btt');
    if (!btn) return;

    btn.hidden = false;
    const THRESHOLD = 400;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafScheduled = false;

    function update() {
      rafScheduled = false;
      const doc = document.documentElement;
      const y = window.pageYOffset || doc.scrollTop;
      const maxScroll = Math.max(1, doc.scrollHeight - doc.clientHeight);
      const p = Math.min(1, Math.max(0, y / maxScroll));
      btn!.style.setProperty('--btt-progress', p.toFixed(4));
      btn!.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      btn!.classList.toggle('btt-visible', y > THRESHOLD);
    }

    function onScroll() {
      if (rafScheduled) return;
      rafScheduled = true;
      window.requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
      const skip = document.querySelector<HTMLElement>('#main-content, main, body');
      if (skip) setTimeout(() => { try { skip.focus({ preventScroll: true }); } catch {} },
                            reduced ? 0 : 350);
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <>
      <style>{`
        #btt {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          z-index: 40;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 1px solid var(--card-border);
          background: var(--bg-elevated);
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          isolation: isolate;
          opacity: 0;
          pointer-events: none;
          transform: translateY(8px);
          transition: opacity 0.25s ease, transform 0.25s ease,
                      box-shadow 0.2s ease;
          --btt-progress: 0;
        }
        #btt::before {
          content: '';
          position: absolute;
          inset-inline: 0;
          bottom: 0;
          height: calc(var(--btt-progress) * 100%);
          background: var(--accent);
          transition: height 0.12s linear;
          z-index: 0;
        }
        #btt > * { position: relative; z-index: 1; }
        #btt.btt-visible {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        #btt:hover {
          box-shadow: var(--accent-glow);
          transform: translateY(-2px);
        }
        #btt:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 3px;
        }
        @media (max-width: 600px) {
          #btt { width: 44px; height: 44px; bottom: 1rem; right: 1rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          #btt, #btt::before { transition: none; }
          #btt:hover { transform: none; }
        }
      `}</style>

      <button
        id="btt"
        type="button"
        aria-label="Volver arriba"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        hidden
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5l-7 7m7-7l7 7m-7-7v14"
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </>
  );
}
