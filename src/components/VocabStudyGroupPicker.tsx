import { useEffect } from 'react';
import type { VocabularyStudyGroup } from '@/lib/vocabStudyGroupService';
import { STUDY_GROUP_CONFIGS, STUDY_GROUP_KEYS } from '@/lib/vocabStudyGroupService';
import {
  Layers, HelpCircle, AlertCircle, Flame, CheckCircle,
  Clock, BookOpen, Sparkles
} from 'lucide-react';

interface VocabStudyGroupPickerProps {
  counts: Record<VocabularyStudyGroup, number>;
  onSelectGroup: (group: VocabularyStudyGroup) => void;
  lessonTitle: string;
}

export function VocabStudyGroupPicker({
  counts,
  onSelectGroup,
  lessonTitle,
}: VocabStudyGroupPickerProps) {
  // Bắt phím tắt 1 - 7 (chỉ khi không đang gõ văn bản)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key >= '1' && e.key <= '7' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const keyIndex = parseInt(e.key, 10) - 1;
        const targetGroup = STUDY_GROUP_KEYS[keyIndex];
        if (targetGroup) {
          e.preventDefault();
          onSelectGroup(targetGroup);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectGroup]);

  const getGroupIcon = (group: VocabularyStudyGroup) => {
    switch (group) {
      case 'all':
        return <Layers size={20} className="text-blue-500" />;
      case 'unlearned':
        return <HelpCircle size={20} className="text-slate-400" />;
      case 'forgot':
        return <AlertCircle size={20} className="text-red-500" />;
      case 'hard':
        return <Flame size={20} className="text-orange-500" />;
      case 'almost':
        return <Sparkles size={20} className="text-blue-500" />;
      case 'mastered':
        return <CheckCircle size={20} className="text-emerald-500" />;
      case 'due':
        return <Clock size={20} className="text-amber-500" />;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-4 sm:py-6 px-2 sm:px-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-semibold mb-2">
          <BookOpen size={14} />
          <span>{lessonTitle}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">
          Bạn muốn học nhóm từ nào?
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-lg mx-auto">
          Chọn nhóm từ vựng phù hợp với mục tiêu học của bạn. Bấm chọn hoặc nhấn phím <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-mono font-bold">1</kbd> - <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[11px] font-mono font-bold">7</kbd>.
        </p>
      </div>

      {/* Grid of study group cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {STUDY_GROUP_KEYS.map((groupKey) => {
          const cfg = STUDY_GROUP_CONFIGS[groupKey];
          const count = counts[groupKey] ?? 0;
          const isDue = groupKey === 'due';
          const isMastered = groupKey === 'mastered';

          return (
            <button
              key={groupKey}
              type="button"
              onClick={() => onSelectGroup(groupKey)}
              aria-label={`Học ${count} từ ${cfg.label}`}
              className={`group relative flex flex-col justify-between p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 text-left shadow-xs hover:shadow-md active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                cfg.cardBgClass
              } ${cfg.cardBorderClass} ${
                count === 0 ? 'opacity-70' : ''
              }`}
            >
              {/* Top row: Icon & Shortcut tag */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 transition-colors group-hover:bg-white">
                  {getGroupIcon(groupKey)}
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {cfg.shortcutKey}
                </span>
              </div>

              {/* Group Name & Description */}
              <div className="min-w-0 mb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                    {cfg.label}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                  {cfg.description}
                </p>
              </div>

              {/* Bottom: Count Badge */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.badgeClass}`}>
                  {count} từ
                </span>
                {count > 0 && (
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                    Bắt đầu →
                  </span>
                )}
                {count === 0 && (
                  <span className="text-[10px] text-slate-400 italic">
                    Trống
                  </span>
                )}
              </div>

              {/* Highlight badge for 'due' if has count */}
              {isDue && count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                </span>
              )}

              {/* Star for mastered */}
              {isMastered && count > 0 && (
                <div className="absolute top-2 right-8 text-emerald-500/20 group-hover:text-emerald-500/40 transition-colors pointer-events-none">
                  <CheckCircle size={28} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

