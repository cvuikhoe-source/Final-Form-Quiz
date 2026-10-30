import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X, Save, FileSpreadsheet, Download, Check, AlertTriangle, BookOpen,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  ReadingLesson, ReadingQuestionFull, ReadingGrammar,
  ReadingLevel, ReadingStatus, ReadingQuestionType,
} from '@/types';
import {
  generateId, getReadingQuestionsAdmin, importReadingDataAtomic,
  upsertReadingLessons, upsertReadingQuestions, upsertReadingGrammar,
} from '@/storage';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AutoTextarea } from '@/components/AutoTextarea';

interface ReadingAdminModalProps {
  lesson: ReadingLesson | null;
  onClose: () => void;
  onSaved: () => void;
}

const LEVELS: ReadingLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
const STATUSES: ReadingStatus[] = ['draft', 'published', 'archived'];
const QTYPES: ReadingQuestionType[] = ['single_choice', 'multiple_choice', 'true_false'];

interface ParsedRow {
  sheet: 'READINGS' | 'QUESTIONS' | 'GRAMMAR';
  rowNum: number;
  data: Record<string, string>;
  errors: string[];
}

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

function getStr(row: Record<string, string>, name: string): string {
  return (row[normKey(name)] ?? '').trim();
}

function parseNum(v: string, dflt: number): number {
  const n = Number(v.trim());
  return isFinite(n) ? Math.round(n) : dflt;
}

export function ReadingAdminModal({ lesson, onClose, onSaved }: ReadingAdminModalProps) {
  const isNew = lesson === null;
  const [lessonNo, setLessonNo] = useState(lesson?.lessonNo ?? 1);
  const [titleJa, setTitleJa] = useState(lesson?.titleJa ?? '');
  const [titleVi, setTitleVi] = useState(lesson?.titleVi ?? '');
  const [level, setLevel] = useState<ReadingLevel>(lesson?.level ?? 'N5');
  const [category, setCategory] = useState(lesson?.category ?? '');
  const [readingTextJa, setReadingTextJa] = useState(lesson?.readingTextJa ?? '');
  const [translationVi, setTranslationVi] = useState(lesson?.translationVi ?? '');
  const [imageUrl, setImageUrl] = useState(lesson?.imageUrl ?? '');
  const [estimatedMinutes, setEstimatedMinutes] = useState(lesson?.estimatedMinutes ?? 8);
  const [status, setStatus] = useState<ReadingStatus>(lesson?.status ?? 'draft');
  const [questions, setQuestions] = useState<ReadingQuestionFull[]>([]);
  const [grammar, setGrammar] = useState<ReadingGrammar[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parsedFileName, setParsedFileName] = useState('');
  const [importResult, setImportResult] = useState<string>('');
  const excelRef = useRef<HTMLInputElement | null>(null);
  const readingId = lesson?.id ?? generateId('RD');

  useEffect(() => {
    if (!isNew && lesson) {
      Promise.all([getReadingQuestionsAdmin(lesson.id)]).then(([qs]) => {
        setQuestions(qs);
      }).catch(() => setQuestions([]));
    }
  }, [isNew, lesson]);

  // ── Excel parsing (READINGS / QUESTIONS / GRAMMAR) ────────────
  const handleExcel = useCallback(async (file: File) => {
    setSaveError('');
    setImportResult('');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', codepage: 65001 });
    const rows: ParsedRow[] = [];
    const hasReadings = !!wb.Sheets['READINGS'];
    const hasQuestions = !!wb.Sheets['QUESTIONS'];
    const hasGrammar = !!wb.Sheets['GRAMMAR'];
    if (!hasReadings && !hasQuestions && !hasGrammar) {
      setSaveError('File không có sheet READINGS, QUESTIONS hoặc GRAMMAR hợp lệ.');
      return;
    }
    const seenReadingIds = new Set<string>();
    const seenQIds = new Set<string>();
    const seenGIds = new Set<string>();

    if (hasReadings) {
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['READINGS'], { defval: '', raw: false });
      json.forEach((raw, i) => {
        const data: Record<string, string> = {};
        Object.entries(raw).forEach(([k, v]) => { data[normKey(k)] = String(v ?? ''); });
        const errors: string[] = [];
        const id = getStr(data, 'reading_id');
        const lvl = getStr(data, 'level').toUpperCase();
        const st = getStr(data, 'status').toLowerCase();
        if (!id) errors.push('reading_id không được để trống');
        if (seenReadingIds.has(id)) errors.push('Trùng reading_id');
        if (!getStr(data, 'title_ja')) errors.push('title_ja không được để trống');
        if (!getStr(data, 'reading_text_ja')) errors.push('reading_text_ja không được để trống');
        if (!LEVELS.includes(lvl as ReadingLevel)) errors.push('level phải là N5/N4/N3/N2/N1');
        if (st && !STATUSES.includes(st as ReadingStatus)) errors.push('status phải là draft/published/archived');
        const ln = Number(getStr(data, 'lesson_no'));
        if (getStr(data, 'lesson_no') && (!isFinite(ln) || ln < 1)) errors.push('lesson_no không hợp lệ');
        seenReadingIds.add(id);
        rows.push({ sheet: 'READINGS', rowNum: i + 2, data, errors });
      });
    }

    if (hasQuestions) {
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['QUESTIONS'], { defval: '', raw: false });
      json.forEach((raw, i) => {
        const data: Record<string, string> = {};
        Object.entries(raw).forEach(([k, v]) => { data[normKey(k)] = String(v ?? ''); });
        const errors: string[] = [];
        const id = getStr(data, 'question_id');
        const rid = getStr(data, 'reading_id');
        const qtype = getStr(data, 'question_type').toLowerCase() || 'single_choice';
        const ans = getStr(data, 'correct_answer').toUpperCase();
        if (!id) errors.push('question_id không được để trống');
        if (seenQIds.has(id)) errors.push('Trùng question_id');
        if (!rid) errors.push('reading_id không được để trống');
        else if (!seenReadingIds.has(rid)) errors.push(`Không tìm thấy ${rid}`);
        if (!QTYPES.includes(qtype as ReadingQuestionType)) errors.push('question_type không hợp lệ');
        if (!ans || ans.replace(/[^A-D]/g, '') === '') errors.push('correct_answer phải là A/B/C/D');
        if (!getStr(data, 'question_text_vi')) errors.push('question_text_vi không được để trống');
        seenQIds.add(id);
        rows.push({ sheet: 'QUESTIONS', rowNum: i + 2, data, errors });
      });
    }

    if (hasGrammar) {
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['GRAMMAR'], { defval: '', raw: false });
      json.forEach((raw, i) => {
        const data: Record<string, string> = {};
        Object.entries(raw).forEach(([k, v]) => { data[normKey(k)] = String(v ?? ''); });
        const errors: string[] = [];
        const id = getStr(data, 'grammar_id');
        const rid = getStr(data, 'reading_id');
        if (!id) errors.push('grammar_id không được để trống');
        if (seenGIds.has(id)) errors.push('Trùng grammar_id');
        if (!rid) errors.push('reading_id không được để trống');
        else if (!seenReadingIds.has(rid)) errors.push(`Không tìm thấy ${rid}`);
        if (!getStr(data, 'pattern')) errors.push('pattern không được để trống');
        seenGIds.add(id);
        rows.push({ sheet: 'GRAMMAR', rowNum: i + 2, data, errors });
      });
    }

    setParsedFileName(file.name);
    setParsed(rows);
  }, []);

  const validRows = useMemo(() => parsed?.filter((r) => r.errors.length === 0) ?? [], [parsed]);
  const invalidRows = useMemo(() => parsed?.filter((r) => r.errors.length > 0) ?? [], [parsed]);

  const confirmImport = useCallback(async () => {
    if (!parsed || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const lessonsIn: ReadingLesson[] = validRows.filter((r) => r.sheet === 'READINGS').map((r, idx) => ({
        id: getStr(r.data, 'reading_id'),
        courseId: getStr(r.data, 'course_id'),
        lessonNo: parseNum(getStr(r.data, 'lesson_no'), idx + 1),
        titleJa: getStr(r.data, 'title_ja'),
        titleVi: getStr(r.data, 'title_vi'),
        level: getStr(r.data, 'level').toUpperCase() as ReadingLevel,
        category: getStr(r.data, 'category'),
        readingTextJa: getStr(r.data, 'reading_text_ja'),
        translationVi: getStr(r.data, 'translation_vi'),
        imageUrl: getStr(r.data, 'image_url'),
        estimatedMinutes: parseNum(getStr(r.data, 'estimated_minutes'), 5),
        displayOrder: parseNum(getStr(r.data, 'display_order'), idx + 1),
        status: (getStr(r.data, 'status').toLowerCase() || 'draft') as ReadingStatus,
        createdAt: new Date().toISOString(),
      }));
      const questionsIn: ReadingQuestionFull[] = validRows.filter((r) => r.sheet === 'QUESTIONS').map((r, idx) => ({
        id: getStr(r.data, 'question_id'),
        readingId: getStr(r.data, 'reading_id'),
        questionNo: parseNum(getStr(r.data, 'question_no'), idx + 1),
        questionType: (getStr(r.data, 'question_type').toLowerCase() || 'single_choice') as ReadingQuestionType,
        questionTextVi: getStr(r.data, 'question_text_vi'),
        optionA: getStr(r.data, 'option_a'),
        optionB: getStr(r.data, 'option_b'),
        optionC: getStr(r.data, 'option_c'),
        optionD: getStr(r.data, 'option_d'),
        correctAnswer: getStr(r.data, 'correct_answer').toUpperCase(),
        explanationVi: getStr(r.data, 'explanation_vi'),
        evidenceJa: getStr(r.data, 'evidence_ja'),
        points: parseNum(getStr(r.data, 'points'), 1),
        displayOrder: parseNum(getStr(r.data, 'display_order'), idx + 1),
      }));
      const grammarIn: ReadingGrammar[] = validRows.filter((r) => r.sheet === 'GRAMMAR').map((r, idx) => ({
        id: getStr(r.data, 'grammar_id'),
        readingId: getStr(r.data, 'reading_id'),
        grammarNo: parseNum(getStr(r.data, 'grammar_no'), idx + 1),
        pattern: getStr(r.data, 'pattern'),
        meaningVi: getStr(r.data, 'meaning_vi'),
        formation: getStr(r.data, 'formation'),
        exampleJa: getStr(r.data, 'example_ja'),
        exampleVi: getStr(r.data, 'example_vi'),
        noteVi: getStr(r.data, 'note_vi'),
        displayOrder: parseNum(getStr(r.data, 'display_order'), idx + 1),
      }));

      // Atomic import via SECURITY DEFINER function (Supabase mode)
      let resultMsg = '';
      if (isSupabaseConfigured) {
        const res = await importReadingDataAtomic(lessonsIn, questionsIn, grammarIn);
        resultMsg = `Nhập xong: ${res.created.lessons} bài mới / ${res.updated.lessons} cập nhật, ${res.created.questions} câu mới / ${res.updated.questions} cập nhật, ${res.created.grammar} ngữ pháp mới / ${res.updated.grammar} cập nhật`;
      } else {
        if (lessonsIn.length > 0) await upsertReadingLessons(lessonsIn);
        if (questionsIn.length > 0) await upsertReadingQuestions(questionsIn);
        if (grammarIn.length > 0) await upsertReadingGrammar(grammarIn);
        resultMsg = `Nhập xong: ${lessonsIn.length} bài, ${questionsIn.length} câu hỏi, ${grammarIn.length} ngữ pháp`;
      }
      setImportResult(resultMsg);
      setParsed(null);
      onSaved();
      setTimeout(onClose, 1400);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi khi nhập dữ liệu.');
    } finally {
      setSaving(false);
    }
  }, [parsed, saving, validRows, onSaved, onClose]);

  const downloadTemplate = useCallback(() => {
    const readings = [{
      reading_id: 'RD-N2-001',
      course_id: 'READING-N2',
      lesson_no: 1,
      title_ja: '時間の使い方',
      title_vi: 'Cách sử dụng thời gian',
      level: 'N2',
      category: '生活',
      reading_text_ja: '忙しい毎日の中で、時間を上手に使うことは大切です。\nしかし、予定をたくさん入れるだけでは、効率がよくなるとは限りません。\n何を優先するかを考え、休む時間も計画に入れることが必要です。',
      translation_vi: 'Trong cuộc sống bận rộn hằng ngày, sử dụng thời gian hiệu quả là điều quan trọng. Tuy nhiên, chỉ thêm nhiều lịch trình chưa chắc đã nâng cao hiệu suất. Cần xác định việc ưu tiên và đưa cả thời gian nghỉ vào kế hoạch.',
      image_url: '',
      estimated_minutes: 8,
      display_order: 1,
      status: 'published',
    }];
    const questions = [{
      question_id: 'Q-RD001-01',
      reading_id: 'RD-N2-001',
      question_no: 1,
      question_type: 'single_choice',
      question_text_vi: 'Theo nội dung bài đọc, điều gì là cần thiết?',
      option_a: 'Thêm thật nhiều lịch hẹn',
      option_b: 'Xác định ưu tiên và lên kế hoạch nghỉ ngơi',
      option_c: 'Làm mọi việc cùng một lúc',
      option_d: 'Không cần lập kế hoạch',
      correct_answer: 'B',
      explanation_vi: 'Bài đọc nêu rõ cần suy nghĩ điều gì ưu tiên và đưa thời gian nghỉ vào kế hoạch.',
      evidence_ja: '何を優先するかを考え、休む時間も計画に入れることが必要です。',
      points: 1,
      display_order: 1,
    }];
    const grammar = [{
      grammar_id: 'G-RD001-01',
      reading_id: 'RD-N2-001',
      grammar_no: 1,
      pattern: '～とは限らない',
      meaning_vi: 'không hẳn là / chưa chắc là',
      formation: 'Thể thông thường + とは限らない',
      example_ja: '予定を増やせば、効率がよくなるとは限りません。',
      example_vi: 'Tăng lịch trình chưa chắc đã làm hiệu suất tốt hơn.',
      note_vi: 'Dùng để phủ định một kết luận được cho là luôn đúng.',
      display_order: 1,
    }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readings), 'READINGS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(questions), 'QUESTIONS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grammar), 'GRAMMAR');
    XLSX.writeFile(wb, 'mau_bai_hoc_doc.xlsx');
  }, []);

  const addQuestion = () => setQuestions((prev) => [...prev, {
    id: generateId('Q'), readingId, questionNo: prev.length + 1, questionType: 'single_choice',
    questionTextVi: '', optionA: '', optionB: '', optionC: '', optionD: '',
    correctAnswer: 'A', explanationVi: '', evidenceJa: '', points: 1, displayOrder: prev.length + 1,
  }]);

  const updateQuestion = (idx: number, patch: Partial<ReadingQuestionFull>) =>
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));

  const removeQuestion = (idx: number) =>
    setQuestions((prev) => prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, questionNo: i + 1 })));

  const addGrammar = () => setGrammar((prev) => [...prev, {
    id: generateId('G'), readingId, grammarNo: prev.length + 1, pattern: '', meaningVi: '',
    formation: '', exampleJa: '', exampleVi: '', noteVi: '', displayOrder: prev.length + 1,
  }]);

  const updateGrammar = (idx: number, patch: Partial<ReadingGrammar>) =>
    setGrammar((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));

  const removeGrammar = (idx: number) =>
    setGrammar((prev) => prev.filter((_, i) => i !== idx).map((g, i) => ({ ...g, grammarNo: i + 1 })));

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!titleJa.trim()) { setSaveError('Vui lòng nhập tiêu đề tiếng Nhật.'); return; }
    if (!readingTextJa.trim()) { setSaveError('Vui lòng nhập nội dung bài đọc.'); return; }
    const badQ = questions.findIndex((q) => !q.questionTextVi.trim() || !q.optionA.trim() || !q.optionB.trim());
    if (badQ >= 0) { setSaveError(`Câu hỏi số ${badQ + 1} còn thiếu nội dung/đáp án A hoặc B.`); return; }
    const badG = grammar.findIndex((g) => !g.pattern.trim());
    if (badG >= 0) { setSaveError(`Mục ngữ pháp số ${badG + 1} thiếu mẫu câu.`); return; }
    setSaving(true);
    setSaveError('');
    try {
      const l: ReadingLesson = {
        id: readingId,
        courseId: lesson?.courseId ?? '',
        lessonNo,
        titleJa: titleJa.trim(),
        titleVi: titleVi.trim(),
        level,
        category: category.trim(),
        readingTextJa,
        translationVi,
        imageUrl: imageUrl.trim(),
        estimatedMinutes,
        displayOrder: lesson?.displayOrder ?? lessonNo,
        status,
        createdAt: lesson?.createdAt ?? new Date().toISOString(),
      };
      await upsertReadingLessons([l]);
      if (questions.length > 0) await upsertReadingQuestions(questions.map((q) => ({ ...q, readingId })));
      if (grammar.length > 0) await upsertReadingGrammar(grammar.map((g) => ({ ...g, readingId })));
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi khi lưu bài đọc.');
    } finally {
      setSaving(false);
    }
  }, [titleJa, readingTextJa, questions, grammar, saving, lesson, lessonNo, titleVi, level, category, translationVi, imageUrl, estimatedMinutes, status, readingId, onSaved, onClose]);

  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const labelCls = 'mb-1 block text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 safe-bottom md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <BookOpen size={20} className="text-teal-600" />
            {isNew ? 'Tạo bài đọc' : 'Sửa bài đọc'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Số bài</label>
              <input type="number" min={1} value={lessonNo} onChange={(e) => setLessonNo(Number(e.target.value) || 1)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cấp độ</label>
              <select value={level} onChange={(e) => setLevel(e.target.value as ReadingLevel)} className={inputCls}>
                {LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Trạng thái</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ReadingStatus)} className={inputCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{s === 'draft' ? 'Nháp' : s === 'published' ? 'Đã xuất bản' : 'Lưu trữ'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Tiêu đề tiếng Nhật *</label>
            <input value={titleJa} onChange={(e) => setTitleJa(e.target.value)} className={`${inputCls} font-jp`} placeholder="時間の使い方" />
          </div>
          <div>
            <label className={labelCls}>Tiêu đề tiếng Việt</label>
            <input value={titleVi} onChange={(e) => setTitleVi(e.target.value)} className={inputCls} placeholder="Cách sử dụng thời gian" />
          </div>
          <div>
            <label className={labelCls}>Danh mục</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} font-jp`} placeholder="生活" />
          </div>
          <div>
            <label className={labelCls}>Nội dung bài đọc (tiếng Nhật) *</label>
            <AutoTextarea value={readingTextJa} onChange={setReadingTextJa} placeholder="Giữ nguyên xuống dòng của dữ liệu gốc" relaxed className={`${inputCls} font-jp`} />
          </div>
          <div>
            <label className={labelCls}>Bản dịch tiếng Việt</label>
            <AutoTextarea value={translationVi} onChange={setTranslationVi} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>URL hình minh họa</label>
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputCls} placeholder="https://..." />
            </div>
            <div>
              <label className={labelCls}>Thời lượng (phút)</label>
              <input type="number" min={1} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(Number(e.target.value) || 5)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Questions */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700">CÂU HỎI ({questions.length})</p>
            <button onClick={addQuestion} className="flex items-center gap-1 rounded-lg bg-teal-100 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-200">
              + Thêm câu
            </button>
          </div>
          {questions.map((q, idx) => (
            <div key={q.id} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Câu {idx + 1}</span>
                <button onClick={() => removeQuestion(idx)} className="rounded p-1 text-red-400 hover:bg-red-50"><X size={14} /></button>
              </div>
              <input value={q.questionTextVi} onChange={(e) => updateQuestion(idx, { questionTextVi: e.target.value })} className={`${inputCls} mb-1.5`} placeholder="Câu hỏi (tiếng Việt) *" />
              <div className="mb-2 grid grid-cols-2 gap-2">
                {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((opt, i) => (
                  <input key={opt} value={q[opt]} onChange={(e) => updateQuestion(idx, { [opt]: e.target.value } as Partial<ReadingQuestionFull>)} className={inputCls} placeholder={`Đáp án ${'ABCD'[i]}${i < 2 ? ' *' : ''}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select value={q.correctAnswer} onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })} className={inputCls}>
                  {['A', 'B', 'C', 'D'].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input value={q.explanationVi} onChange={(e) => updateQuestion(idx, { explanationVi: e.target.value })} className={`${inputCls} col-span-2`} placeholder="Giải thích" />
              </div>
              <input value={q.evidenceJa} onChange={(e) => updateQuestion(idx, { evidenceJa: e.target.value })} className={`${inputCls} mt-1.5 font-jp`} placeholder="Căn cứ trong bài (tiếng Nhật)" />
            </div>
          ))}
        </div>

        {/* Grammar */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700">NGỮ PHÁP ({grammar.length})</p>
            <button onClick={addGrammar} className="flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200">
              + Thêm mục
            </button>
          </div>
          {grammar.map((g, idx) => (
            <div key={g.id} className="mb-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Mục {idx + 1}</span>
                <button onClick={() => removeGrammar(idx)} className="rounded p-1 text-red-400 hover:bg-red-50"><X size={14} /></button>
              </div>
              <input value={g.pattern} onChange={(e) => updateGrammar(idx, { pattern: e.target.value })} className={`${inputCls} mb-1.5 font-jp`} placeholder="Mẫu ngữ pháp (vd: ～とは限らない) *" />
              <div className="grid grid-cols-2 gap-2">
                <input value={g.meaningVi} onChange={(e) => updateGrammar(idx, { meaningVi: e.target.value })} className={inputCls} placeholder="Nghĩa" />
                <input value={g.formation} onChange={(e) => updateGrammar(idx, { formation: e.target.value })} className={`${inputCls} font-jp`} placeholder="Cấu trúc" />
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <input value={g.exampleJa} onChange={(e) => updateGrammar(idx, { exampleJa: e.target.value })} className={`${inputCls} font-jp`} placeholder="Ví dụ (JP)" />
                <input value={g.exampleVi} onChange={(e) => updateGrammar(idx, { exampleVi: e.target.value })} className={inputCls} placeholder="Dịch (VI)" />
              </div>
              <input value={g.noteVi} onChange={(e) => updateGrammar(idx, { noteVi: e.target.value })} className={`${inputCls} mt-1.5`} placeholder="Lưu ý" />
            </div>
          ))}
        </div>

        {saveError && <div className="mb-3 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600">{saveError}</div>}
        {importResult && <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700">{importResult}</div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Hủy</button>
          <button
            onClick={() => excelRef.current?.click()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
          >
            <FileSpreadsheet size={15} /> Nhập Excel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-teal-700 disabled:opacity-50"
          >
            <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
        <button onClick={downloadTemplate} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">
          <Download size={13} /> Tải file Excel mẫu (READINGS + QUESTIONS + GRAMMAR)
        </button>
        <input
          ref={excelRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcel(f); e.target.value = ''; }}
        />
      </div>

      {/* Preview overlay */}
      {parsed && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setParsed(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
              <FileSpreadsheet size={18} className="text-emerald-600" /> Xem trước import
            </h4>
            <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-xs">
              <p className="font-semibold text-slate-700">{parsedFileName}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-slate-500">
                <span>Bài đọc: {validRows.filter((r) => r.sheet === 'READINGS').length}</span>
                <span>Câu hỏi: {validRows.filter((r) => r.sheet === 'QUESTIONS').length}</span>
                <span>Ngữ pháp: {validRows.filter((r) => r.sheet === 'GRAMMAR').length}</span>
                <span className="text-emerald-600">Hợp lệ: {validRows.length}</span>
                {invalidRows.length > 0 && <span className="text-red-500">Lỗi: {invalidRows.length}</span>}
              </div>
            </div>

            <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
              {parsed.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 border-b border-slate-50 px-3 py-2 text-xs ${r.errors.length > 0 ? 'bg-red-50/50' : ''}`}>
                  <span className="w-16 shrink-0 font-mono text-[10px] text-slate-400">{r.sheet}:{r.rowNum}</span>
                  {r.errors.length > 0 ? (
                    <span className="flex-1 text-red-500">
                      <ul className="list-inside list-disc">{r.errors.map((er, j) => <li key={j}>{er}</li>)}</ul>
                    </span>
                  ) : (
                    <span className="flex-1 truncate text-slate-600">
                      {r.sheet === 'READINGS' && <span className="font-jp font-semibold text-slate-700">{getStr(r.data, 'title_ja')}</span>}
                      {r.sheet === 'QUESTIONS' && <span className="truncate">{getStr(r.data, 'question_text_vi')}</span>}
                      {r.sheet === 'GRAMMAR' && <span className="font-jp text-slate-700">{getStr(r.data, 'pattern')}</span>}
                    </span>
                  )}
                  {r.errors.length === 0 ? <Check size={13} className="shrink-0 text-emerald-500" /> : <AlertTriangle size={13} className="shrink-0 text-red-400" />}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setParsed(null)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600">Hủy</button>
              <button
                onClick={confirmImport}
                disabled={saving || validRows.length === 0 || invalidRows.length > 0}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                <FileSpreadsheet size={15} /> {saving ? 'Đang nhập...' : `Tiến hành nhập (${validRows.length} dòng)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
