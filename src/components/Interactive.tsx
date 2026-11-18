import React, { useEffect } from 'react';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isFinePointerDesktop(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function spawnNavyRipple(
  e: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>,
  tone: 'navy' | 'light' = 'navy'
) {
  if (prefersReducedMotion()) return;
  const host = e.currentTarget;
  if (!host) return;
  const rect = host.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const size = Math.max(rect.width, rect.height) * 2.1;
  const clientX = 'clientX' in e && e.clientX ? e.clientX : rect.left + rect.width / 2;
  const clientY = 'clientY' in e && e.clientY ? e.clientY : rect.top + rect.height / 2;
  const x = clientX - rect.left - size / 2;
  const y = clientY - rect.top - size / 2;

  const wave = document.createElement('span');
  wave.className = `navy-ripple-wave ${tone === 'light' ? 'navy-ripple-wave-light' : ''}`;
  wave.style.width = `${size}px`;
  wave.style.height = `${size}px`;
  wave.style.left = `${x}px`;
  wave.style.top = `${y}px`;
  host.appendChild(wave);

  window.setTimeout(() => {
    wave.remove();
  }, 560);
}

/**
 * Lightweight global cursor ambience & local spotlight controller for desktop fine pointers.
 * Uses a single delegated pointermove listener throttled via requestAnimationFrame and cleanly
 * cleans up when unmounted or when prefers-reduced-motion / touch pointer is active.
 */
export function CursorAmbienceController() {
  useEffect(() => {
    if (typeof window === 'undefined' || prefersReducedMotion() || !isFinePointerDesktop()) {
      return;
    }

    const root = document.documentElement;
    let rafId = 0;
    let lastClientX = -1000;
    let lastClientY = -1000;
    let activeTarget: EventTarget | null = null;
    let activeMagneticEl: HTMLElement | null = null;

    const resetMagnetic = (el: HTMLElement | null) => {
      if (el) {
        el.style.transform = '';
      }
    };

    const applyFrame = () => {
      rafId = 0;
      root.style.setProperty('--cursor-x', `${lastClientX}px`);
      root.style.setProperty('--cursor-y', `${lastClientY}px`);

      const el = activeTarget instanceof HTMLElement ? activeTarget : null;
      const interactiveEl = el?.closest(
        'a, button, [data-spotlight="true"], .product-card-interactive, .btn-navy-primary, .btn-navy-outline'
      );
      root.setAttribute('data-near-interactive', interactiveEl ? 'true' : 'false');

      const spotlightEl = el?.closest(
        '[data-spotlight="true"], .product-card-interactive, .spotlight-surface, .btn-navy-primary'
      ) as HTMLElement | null;
      if (spotlightEl) {
        const rect = spotlightEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const sx = lastClientX - rect.left;
          const sy = lastClientY - rect.top;
          spotlightEl.style.setProperty('--spot-x', `${sx.toFixed(1)}px`);
          spotlightEl.style.setProperty('--spot-y', `${sy.toFixed(1)}px`);
        }
      }

      const magneticEl = el?.closest('[data-magnetic="true"]') as HTMLElement | null;
      if (activeMagneticEl && activeMagneticEl !== magneticEl) {
        resetMagnetic(activeMagneticEl);
      }
      activeMagneticEl = magneticEl;

      if (magneticEl && !magneticEl.hasAttribute('disabled')) {
        const rect = magneticEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const relX = (lastClientX - (rect.left + rect.width / 2)) / (rect.width / 2);
          const relY = (lastClientY - (rect.top + rect.height / 2)) / (rect.height / 2);
          const dx = Math.max(-4, Math.min(4, relX * 4));
          const dy = Math.max(-4, Math.min(4, relY * 4));
          magneticEl.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
        }
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      activeTarget = ev.target;
      if (!rafId) {
        rafId = window.requestAnimationFrame(applyFrame);
      }
    };

    const onPointerOut = (ev: PointerEvent) => {
      if (!ev.relatedTarget) {
        root.style.setProperty('--cursor-x', '-1000px');
        root.style.setProperty('--cursor-y', '-1000px');
        root.setAttribute('data-near-interactive', 'false');
        resetMagnetic(activeMagneticEl);
        activeMagneticEl = null;
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      resetMagnetic(activeMagneticEl);
      root.removeAttribute('data-near-interactive');
    };
  }, []);

  return null;
}

interface NavyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  magnetic?: boolean;
  children: React.ReactNode;
}

export function NavyButton({
  variant = 'primary',
  magnetic,
  className = '',
  onPointerDown,
  children,
  ...rest
}: NavyButtonProps) {
  const baseClass =
    variant === 'primary'
      ? 'btn-navy-primary'
      : variant === 'outline'
        ? 'btn-navy-outline'
        : 'ripple-host hover:bg-[#EAF2FA] text-[#102A43] active:scale-[0.975] transition-all';

  const enableMagnetic = magnetic ?? variant === 'primary';

  return (
    <button
      {...rest}
      data-spotlight="true"
      data-magnetic={enableMagnetic && !rest.disabled ? 'true' : undefined}
      onPointerDown={(e) => {
        if (!rest.disabled) {
          spawnNavyRipple(e, variant === 'primary' ? 'light' : 'navy');
        }
        onPointerDown?.(e);
      }}
      className={`${baseClass} ${className}`}
    >
      {children}
    </button>
  );
}
