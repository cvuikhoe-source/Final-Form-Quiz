import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseFlashcardGesturesOptions {
  onSwipeUp: () => void;
  onSwipeDown: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTap: () => void;
  flipped?: boolean;
  threshold?: number;       // Khoảng cách tối thiểu để nhận diện swipe (mặc định 55px)
  maxDuration?: number;     // Thời gian tối đa cho 1 swipe (mặc định 700ms)
  disabled?: boolean;
}

export interface DragVisualState {
  x: number;
  y: number;
  rotate: number;
  opacity: number;
}

const DEFAULT_DRAG_STATE: DragVisualState = {
  x: 0,
  y: 0,
  rotate: 0,
  opacity: 1,
};

/**
 * Kiểm tra xem target có phải là phần tử tương tác con hay không
 * (button, link, input, hoặc element có data-no-swipe="true")
 */
function isInteractiveChild(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('button, a, input, textarea, select, audio, video, [data-no-swipe="true"]')) {
    return true;
  }
  const roleButton = target.closest('[role="button"]');
  if (roleButton && !roleButton.classList.contains('flashcard-3d')) {
    return true;
  }
  return false;
}

/**
 * Hook quản lý cử chỉ cảm ứng độc quyền cho Flashcard toàn màn hình:
 * 1. Vuốt từ dưới lên (deltaY < -threshold): Lật Flashcard từ mặt trước sang mặt sau
 * 2. Vuốt từ trên xuống (deltaY > threshold): Nếu đang ở mặt sau, lật về mặt trước; nếu ở mặt trước, không làm gì
 * 3. Vuốt từ phải sang trái (deltaX < -threshold): Sang Flashcard tiếp theo (Next)
 * 4. Vuốt từ trái sang phải (deltaX > threshold): Quay lại Flashcard trước (Previous)
 * 5. Chạm nhanh vào vùng trống (Tap): Lật thẻ (Click-to-flip)
 * 6. Khóa hoàn toàn giật màn hình và cuộn trang nền.
 */
export function useFlashcardGestures({
  onSwipeUp,
  onSwipeDown,
  onPrev,
  onNext,
  onTap,
  flipped = false,
  threshold = 55,
  maxDuration = 700,
  disabled = false,
}: UseFlashcardGesturesOptions) {
  const [dragState, setDragState] = useState<DragVisualState>(DEFAULT_DRAG_STATE);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeHint, setSwipeHint] = useState<'flip-front' | 'flip-back' | 'prev' | 'next' | null>(null);

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const inScrollAreaRef = useRef<boolean>(false);
  const startedOnInteractiveRef = useRef<boolean>(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);
  const suppressClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setSuppressNextClick = useCallback(() => {
    suppressNextClickRef.current = true;
    if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    suppressClickTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 180);
  }, []);

  // Kiểm tra prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      if (e.touches.length !== 1) return;

      const target = e.target as HTMLElement | null;
      if (isInteractiveChild(target)) {
        startedOnInteractiveRef.current = true;
        return;
      }

      startedOnInteractiveRef.current = false;
      const touch = e.touches[0];
      activeTouchIdRef.current = touch.identifier;
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      startTimeRef.current = Date.now();

      // Kiểm tra xem gesture có bắt đầu từ vùng cuộn chi tiết hay không
      const scrollContainer = target ? target.closest('[data-scroll-container="true"]') : null;
      inScrollAreaRef.current = Boolean(scrollContainer);

      setIsSwiping(true);
      setSwipeHint(null);
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || activeTouchIdRef.current === null) return;

      const touch = Array.from(e.touches).find((t) => t.identifier === activeTouchIdRef.current);
      if (!touch) return;

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Nếu bắt đầu trong vùng cuộn chi tiết và đang vuốt dọc, ưu tiên cuộn nội dung chi tiết bên trong thẻ
      if (inScrollAreaRef.current && absY > absX) {
        setDragState(DEFAULT_DRAG_STATE);
        setSwipeHint(null);
        return;
      }

      // 1. Nhận diện kéo ngang (Previous / Next)
      if (absX > absY * 1.25 && absX > 10) {
        if (!reducedMotion) {
          const clampedX = Math.max(-85, Math.min(85, deltaX * 0.45));
          const rotate = (clampedX / 85) * 3;
          const opacity = Math.max(0.85, 1 - Math.abs(clampedX) / 600);
          setDragState({ x: clampedX, y: 0, rotate, opacity });
        }
        if (deltaX > threshold) {
          setSwipeHint('prev');
        } else if (deltaX < -threshold) {
          setSwipeHint('next');
        } else {
          setSwipeHint(null);
        }
        return;
      }

      // 2. Nhận diện kéo từ dưới lên (Vuốt lên)
      if (!inScrollAreaRef.current && absY > absX * 1.25 && deltaY < -10) {
        // Nếu ở mặt trước: chuẩn bị lật sang mặt sau
        if (!flipped) {
          if (!reducedMotion) {
            const clampedY = Math.max(-45, Math.min(0, deltaY * 0.35));
            setDragState({ x: 0, y: clampedY, rotate: 0, opacity: 0.96 });
          }
          if (deltaY < -threshold) {
            setSwipeHint('flip-back');
          } else {
            setSwipeHint(null);
          }
        }
        return;
      }

      // 3. Nhận diện kéo từ trên xuống (Vuốt xuống)
      if (!inScrollAreaRef.current && absY > absX * 1.25 && deltaY > 10) {
        // Nếu ở mặt sau: chuẩn bị lật về mặt trước
        if (flipped) {
          if (!reducedMotion) {
            const clampedY = Math.min(45, Math.max(0, deltaY * 0.35));
            setDragState({ x: 0, y: clampedY, rotate: 0, opacity: 0.96 });
          }
          if (deltaY > threshold) {
            setSwipeHint('flip-front');
          } else {
            setSwipeHint(null);
          }
        } else {
          // Ở mặt trước: không làm gì, giữ yên màn hình
          setDragState(DEFAULT_DRAG_STATE);
          setSwipeHint(null);
        }
        return;
      }
    },
    [disabled, flipped, reducedMotion, threshold]
  );

  const resetGesture = useCallback(() => {
    activeTouchIdRef.current = null;
    setIsSwiping(false);
    setSwipeHint(null);
    setDragState(DEFAULT_DRAG_STATE);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (startedOnInteractiveRef.current) {
        startedOnInteractiveRef.current = false;
        return;
      }
      if (disabled || activeTouchIdRef.current === null) {
        resetGesture();
        return;
      }

      const touch = Array.from(e.changedTouches).find((t) => t.identifier === activeTouchIdRef.current);
      if (!touch) {
        resetGesture();
        return;
      }

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const distance = Math.hypot(deltaX, deltaY);
      const duration = Date.now() - startTimeRef.current;

      let gestureWasHandled = false;

      // Chỉ kích hoạt swipe nếu hoàn thành trong khoảng thời gian cho phép (<= maxDuration)
      if (duration <= maxDuration) {
        // Quy tắc A: Vuốt ngang (abs(deltaX) > abs(deltaY) * 1.25)
        if (absX > absY * 1.25 && absX >= threshold) {
          if (deltaX > 0) {
            // Vuốt từ trái sang phải -> Previous / Back
            onPrev();
            gestureWasHandled = true;
          } else {
            // Vuốt từ phải sang trái -> Next
            onNext();
            gestureWasHandled = true;
          }
        }
        // Quy tắc B: Vuốt từ dưới lên (deltaY <= -threshold) -> Lật mặt trước sang mặt sau
        else if (!inScrollAreaRef.current && absY > absX * 1.25 && deltaY <= -threshold) {
          onSwipeUp();
          gestureWasHandled = true;
        }
        // Quy tắc C: Vuốt từ trên xuống (deltaY >= threshold) -> Lật mặt sau về mặt trước
        else if (!inScrollAreaRef.current && absY > absX * 1.25 && deltaY >= threshold) {
          onSwipeDown();
          gestureWasHandled = true;
        }
      }

      // Quy tắc D: Chạm nhanh vào vùng trống (Tap-to-flip trực tiếp tại touchend)
      if (!gestureWasHandled && distance <= 12 && duration <= 350) {
        onTap();
        gestureWasHandled = true;
      }

      // Kích hoạt chặn click giả phát sinh ngay sau touchend để không bị lật 2 lần (Double Flip)
      if (gestureWasHandled) {
        setSuppressNextClick();
      }

      resetGesture();
    },
    [disabled, maxDuration, onNext, onPrev, onSwipeDown, onSwipeUp, onTap, resetGesture, setSuppressNextClick, threshold]
  );

  const handleTouchCancel = useCallback(() => {
    startedOnInteractiveRef.current = false;
    suppressNextClickRef.current = false;
    if (suppressClickTimerRef.current) {
      clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
    resetGesture();
  }, [resetGesture]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;

      // Nếu click do trình duyệt mobile phát sinh sau touchend -> Chặn ngay!
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        if (suppressClickTimerRef.current) {
          clearTimeout(suppressClickTimerRef.current);
          suppressClickTimerRef.current = null;
        }
        return;
      }

      const target = e.target as HTMLElement | null;
      if (isInteractiveChild(target)) {
        return;
      }

      // Chạm nhanh bằng chuột trên desktop -> gọi onTap
      onTap();
    },
    [disabled, onTap]
  );

  useEffect(() => {
    return () => {
      if (suppressClickTimerRef.current) clearTimeout(suppressClickTimerRef.current);
    };
  }, []);

  // Tính inline CSS style cho card khi đang kéo ngón tay
  const dragStyle: React.CSSProperties = reducedMotion
    ? {}
    : {
        transform: `translate3d(${dragState.x}px, ${dragState.y}px, 0) rotate(${dragState.rotate}deg)`,
        opacity: dragState.opacity,
        transition: isSwiping ? 'none' : 'transform 0.22s ease-out, opacity 0.22s ease-out',
        willChange: isSwiping ? 'transform, opacity' : 'auto',
      };

  return {
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
    handleClick,
    dragStyle,
    isSwiping,
    swipeHint,
  };
}
