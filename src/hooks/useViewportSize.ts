import { useState, useEffect } from 'react';
import { getFlashcardLayoutMode, FlashcardLayoutMode } from '@/lib/vocabFlashcardHelpers';

export interface ViewportSizeState {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  isCompactLandscape: boolean;
  layoutMode: FlashcardLayoutMode;
}

function readViewport(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 390, height: 844 };
  }
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return { width, height };
}

export function useViewportSize(): ViewportSizeState {
  const [viewport, setViewport] = useState<ViewportSizeState>(() => {
    const { width, height } = readViewport();
    const orientation = width > height ? 'landscape' : 'portrait';
    const isCompactLandscape = width > height && height <= 560;
    const layoutMode = getFlashcardLayoutMode(width, height);
    return { width, height, orientation, isCompactLandscape, layoutMode };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;

    const updateSize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const { width, height } = readViewport();
        const orientation = width > height ? 'landscape' : 'portrait';
        const isCompactLandscape = width > height && height <= 560;
        const layoutMode = getFlashcardLayoutMode(width, height);

        // Đặt CSS custom property cho visual viewport height fallback
        document.documentElement.style.setProperty('--flashcard-vh', `${height}px`);

        setViewport((prev) => {
          if (
            prev.width === width &&
            prev.height === height &&
            prev.orientation === orientation &&
            prev.layoutMode === layoutMode
          ) {
            return prev;
          }
          return { width, height, orientation, isCompactLandscape, layoutMode };
        });
      });
    };

    updateSize();

    window.addEventListener('resize', updateSize, { passive: true });
    window.addEventListener('orientationchange', updateSize, { passive: true });
    window.visualViewport?.addEventListener('resize', updateSize, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
      window.visualViewport?.removeEventListener('resize', updateSize);
    };
  }, []);

  return viewport;
}

