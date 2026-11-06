import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Lesson, User, VocabularyItem, VocabProgress, FlashcardSettings, MasteryStatus } from '@/types';
import {
  loadVocabItems, loadAllVocabItems, upsertVocabItems, updateVocabItem,
  loadVocabProgress, saveVocabProgress,
  loadFlashcardSettings, saveFlashcardSettings,
  getMasteryStatusLabel, getMasteryStatusColor,
} from '@/storage';
import type { VocabularyStudyGroup } from '@/lib/vocabStudyGroupService';
import {
  STUDY_GROUP_CONFIGS,
  STUDY_GROUP_KEYS,
  countVocabularyByStudyGroup,
  filterVocabularyByStudyGroup,
  buildVocabularyStudySession,
  calculateNextReviewAt,
} from '@/lib/vocabStudyGroupService';
import { toast } from './Toast';
import { VocabFlashcard } from './VocabFlashcard';
import { VocabStudyGroupPicker } from './VocabStudyGroupPicker';
import { VocabManualAddModal } from './VocabManualAddModal';
import { VocabImportModal } from './VocabImportModal';
import {
  ArrowLeft, Layers, List, BarChart3, Settings, Search,
  CheckCircle2, Volume2, RefreshCw, BookOpen, Plus, ChevronDown,
  Edit3, FileSpreadsheet,
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface VocabLessonDetailViewProps {
  lesson: Lesson;
  currentUser: User;
  canManage: boolean;
  onBack: () => void;
  onMarkDone: (id: string) => void;
  completed: boolean;
}

type Tab = 'flashcard' | 'list' | 'stats' | 'settings';

export function VocabLessonDetailView({
  lesson, currentUser, canManage, onBack, onMarkDone, completed,
}: VocabLessonDetailViewProps) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<Tab>('flashcard');
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [allSystemVocab, setAllSystemVocab] = useState<VocabularyItem[]>([]);
  const [progress, setProgress] = useState<Record<string, VocabProgress>>({});
  const [settings, setSettings] = useState<FlashcardSettings>(() => loadFlashcardSettings(currentUser.id));
  const [loading, setLoading] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [listJlptFilter, setListJlptFilter] = useState<string>('all');
  const [listGroupFilter, setListGroupFilter] = useState<VocabularyStudyGroup>('all');
  const [selectedStudyGroup, setSelectedStudyGroup] = useState<VocabularyStudyGroup | null>(null);

  // Modal & Menu states for adding vocabulary
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    };
    if (showAddMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showAddMenu]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [vocabItems, prog] = await Promise.all([
        loadVocabItems(lesson.id),
        Promise.resolve(loadVocabProgress(currentUser.id, lesson.id)),
      ]);
      setItems(vocabItems.filter((v) => v.active));
      setProgress(prog);
      setLoading(false);
    })();
  }, [lesson.id, currentUser.id]);

  // Load all system vocab items for cross-lesson duplicate checks when user can manage
  useEffect(() => {
    if (canManage) {
      loadAllVocabItems()
        .then(setAllSystemVocab)
        .catch((e) => console.warn('Cannot load all vocab items:', e));
    }
  }, [canManage]);

  const viewedBackIds = useMemo(() => {
    const s = new Set<string>();
    for (const [itemId, p] of Object.entries(progress)) {
      if (p.viewedBack) s.add(itemId);
    }
    return s;
  }, [progress]);

  const stats = useMemo(() => {
    const total = items.length;
    const viewed = viewedBackIds.size;
    const evaluated = Object.values(progress).filter((p) => p.masteryStatus !== 'new').length;
    const totalReviews = Object.values(progress).reduce((sum, p) => sum + p.reviewCount, 0);
    const masteryDist: Record<MasteryStatus, number> = {
      new: 0, forgot: 0, hard: 0, almost: 0, mastered: 0,
    };
    for (const item of items) {
      const p = progress[item.id];
      masteryDist[p?.masteryStatus ?? 'new']++;
    }
    const progressPct = total > 0 ? Math.round((evaluated / total) * 100) : 0;
    return { total, viewed, evaluated, totalReviews, masteryDist, progressPct };
  }, [items, progress, viewedBackIds]);

  const groupCounts = useMemo(() => {
    return countVocabularyByStudyGroup(items, progress);
  }, [items, progress]);

  const sessionItems = useMemo(() => {
    if (!selectedStudyGroup) return [];
    return buildVocabularyStudySession(items, progress, selectedStudyGroup);
  }, [items, progress, selectedStudyGroup]);

  const handleEvaluate = useCallback((item: VocabularyItem, status: MasteryStatus): boolean => {
    try {
      const existing = progress[item.id];
      const nextReviewCount = (existing?.reviewCount ?? 0) + 1;
      const nextReviewAt = calculateNextReviewAt(status, nextReviewCount);
      const newProgress: VocabProgress = {
        masteryStatus: status,
        reviewCount: nextReviewCount,
        lastReviewedAt: new Date().toISOString(),
        nextReviewAt,
        viewedBack: true,
      };
      saveVocabProgress(currentUser.id, lesson.id, item.id, newProgress);
      setProgress((prev) => ({ ...prev, [item.id]: newProgress }));

      if (stats.evaluated + 1 >= stats.total && stats.total > 0) {
        if (!completed) onMarkDone(lesson.id);
        toast(t('vocab.toast.completed'), 'success');
      }
      return true;
    } catch (err) {
      console.error('Lỗi khi lưu progress từ vựng:', err);
      return false;
    }
  }, [progress, currentUser.id, lesson.id, stats, completed, onMarkDone, t]);

  const handleFlipView = useCallback((itemId: string) => {
    if (viewedBackIds.has(itemId)) return;
    const existing = progress[itemId];
    const newProgress: VocabProgress = {
      masteryStatus: existing?.masteryStatus ?? 'new',
      reviewCount: existing?.reviewCount ?? 0,
      lastReviewedAt: existing?.lastReviewedAt ?? null,
      viewedBack: true,
    };
    saveVocabProgress(currentUser.id, lesson.id, itemId, newProgress);
    setProgress((prev) => ({ ...prev, [itemId]: newProgress }));
  }, [progress, currentUser.id, lesson.id, viewedBackIds]);

  const handleSaveSettings = (newSettings: FlashcardSettings) => {
    setSettings(newSettings);
    saveFlashcardSettings(currentUser.id, newSettings);
    toast(t('vocab.toast.settingsSaved'), 'success');
  };

  const handleVocabSaved = (savedItem: VocabularyItem, action: 'created' | 'updated') => {
    if (action === 'created') {
      setItems((prev) => [...prev, savedItem]);
    } else {
      setItems((prev) => prev.map((v) => (v.id === savedItem.id ? savedItem : v)));
    }
  };

  const handleExcelImport = async (
    _lessons: Lesson[],
    newVocabs: VocabularyItem[],
    updatedVocabs?: VocabularyItem[]
  ) => {
    try {
      if (newVocabs.length > 0) {
        await upsertVocabItems(newVocabs);
      }
      if (updatedVocabs && updatedVocabs.length > 0) {
        for (const uv of updatedVocabs) {
          await updateVocabItem(uv.id, uv);
        }
      }
      // Tải lại danh sách từ vựng tươi mới từ database để cập nhật giao diện bên dưới
      const freshItems = await loadVocabItems(lesson.id);
      setItems(freshItems.filter((v) => v.active));
    } catch (err: unknown) {
      console.error('Lỗi khi lưu từ vựng từ Excel:', err);
      toast('Có lỗi xảy ra khi lưu từ vựng vào hệ thống.', 'error');
      throw err; // Bắn ra để VocabImportModal giải phóng loading state
    }
  };

  const filteredListItems = useMemo(() => {
    const groupFiltered = filterVocabularyByStudyGroup(items, progress, listGroupFilter);

    return groupFiltered.filter((v) => {
      const matchJlpt = listJlptFilter === 'all' || v.jlptLevel === listJlptFilter;
      if (!matchJlpt) return false;

      if (!listSearch) return true;
      const s = listSearch.toLowerCase();
      return (
        v.vocabulary.toLowerCase().includes(s) ||
        v.readingHiragana.toLowerCase().includes(s) ||
        v.meaningVi.toLowerCase().includes(s) ||
        (v.hanViet && v.hanViet.toLowerCase().includes(s)) ||
        (v.kanjiBreakdown && v.kanjiBreakdown.some((k) =>
          k.kanji.toLowerCase().includes(s) ||
          k.hanViet.toLowerCase().includes(s) ||
          k.meaningVi.toLowerCase().includes(s)
        ))
      );
    });
  }, [items, progress, listGroupFilter, listJlptFilter, listSearch]);

  const jlptLevels = useMemo(() => {
    const set = new Set(items.map((v) => v.jlptLevel).filter(Boolean));
    return Array.from(set).sort();
  }, [items]);

  const tabs: { id: Tab; label: string; icon: typeof Layers }[] = [
    { id: 'flashcard', label: t('vocab.tab.flashcard'), icon: Layers },
    { id: 'list', label: t('vocab.tab.list'), icon: List },
    { id: 'stats', label: t('vocab.tab.stats'), icon: BarChart3 },
    { id: 'settings', label: t('vocab.tab.settings'), icon: Settings },
  ];

  return (
    <div className="pb-28 md:px-0 md:pb-8">
      {/* Top bar */}
      <div className="sticky top-[57px] z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800">{lesson.title}</p>
            <p className="truncate text-xs text-slate-400">{t('vocab.countSummary', { total: items.length, evaluated: stats.evaluated })}</p>
          </div>
          {completed ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={14} /> {t('lessonDetail.done')}
            </span>
          ) : (
            <button onClick={() => onMarkDone(lesson.id)}
              className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
              {t('lessonDetail.markDone')}
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-all ${
                tab === id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 md:px-0 md:pt-6 md:max-w-4xl md:mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <RefreshCw size={32} className="mb-3 animate-spin text-slate-300" />
            <p className="text-sm text-slate-400">{t('vocab.loading')}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen size={48} className="mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">{t('vocab.empty')}</p>
            {canManage && (
              <div className="mt-4 flex flex-col sm:flex-row items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualAddModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm active:scale-95 transition-all"
                >
                  <Edit3 size={15} /> Thêm từ đầu tiên bằng tay
                </button>
                <button
                  type="button"
                  onClick={() => setShowExcelImportModal(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs active:scale-95 transition-all"
                >
                  <FileSpreadsheet size={15} className="text-emerald-600" /> Nhập từ file Excel
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {tab === 'flashcard' && (
              selectedStudyGroup === null ? (
                <VocabStudyGroupPicker
                  counts={groupCounts}
                  onSelectGroup={(g) => setSelectedStudyGroup(g)}
                  lessonTitle={lesson.title}
                />
              ) : (
                <VocabFlashcard
                  items={sessionItems}
                  settings={settings}
                  onEvaluate={handleEvaluate}
                  onFlipBack={handleFlipView}
                  viewedBackIds={viewedBackIds}
                  onClose={() => {
                    setSelectedStudyGroup(null);
                    setTab('list');
                  }}
                  onBackToGroupPicker={() => setSelectedStudyGroup(null)}
                  studyGroup={selectedStudyGroup}
                  onChangeStudyGroup={(newGroup) => setSelectedStudyGroup(newGroup)}
                  groupCounts={groupCounts}
                  lessonTitle={lesson.title}
                />
              )
            )}

            {tab === 'list' && (
              <div>
                {/* Search & Action Toolbar */}
                <div className="mb-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="relative flex-1">
                    <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={listSearch}
                      onChange={(e) => setListSearch(e.target.value)}
                      placeholder={t('vocab.searchPlaceholder')}
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {/* Nút + Bổ sung từ vựng (Chỉ Admin / Teacher có canManage mới thấy) */}
                  {canManage && (
                    <div ref={addMenuRef} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowAddMenu((prev) => !prev)}
                        className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
                      >
                        <Plus size={16} />
                        <span>+ Bổ sung từ vựng</span>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${showAddMenu ? 'rotate-180' : ''}`} />
                      </button>

                      {/* Dropdown Menu */}
                      {showAddMenu && (
                        <div className="absolute right-0 top-full mt-1.5 z-30 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-scale-in">
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddMenu(false);
                              setShowManualAddModal(true);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 size={15} className="text-indigo-500" />
                            <span>1. Thêm bằng tay</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddMenu(false);
                              setShowExcelImportModal(true);
                            }}
                            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                          >
                            <FileSpreadsheet size={15} className="text-emerald-500" />
                            <span>2. Nhập bằng Excel</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Filters */}
                <div className="mb-4 flex flex-wrap gap-2">
                  {jlptLevels.map((lv) => (
                    <button
                      key={lv}
                      onClick={() => setListJlptFilter(listJlptFilter === lv ? 'all' : lv)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                        listJlptFilter === lv ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {lv}
                    </button>
                  ))}
                  {STUDY_GROUP_KEYS.map((gKey) => {
                    const cfg = STUDY_GROUP_CONFIGS[gKey];
                    const count = groupCounts[gKey] ?? 0;
                    const isSelected = listGroupFilter === gKey;
                    return (
                      <button
                        key={gKey}
                        type="button"
                        onClick={() => setListGroupFilter(listGroupFilter === gKey && gKey !== 'all' ? 'all' : gKey)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>{cfg.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Vocab list */}
                {filteredListItems.length > 0 ? (
                  <div className="space-y-2">
                    {filteredListItems.map((v) => {
                      const p = progress[v.id];
                      const ms = p?.masteryStatus ?? 'new';
                      return (
                        <div key={v.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-jp text-base font-bold text-slate-800">{v.vocabulary}</p>
                                {v.hanViet && (
                                  <span className="rounded-md bg-purple-50 border border-purple-200/70 px-2 py-0.5 text-[11px] font-bold text-purple-700 uppercase">
                                    {v.hanViet}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if ('speechSynthesis' in window) {
                                      window.speechSynthesis.cancel();
                                      const utt = new SpeechSynthesisUtterance(v.audioText || v.readingHiragana || v.vocabulary);
                                      utt.lang = 'ja-JP';
                                      window.speechSynthesis.speak(utt);
                                    } else {
                                      toast(t('vocab.noSpeechSupport'), 'error');
                                    }
                                  }}
                                  aria-label="Phát âm từ vựng"
                                  className="text-slate-400 hover:text-blue-500 transition-colors p-0.5"
                                >
                                  <Volume2 size={16} />
                                </button>
                              </div>
                              {v.readingHiragana && (
                                <p className="font-jp text-xs font-medium text-blue-600 mt-0.5">{v.readingHiragana}</p>
                              )}
                              <p className="text-sm text-emerald-800 font-medium mt-1">{v.meaningVi}</p>

                              {/* Kanji Breakdown tóm tắt */}
                              {v.kanjiBreakdown && v.kanjiBreakdown.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {v.kanjiBreakdown.map((k, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 rounded bg-indigo-50/70 border border-indigo-100 px-2 py-0.5 text-[10px] text-indigo-900">
                                      <strong className="font-jp text-xs">{k.kanji}</strong>: <span className="font-semibold uppercase text-purple-700">{k.hanViet}</span> ({k.meaningVi})
                                    </span>
                                  ))}
                                </div>
                              )}
                              {v.kanjiMemoryHint && (
                                <p className="mt-1.5 text-[11px] text-amber-900 bg-amber-50 border border-amber-200/60 rounded-md px-2 py-0.5 inline-flex items-center gap-1">
                                  <span>💡</span> {v.kanjiMemoryHint}
                                </p>
                              )}
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                                {v.jlptLevel && <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-600">{v.jlptLevel}</span>}
                                {v.wordType && <span>{v.wordType}</span>}
                                {v.tags && <span>{v.tags}</span>}
                                <span>{t('vocab.reviewCount', { count: p?.reviewCount ?? 0 })}</span>
                              </div>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getMasteryStatusColor(ms)}`}>
                              {getMasteryStatusLabel(ms)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Search size={36} className="mb-2 text-slate-300" />
                    <p className="text-sm text-slate-400">{t('vocab.emptyFiltered')}</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'stats' && (
              <div className="space-y-4">
                {/* Progress bar */}
                <div className="rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-5 text-white shadow-md">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">{t('vocab.progressTitle')}</span>
                    <span className="font-bold">{stats.progressPct}%</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${stats.progressPct}%` }} />
                  </div>
                </div>
                {/* Stats cards */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {[
                    { label: t('vocab.stat.total'), value: stats.total, color: 'text-slate-700' },
                    { label: t('vocab.stat.viewed'), value: stats.viewed, color: 'text-blue-600' },
                    { label: t('vocab.stat.evaluated'), value: stats.evaluated, color: 'text-indigo-600' },
                    { label: t('vocab.stat.reviews'), value: stats.totalReviews, color: 'text-emerald-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
                {/* Mastery distribution */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-bold text-slate-700 uppercase tracking-wider">{t('vocab.masteryTitle')}</p>
                  <div className="space-y-2">
                    {(['mastered', 'almost', 'hard', 'forgot', 'new'] as MasteryStatus[]).map((ms) => {
                      const count = stats.masteryDist[ms];
                      const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                      return (
                        <div key={ms} className="flex items-center gap-3">
                          <span className="w-20 text-xs text-slate-600">{getMasteryStatusLabel(ms)}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-12 text-right text-xs text-slate-400">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-4 text-xs font-bold text-slate-700 uppercase tracking-wider">{t('vocab.settings.title')}</p>
                  <div className="space-y-4">
                    {/* Font size */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('vocab.settings.fontSize')}</label>
                      <div className="flex gap-2">
                        {(['small', 'medium', 'large'] as const).map((fs) => (
                          <button
                            key={fs}
                            onClick={() => handleSaveSettings({ ...settings, fontSize: fs })}
                            className={`rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                              settings.fontSize === fs ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {fs === 'small' ? t('vocab.settings.size.small') : fs === 'medium' ? t('vocab.settings.size.medium') : t('vocab.settings.size.large')}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Toggle switches */}
                    {[
                      { key: 'showHiragana' as const, label: t('vocab.settings.showHiragana') },
                      { key: 'audioEnabled' as const, label: t('vocab.settings.audio') },
                      { key: 'flipAnimation' as const, label: t('vocab.settings.flip3d') },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-slate-700">{label}</span>
                        <button
                          onClick={() => handleSaveSettings({ ...settings, [key]: !settings[key] })}
                          className={`relative h-7 w-12 rounded-full transition-colors ${
                            settings[key] ? 'bg-blue-600' : 'bg-slate-200'
                          }`}
                        >
                          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            settings[key] ? 'left-6' : 'left-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-center text-xs text-slate-400">{t('vocab.settings.perUser')}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Thêm Từ Thủ Công */}
      {showManualAddModal && (
        <VocabManualAddModal
          lesson={lesson}
          existingItems={items}
          allSystemItems={allSystemVocab}
          onClose={() => setShowManualAddModal(false)}
          onSaved={handleVocabSaved}
        />
      )}

      {/* Modal Nhập Bằng Excel vào bài học hiện tại */}
      {showExcelImportModal && (
        <VocabImportModal
          targetLesson={lesson}
          existingItems={items}
          allSystemItems={allSystemVocab}
          onClose={() => setShowExcelImportModal(false)}
          onImport={handleExcelImport}
        />
      )}
    </div>
  );
}
