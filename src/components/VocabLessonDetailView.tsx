import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Lesson, User, VocabularyItem, VocabProgress, FlashcardSettings, MasteryStatus } from '@/types';
import {
  loadVocabItems, loadVocabProgress, saveVocabProgress,
  loadFlashcardSettings, saveFlashcardSettings,
  getMasteryStatusLabel, getMasteryStatusColor,
} from '@/storage';
import { toast } from './Toast';
import { VocabFlashcard } from './VocabFlashcard';
import {
  ArrowLeft, Layers, List, BarChart3, Settings, Search,
  CheckCircle2, Volume2, RefreshCw, BookOpen,
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
  const [progress, setProgress] = useState<Record<string, VocabProgress>>({});
  const [settings, setSettings] = useState<FlashcardSettings>(() => loadFlashcardSettings(currentUser.id));
  const [loading, setLoading] = useState(true);
  const [listSearch, setListSearch] = useState('');
  const [listJlptFilter, setListJlptFilter] = useState<string>('all');
  const [listMasteryFilter, setListMasteryFilter] = useState<string>('all');

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

  const handleEvaluate = useCallback((item: VocabularyItem, status: MasteryStatus) => {
    const existing = progress[item.id];
    const newProgress: VocabProgress = {
      masteryStatus: status,
      reviewCount: (existing?.reviewCount ?? 0) + 1,
      lastReviewedAt: new Date().toISOString(),
      viewedBack: true,
    };
    saveVocabProgress(currentUser.id, lesson.id, item.id, newProgress);
    setProgress((prev) => ({ ...prev, [item.id]: newProgress }));

    if (stats.evaluated + 1 >= stats.total && stats.total > 0) {
      if (!completed) onMarkDone(lesson.id);
      toast(t('vocab.toast.completed'), 'success');
    }
  }, [progress, currentUser.id, lesson.id, stats, completed, onMarkDone]);

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

  const filteredListItems = useMemo(() => {
    return items.filter((v) => {
      const s = listSearch.toLowerCase();
      const matchSearch =
        v.vocabulary.toLowerCase().includes(s) ||
        v.readingHiragana.toLowerCase().includes(s) ||
        v.meaningVi.toLowerCase().includes(s);
      const matchJlpt = listJlptFilter === 'all' || v.jlptLevel === listJlptFilter;
      const p = progress[v.id];
      const mastery = p?.masteryStatus ?? 'new';
      const matchMastery = listMasteryFilter === 'all' || mastery === listMasteryFilter;
      return matchSearch && matchJlpt && matchMastery;
    });
  }, [items, listSearch, listJlptFilter, listMasteryFilter, progress]);

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
              <p className="mt-1 text-xs text-slate-400">{t('vocab.emptyManageHint')}</p>
            )}
          </div>
        ) : (
          <>
            {tab === 'flashcard' && (
              <VocabFlashcard
                items={items}
                settings={settings}
                onEvaluate={handleEvaluate}
                onFlipBack={handleFlipView}
                viewedBackIds={viewedBackIds}
              />
            )}

            {tab === 'list' && (
              <div>
                {/* Search */}
                <div className="relative mb-3">
                  <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                    placeholder={t('vocab.searchPlaceholder')}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
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
                  {(['new', 'forgot', 'hard', 'almost', 'mastered'] as MasteryStatus[]).map((ms) => (
                    <button
                      key={ms}
                      onClick={() => setListMasteryFilter(listMasteryFilter === ms ? 'all' : ms)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                        listMasteryFilter === ms ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
                      }`}
                    >
                      {getMasteryStatusLabel(ms)}
                    </button>
                  ))}
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
                              <div className="flex items-center gap-2">
                                <p className="font-jp text-base font-bold text-slate-800">{v.vocabulary}</p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if ('speechSynthesis' in window) {
                                      window.speechSynthesis.cancel();
                                      const utt = new SpeechSynthesisUtterance(v.audioText || v.vocabulary);
                                      utt.lang = 'ja-JP';
                                      window.speechSynthesis.speak(utt);
                                    } else {
                                      toast(t('vocab.noSpeechSupport'), 'error');
                                    }
                                  }}
                                  className="text-slate-300 hover:text-blue-500 transition-colors"
                                >
                                  <Volume2 size={15} />
                                </button>
                              </div>
                              {v.readingHiragana && (
                                <p className="font-jp text-xs text-blue-500">{v.readingHiragana}</p>
                              )}
                              <p className="text-sm text-emerald-700 font-medium">{v.meaningVi}</p>
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
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-slate-400">{s.label}</p>
                    </div>
                  ))}
                </div>
                {/* Mastery distribution */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">{t('vocab.masteryTitle')}</h3>
                  <div className="space-y-2">
                    {(['new', 'forgot', 'hard', 'almost', 'mastered'] as MasteryStatus[]).map((ms) => {
                      const count = stats.masteryDist[ms];
                      const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                      const barColor = ms === 'forgot' ? 'bg-red-500' : ms === 'hard' ? 'bg-orange-500' : ms === 'almost' ? 'bg-blue-500' : ms === 'mastered' ? 'bg-emerald-500' : 'bg-slate-300';
                      return (
                        <div key={ms} className="flex items-center gap-3">
                          <span className="w-20 text-xs font-medium text-slate-600">{getMasteryStatusLabel(ms)}</span>
                          <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-8 text-right text-xs font-semibold text-slate-700">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">{t('vocab.settings.title')}</h3>
                  <div className="space-y-4">
                    {/* Font size */}
                    <div>
                      <label className="mb-2 block text-xs font-medium text-slate-600">{t('vocab.settings.fontSize')}</label>
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
    </div>
  );
}
