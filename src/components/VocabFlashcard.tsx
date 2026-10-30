import { useState, useEffect, useCallback, useRef } from 'react';
import type { VocabularyItem, FlashcardSettings, MasteryStatus } from '@/types';
import { getMasteryStatusLabel } from '@/storage';
import { Volume2, ChevronLeft, ChevronRight, Shuffle, Eye, EyeOff } from 'lucide-react';

interface VocabFlashcardProps {
  items: VocabularyItem[];
  settings: FlashcardSettings;
  onEvaluate: (item: VocabularyItem, status: MasteryStatus) => void;
  onFlipBack: (itemId: string) => void;
  viewedBackIds: Set<string>;
}

const FONT_SIZE_MAP: Record<FlashcardSettings['fontSize'], string> = {
  small: 'text-3xl md:text-4xl',
  medium: 'text-5xl md:text-6xl',
  large: 'text-6xl md:text-7xl',
};

export function VocabFlashcard({ items, settings, onEvaluate, onFlipBack, viewedBackIds }: VocabFlashcardProps) {
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    setOrder(items.map((_, i) => i));
    setPos(0);
    setFlipped(false);
  }, [items]);

  const currentIdx = order[pos];
  const current = items[currentIdx];

  const speak = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!settings.audioEnabled) return;
    if (!('speechSynthesis' in window)) {
      alert('Trình duyệt này không hỗ trợ phát âm.');
      return;
    }
    window.speechSynthesis.cancel();
    const text = current?.audioText || current?.vocabulary || '';
    if (!text) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'ja-JP';
    utteranceRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [current, settings.audioEnabled]);

  useEffect(() => {
    return () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
  }, []);

  const flip = useCallback(() => {
    setFlipped((f) => {
      if (!f && current) onFlipBack(current.id);
      return !f;
    });
  }, [current, onFlipBack]);

  const next = useCallback(() => {
    setFlipped(false);
    setTimeout(() => setPos((p) => (p + 1) % items.length), 50);
  }, [items.length]);

  const prev = useCallback(() => {
    setFlipped(false);
    setTimeout(() => setPos((p) => (p - 1 + items.length) % items.length), 50);
  }, [items.length]);

  const shuffle = useCallback(() => {
    setFlipped(false);
    setOrder((prevOrder) => {
      const arr = [...prevOrder];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
    setPos(0);
  }, []);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }, [flip, next, prev]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  if (!current) return null;

  const hasViewedBack = viewedBackIds.has(current.id);
  const totalReviewed = viewedBackIds.size;

  const evaluate = (status: MasteryStatus) => {
    onEvaluate(current, status);
    next();
  };

  const evalButtons: { status: MasteryStatus; color: string }[] = [
    { status: 'forgot', color: 'bg-red-500 hover:bg-red-600 text-white' },
    { status: 'hard', color: 'bg-orange-500 hover:bg-orange-600 text-white' },
    { status: 'almost', color: 'bg-blue-500 hover:bg-blue-600 text-white' },
    { status: 'mastered', color: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
  ];

  return (
    <div className="flex flex-col items-center">
      {/* Counter + stats */}
      <div className="mb-4 flex w-full items-center justify-between text-xs text-slate-500">
        <span className="font-medium">Thẻ {pos + 1} / {items.length}</span>
        <div className="flex items-center gap-3">
          <span>Ôn tập: {totalReviewed}</span>
          <span>Đã đánh giá: {Array.from(viewedBackIds).filter(id => viewedBackIds.has(id)).length}</span>
        </div>
      </div>

      {/* Flashcard */}
      <div
        className={`flashcard-3d w-full ${settings.flipAnimation ? '' : ''}`}
        style={{ height: '420px' }}
        onClick={flip}
        role="button"
        tabIndex={0}
      >
        <div className={`flashcard-inner ${flipped ? 'flipped' : ''}`}>
          {/* Front face */}
          <div className="flashcard-face flashcard-front flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="absolute top-4 right-4 flex items-center gap-2">
              {current.jlptLevel && (
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700">{current.jlptLevel}</span>
              )}
              {current.wordType && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600">{current.wordType}</span>
              )}
            </div>
            <button onClick={speak} className="absolute top-4 left-4 flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
              <Volume2 size={18} />
            </button>
            <p className={`font-jp font-bold text-slate-900 ${FONT_SIZE_MAP[settings.fontSize]} leading-tight`}>
              {current.vocabulary}
            </p>
            {settings.showHiragana && current.readingHiragana && (
              <p className="font-jp mt-3 text-lg text-blue-600">{current.readingHiragana}</p>
            )}
            <p className="mt-2 text-sm font-medium text-emerald-700">{current.meaningVi}</p>
            {current.onyomi && (
              <p className="mt-1 text-xs text-slate-400">音読み: {current.onyomi}</p>
            )}
            {current.kunyomi && (
              <p className="mt-0.5 text-xs text-slate-400">訓読み: {current.kunyomi}</p>
            )}
            {current.relatedWords.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {current.relatedWords.map((rw, i) => (
                  <span key={i} className="font-jp rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">{rw}</span>
                ))}
              </div>
            )}
            {current.tags && (
              <p className="mt-2 text-[10px] text-slate-400">{current.tags}</p>
            )}
            <p className="absolute bottom-4 text-[10px] text-slate-300">
              {flipped ? '' : 'Nhấn để lật thẻ'}
            </p>
          </div>
          {/* Back face */}
          <div className="flashcard-face flashcard-back flex flex-col items-center justify-start rounded-3xl border border-slate-200 bg-white p-6 shadow-lg overflow-y-auto">
            <button onClick={speak} className="absolute top-4 left-4 flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors z-10">
              <Volume2 size={18} />
            </button>
            <p className="font-jp mb-3 text-xl font-bold text-slate-800">{current.vocabulary}</p>
            {current.exampleJp1 && (
              <div className="mb-4 w-full rounded-xl bg-slate-50 p-3">
                <p className="font-jp text-sm font-semibold text-slate-800 leading-relaxed">{current.exampleJp1}</p>
                {current.exampleReading1 && (
                  <p className="font-jp mt-1 text-xs text-blue-500">{current.exampleReading1}</p>
                )}
                <p className="mt-1 text-xs text-emerald-700">{current.exampleVi1}</p>
              </div>
            )}
            {current.exampleJp2 && (
              <div className="mb-2 w-full rounded-xl bg-slate-50 p-3">
                <p className="font-jp text-sm font-semibold text-slate-800 leading-relaxed">{current.exampleJp2}</p>
                {current.exampleReading2 && (
                  <p className="font-jp mt-1 text-xs text-blue-500">{current.exampleReading2}</p>
                )}
                <p className="mt-1 text-xs text-emerald-700">{current.exampleVi2}</p>
              </div>
            )}
            {!current.exampleJp1 && !current.exampleJp2 && (
              <p className="text-sm text-slate-400">Chưa có câu ví dụ cho từ này</p>
            )}
            <p className="mt-auto pt-2 text-[10px] text-slate-300">Nhấn để quay lại mặt trước</p>
          </div>
        </div>
      </div>

      {/* Navigation controls */}
      <div className="mt-5 flex w-full items-center justify-center gap-3">
        <button onClick={prev} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
          <ChevronLeft size={22} />
        </button>
        <button onClick={shuffle} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
          <Shuffle size={16} /> Xáo trộn
        </button>
        <button onClick={next} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-all">
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Evaluation buttons - only after viewing back */}
      <div className="mt-4 w-full">
        {!hasViewedBack ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-xs text-slate-400">
            <EyeOff size={16} /> Lật thẻ để xem mặt sau trước khi đánh giá
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {evalButtons.map(({ status, color }) => (
              <button
                key={status}
                onClick={() => evaluate(status)}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold shadow-sm active:scale-95 transition-all ${color}`}
              >
                <Eye size={15} /> {getMasteryStatusLabel(status)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
