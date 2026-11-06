export type FlashcardLayoutMode = 'portrait' | 'landscape-compact' | 'landscape-wide' | 'desktop';

/**
 * Xác định chế độ bố cục tối ưu dựa trên kích thước khung nhìn thực tế
 */
export function getFlashcardLayoutMode(width: number, height: number): FlashcardLayoutMode {
  const isLandscape = width > height;

  if (!isLandscape) {
    return 'portrait';
  }

  // Màn hình ngang có chiều cao nhỏ (điện thoại xoay ngang, ví dụ iPhone 320px - 430px)
  if (height <= 560) {
    return 'landscape-compact';
  }

  // Tablet landscape hoặc màn hình vừa (height 561px - 800px)
  if (width < 1024) {
    return 'landscape-wide';
  }

  // Desktop lớn
  return 'desktop';
}

/**
 * Tính toán kích thước chữ Kanji mặt trước tăng gấp ~2 lần hiện tại,
 * tự động co giãn theo số lượng ký tự và hướng màn hình.
 */
export function getKanjiSizeStyle(
  text: string,
  layoutMode: FlashcardLayoutMode
): { fontSize: string; lineHeight: string } {
  const charCount = (text || '').trim().length;
  const isCompact = layoutMode === 'landscape-compact';
  const isLandscapeWide = layoutMode === 'landscape-wide';

  // 1. Trường hợp từ ngắn: 1 - 2 ký tự (Ví dụ: 特, 学校, 本, 食)
  if (charCount <= 2) {
    if (isCompact) {
      // Landscape điện thoại (chiều cao 320 - 430px)
      return { fontSize: 'clamp(3.5rem, 15vh, 5.5rem)', lineHeight: '1.05' };
    }
    if (isLandscapeWide) {
      return { fontSize: 'clamp(5rem, 12vw, 7.5rem)', lineHeight: '1.05' };
    }
    // Portrait điện thoại & Tablet: Gấp 2 lần kích thước cũ (cũ là 3rem - 4rem)
    return { fontSize: 'clamp(5rem, 24vw, 8rem)', lineHeight: '1.05' };
  }

  // 2. Trường hợp từ vừa: 3 ký tự (Ví dụ: 自動車, 専門家)
  if (charCount === 3) {
    if (isCompact) {
      return { fontSize: 'clamp(2.8rem, 13vh, 4.5rem)', lineHeight: '1.1' };
    }
    return { fontSize: 'clamp(4rem, 18vw, 6.5rem)', lineHeight: '1.1' };
  }

  // 3. Trường hợp 4 - 5 ký tự (Ví dụ: 一期一会, 高等学校)
  if (charCount <= 5) {
    if (isCompact) {
      return { fontSize: 'clamp(2.2rem, 10vh, 3.4rem)', lineHeight: '1.15' };
    }
    return { fontSize: 'clamp(3rem, 14vw, 5rem)', lineHeight: '1.15' };
  }

  // 4. Trường hợp từ dài: 6+ ký tự (Tự co giãn an toàn, không tràn khung)
  if (isCompact) {
    return { fontSize: 'clamp(1.7rem, 8vh, 2.6rem)', lineHeight: '1.2' };
  }
  return { fontSize: 'clamp(2.4rem, 10vw, 3.8rem)', lineHeight: '1.2' };
}

/**
 * Kích thước Kanji tiêu đề ở mặt sau (tăng khoảng 1.5 - 2 lần hiện tại nhưng nhỏ hơn mặt trước)
 */
export function getBackKanjiSizeStyle(
  charCount: number,
  isCompactLandscape: boolean
): { fontSize: string } {
  if (isCompactLandscape) {
    return { fontSize: charCount <= 2 ? '1.5rem' : '1.25rem' };
  }
  return { fontSize: charCount <= 2 ? '2rem' : '1.5rem' };
}
