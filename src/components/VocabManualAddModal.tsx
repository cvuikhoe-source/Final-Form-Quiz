import { useState } from 'react';
import type { Lesson, VocabularyItem, KanjiBreakdownItem } from '@/types';
import { generateId, upsertVocabItems, updateVocabItem } from '@/storage';
import {
  findVocabularyDuplicates,
  buildVocabularyMergePlan,
  VocabularyMergePlan,
} from '@/lib/vocabDuplicateMergeService';
import { VocabConflictResolveModal } from './VocabConflictResolveModal';
import { toast } from './Toast';
import {
  X, Plus, Trash2, CheckCircle2, BookOpen, Sparkles,
} from 'lucide-react';

interface VocabManualAddModalProps {
  lesson: Lesson;
  existingItems: VocabularyItem[];
  allSystemItems?: VocabularyItem[];
  onClose: () => void;
  onSaved: (item: VocabularyItem, action: 'created' | 'updated') => void;
}

export function VocabManualAddModal({
  lesson,
  existingItems,
  allSystemItems = [],
  onClose,
  onSaved,
}: VocabManualAddModalProps) {
  // Form State
  const [vocabulary, setVocabulary] = useState('');
  const [readingHiragana, setReadingHiragana] = useState('');
  const [readingRomaji, setReadingRomaji] = useState('');
  const [meaningVi, setMeaningVi] = useState('');
  const [hanViet, setHanViet] = useState('');
  const [jlptLevel, setJlptLevel] = useState(lesson.title.includes('N3') ? 'N3' : lesson.title.includes('N2') ? 'N2' : 'N3');
  const [wordType, setWordType] = useState('Danh từ');
  const [onyomi, setOnyomi] = useState('');
  const [kunyomi, setKunyomi] = useState('');
  const [kanjiMemoryHint, setKanjiMemoryHint] = useState('');
  const [tags, setTags] = useState('');
  const [relatedWordsStr, setRelatedWordsStr] = useState('');
  const [audioText, setAudioText] = useState('');
  const [active, setActive] = useState(true);

  // Ví dụ 1 & 2
  const [exampleJp1, setExampleJp1] = useState('');
  const [exampleReading1, setExampleReading1] = useState('');
  const [exampleVi1, setExampleVi1] = useState('');
  const [exampleJp2, setExampleJp2] = useState('');
  const [exampleReading2, setExampleReading2] = useState('');
  const [exampleVi2, setExampleVi2] = useState('');

  // Kanji Breakdown list
  const [kanjiList, setKanjiList] = useState<KanjiBreakdownItem[]>([]);

  // Conflict modal state
  const [conflictPlan, setConflictPlan] = useState<VocabularyMergePlan | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addKanjiRow = () => {
    setKanjiList((prev) => [
      ...prev,
      { kanji: '', hanViet: '', meaningVi: '', onyomi: '', kunyomi: '' },
    ]);
  };

  const removeKanjiRow = (index: number) => {
    setKanjiList((prev) => prev.filter((_, i) => i !== index));
  };

  const updateKanjiRow = (index: number, updates: Partial<KanjiBreakdownItem>) => {
    setKanjiList((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanVocab = vocabulary.trim();
    const cleanHira = readingHiragana.trim();
    const cleanMeaning = meaningVi.trim();

    if (!cleanVocab) {
      toast('Vui lòng nhập từ vựng tiếng Nhật (Kanji/Kana).', 'error');
      return;
    }
    if (!cleanHira) {
      toast('Vui lòng nhập cách đọc Hiragana.', 'error');
      return;
    }
    if (!cleanMeaning) {
      toast('Vui lòng nhập ý nghĩa tiếng Việt.', 'error');
      return;
    }

    const cleanRelated = relatedWordsStr
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    const validKanjiBreakdown = kanjiList
      .filter((k) => k.kanji && k.kanji.trim())
      .map((k) => ({
        kanji: k.kanji.trim(),
        hanViet: (k.hanViet || '').trim(),
        meaningVi: (k.meaningVi || '').trim(),
        onyomi: (k.onyomi || '').trim() || undefined,
        kunyomi: (k.kunyomi || '').trim() || undefined,
      }));

    const incomingData: Partial<VocabularyItem> = {
      vocabulary: cleanVocab,
      readingHiragana: cleanHira,
      readingRomaji: readingRomaji.trim(),
      meaningVi: cleanMeaning,
      hanViet: hanViet.trim(),
      jlptLevel: jlptLevel.trim(),
      wordType: wordType.trim(),
      onyomi: onyomi.trim(),
      kunyomi: kunyomi.trim(),
      kanjiMemoryHint: kanjiMemoryHint.trim(),
      tags: tags.trim(),
      relatedWords: cleanRelated,
      audioText: audioText.trim() || cleanHira || cleanVocab,
      exampleJp1: exampleJp1.trim(),
      exampleReading1: exampleReading1.trim(),
      exampleVi1: exampleVi1.trim(),
      exampleJp2: exampleJp2.trim(),
      exampleReading2: exampleReading2.trim(),
      exampleVi2: exampleVi2.trim(),
      kanjiBreakdown: validKanjiBreakdown,
      active,
    };

    setIsSubmitting(true);

    try {
      // 1. Kiểm tra từ trùng trong bài học hiện tại và toàn hệ thống
      const searchPool = allSystemItems.length > 0 ? allSystemItems : existingItems;
      const dupRes = findVocabularyDuplicates(searchPool, incomingData, lesson.id);

      if (dupRes.exactInCurrentLesson.length > 1) {
        toast('Phát hiện nhiều bản ghi trùng lặp bất thường trong bài học này. Vui lòng kiểm tra lại.', 'error');
        setIsSubmitting(false);
        return;
      }

      // 2. Trường hợp ĐÃ TỒN TẠI trong bài học hiện tại
      if (dupRes.exactInCurrentLesson.length === 1) {
        const existingItem = dupRes.exactInCurrentLesson[0];
        const plan = buildVocabularyMergePlan(existingItem, incomingData);

        if (plan.action === 'unchanged') {
          toast('Từ vựng này đã tồn tại và thông tin hoàn toàn trùng khớp.', 'info');
          setIsSubmitting(false);
          return;
        }

        // Mở modal so sánh để người dùng xác nhận
        setConflictPlan(plan);
        setIsSubmitting(false);
        return;
      }

      // 3. Trường hợp từ đã tồn tại ở bài học khác (Cảnh báo thông tin)
      if (dupRes.exactInOtherLessons.length > 0) {
        toast(
          `Lưu ý: Từ "${cleanVocab}" (${cleanHira}) đã có trong một bài học khác. Hệ thống sẽ tạo một bản ghi mới riêng cho bài học này.`,
          'info'
        );
      }

      // 4. Tạo từ mới hoàn toàn
      const newItem: VocabularyItem = {
        id: generateId(),
        lessonId: lesson.id,
        vocabId: `V_${Date.now()}`,
        vocabulary: cleanVocab,
        readingHiragana: cleanHira,
        readingRomaji: readingRomaji.trim(),
        onyomi: onyomi.trim(),
        kunyomi: kunyomi.trim(),
        meaningVi: cleanMeaning,
        hanViet: hanViet.trim(),
        kanjiBreakdown: validKanjiBreakdown,
        kanjiMemoryHint: kanjiMemoryHint.trim(),
        jlptLevel: jlptLevel.trim(),
        wordType: wordType.trim(),
        tags: tags.trim(),
        relatedWords: cleanRelated,
        audioText: audioText.trim() || cleanHira || cleanVocab,
        exampleJp1: exampleJp1.trim(),
        exampleReading1: exampleReading1.trim(),
        exampleVi1: exampleVi1.trim(),
        exampleJp2: exampleJp2.trim(),
        exampleReading2: exampleReading2.trim(),
        exampleVi2: exampleVi2.trim(),
        active,
        sortOrder: existingItems.length + 1,
        createdAt: new Date().toISOString(),
      };

      await upsertVocabItems([newItem]);
      toast(`Đã thêm thành công từ vựng: ${cleanVocab}`, 'success');
      onSaved(newItem, 'created');
      onClose();
    } catch (err: unknown) {
      console.error('Lỗi khi lưu từ vựng:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast(`Không thể lưu từ vựng: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Callback khi người dùng xác nhận merge trong modal Conflict
  const handleResolveConflict = async (resolvedItem: VocabularyItem) => {
    setIsSubmitting(true);
    try {
      await updateVocabItem(resolvedItem.id, resolvedItem);
      toast(`Đã cập nhật bổ sung dữ liệu cho từ: ${resolvedItem.vocabulary}`, 'success');
      setConflictPlan(null);
      onSaved(resolvedItem, 'updated');
      onClose();
    } catch (err: unknown) {
      console.error('Lỗi cập nhật từ vựng:', err);
      const msg = err instanceof Error ? err.message : String(err);
      toast(`Lỗi khi cập nhật: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div className="min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>+ Bổ sung từ vựng thủ công</span>
              </h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Bài học: <strong className="text-slate-700 dark:text-slate-300">{lesson.title}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
            {/* THÔNG TIN CHÍNH */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
              <p className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                <Sparkles size={14} /> Thông tin từ vựng chính
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Vocabulary */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Từ vựng (Kanji/Kana) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={vocabulary}
                    onChange={(e) => setVocabulary(e.target.value)}
                    placeholder="VD: 特色 hoặc 食べる"
                    className="font-jp w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Hiragana */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cách đọc Hiragana <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={readingHiragana}
                    onChange={(e) => setReadingHiragana(e.target.value)}
                    placeholder="VD: とくしょく"
                    className="font-jp w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Romaji */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Romaji
                  </label>
                  <input
                    type="text"
                    value={readingRomaji}
                    onChange={(e) => setReadingRomaji(e.target.value)}
                    placeholder="VD: tokushoku"
                    className="font-mono w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Văn bản phát âm nếu khác */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Văn bản phát âm (mặc định lấy theo Hiragana)
                  </label>
                  <input
                    type="text"
                    value={audioText}
                    onChange={(e) => setAudioText(e.target.value)}
                    placeholder="Để trống sẽ tự động lấy theo Hiragana"
                    className="font-jp w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Hán Việt */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Âm Hán Việt
                  </label>
                  <input
                    type="text"
                    value={hanViet}
                    onChange={(e) => setHanViet(e.target.value)}
                    placeholder="VD: ĐẶC SẮC"
                    className="uppercase font-semibold w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-700 dark:border-purple-800 dark:bg-slate-800 dark:text-purple-300 outline-none focus:border-purple-500"
                  />
                </div>

                {/* Meaning Vi */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ý nghĩa tiếng Việt <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={meaningVi}
                    onChange={(e) => setMeaningVi(e.target.value)}
                    placeholder="VD: Đặc sắc, điểm nổi bật"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* JLPT Level & Word Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Cấp độ JLPT
                  </label>
                  <select
                    value={jlptLevel}
                    onChange={(e) => setJlptLevel(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  >
                    <option value="N5">N5</option>
                    <option value="N4">N4</option>
                    <option value="N3">N3</option>
                    <option value="N2">N2</option>
                    <option value="N1">N1</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loại từ
                  </label>
                  <input
                    type="text"
                    value={wordType}
                    onChange={(e) => setWordType(e.target.value)}
                    placeholder="VD: Danh từ, Động từ nhóm 1..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Onyomi & Kunyomi */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Âm On (Onyomi)
                  </label>
                  <input
                    type="text"
                    value={onyomi}
                    onChange={(e) => setOnyomi(e.target.value)}
                    placeholder="VD: トク, ショク"
                    className="font-jp w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Âm Kun (Kunyomi)
                  </label>
                  <input
                    type="text"
                    value={kunyomi}
                    onChange={(e) => setKunyomi(e.target.value)}
                    placeholder="VD: いろ"
                    className="font-jp w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Memory Hint */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Gợi ý liên tưởng & ghi nhớ Kanji
                  </label>
                  <textarea
                    rows={2}
                    value={kanjiMemoryHint}
                    onChange={(e) => setKanjiMemoryHint(e.target.value)}
                    placeholder="VD: Chữ ĐẶC (đặc biệt) ghép với chữ SẮC (màu sắc) tạo thành 'Đặc sắc'."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Tags & Related */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Thẻ Tags (cách nhau bởi dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="VD: N3, Du lịch, Hay gặp"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Từ liên quan (cách nhau bởi dấu phẩy)
                  </label>
                  <input
                    type="text"
                    value={relatedWordsStr}
                    onChange={(e) => setRelatedWordsStr(e.target.value)}
                    placeholder="VD: 特徴, 特殊, 特別"
                    className="font-jp w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* PHÂN TÍCH TỪNG CHỮ KANJI */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-300 text-xs uppercase tracking-wider">
                  <BookOpen size={15} />
                  <span>Phân tích từng chữ Kanji ({kanjiList.length} chữ)</span>
                </div>
                <button
                  type="button"
                  onClick={addKanjiRow}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 active:scale-95 transition-all"
                >
                  <Plus size={14} /> Thêm chữ Kanji
                </button>
              </div>

              {kanjiList.length === 0 ? (
                <p className="py-2 text-xs text-slate-500 dark:text-slate-400 italic">
                  Chưa có phân tích Kanji riêng. Bấm "Thêm chữ Kanji" nếu muốn phân tích sâu từng chữ.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {kanjiList.map((k, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-indigo-200 bg-white p-2.5 dark:border-indigo-900/50 dark:bg-slate-800 shadow-2xs relative"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400">
                          Chữ thứ {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeKanjiRow(idx)}
                          title="Xóa chữ này"
                          className="text-red-500 hover:text-red-700 p-0.5 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div className="col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Chữ Kanji
                          </label>
                          <input
                            type="text"
                            value={k.kanji}
                            onChange={(e) => updateKanjiRow(idx, { kanji: e.target.value })}
                            placeholder="VD: 特"
                            className="font-jp w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Âm Hán Việt
                          </label>
                          <input
                            type="text"
                            value={k.hanViet}
                            onChange={(e) => updateKanjiRow(idx, { hanViet: e.target.value })}
                            placeholder="VD: ĐẶC"
                            className="uppercase w-full rounded border border-purple-200 px-2 py-1 text-xs text-purple-700 dark:border-purple-800 dark:bg-slate-900 dark:text-purple-300 font-semibold"
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Nghĩa tiếng Việt
                          </label>
                          <input
                            type="text"
                            value={k.meaningVi}
                            onChange={(e) => updateKanjiRow(idx, { meaningVi: e.target.value })}
                            placeholder="VD: Đặc biệt"
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Âm On
                          </label>
                          <input
                            type="text"
                            value={k.onyomi || ''}
                            onChange={(e) => updateKanjiRow(idx, { onyomi: e.target.value })}
                            placeholder="VD: トク"
                            className="font-jp w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                            Âm Kun
                          </label>
                          <input
                            type="text"
                            value={k.kunyomi || ''}
                            onChange={(e) => updateKanjiRow(idx, { kunyomi: e.target.value })}
                            placeholder="VD: いろ"
                            className="font-jp w-full rounded border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CÂU VÍ DỤ THỰC TẾ */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 dark:border-slate-800 dark:bg-slate-800/40 space-y-3">
              <p className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Câu ví dụ minh họa
              </p>

              {/* Ví dụ 1 */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 space-y-2">
                <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">Ví dụ 1</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={exampleJp1}
                      onChange={(e) => setExampleJp1(e.target.value)}
                      placeholder="Câu tiếng Nhật (VD: この町の特色は何ですか。)"
                      className="font-jp w-full rounded border border-slate-200 px-3 py-1.5 text-xs sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={exampleReading1}
                      onChange={(e) => setExampleReading1(e.target.value)}
                      placeholder="Cách đọc Hiragana của câu ví dụ 1"
                      className="font-jp w-full rounded border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={exampleVi1}
                      onChange={(e) => setExampleVi1(e.target.value)}
                      placeholder="Dịch nghĩa tiếng Việt câu ví dụ 1"
                      className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Ví dụ 2 */}
              <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800 space-y-2">
                <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">Ví dụ 2</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={exampleJp2}
                      onChange={(e) => setExampleJp2(e.target.value)}
                      placeholder="Câu tiếng Nhật 2"
                      className="font-jp w-full rounded border border-slate-200 px-3 py-1.5 text-xs sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={exampleReading2}
                      onChange={(e) => setExampleReading2(e.target.value)}
                      placeholder="Cách đọc Hiragana ví dụ 2"
                      className="font-jp w-full rounded border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={exampleVi2}
                      onChange={(e) => setExampleVi2(e.target.value)}
                      placeholder="Dịch nghĩa tiếng Việt ví dụ 2"
                      className="w-full rounded border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Trạng thái Kích hoạt */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="vocab-active-check"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="vocab-active-check" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                Kích hoạt từ vựng này ngay sau khi lưu
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={16} />
                <span>{isSubmitting ? 'Đang kiểm tra...' : 'Kiểm tra và lưu'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Modal giải quyết xung đột khi từ đã tồn tại */}
      {conflictPlan && (
        <VocabConflictResolveModal
          plan={conflictPlan}
          lessonTitle={lesson.title}
          onResolve={handleResolveConflict}
          onCancel={() => setConflictPlan(null)}
        />
      )}
    </>
  );
}

