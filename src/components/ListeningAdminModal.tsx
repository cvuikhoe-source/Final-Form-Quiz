import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X, Upload, Link2, FileSpreadsheet, Plus, Trash2, Download, Check,
  AlertTriangle, Music4, Save,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
  ListeningLesson, ListeningQuestionFull, ListeningAnswerKey, ListeningLevel,
  ListeningStatus, ListeningSourceType, ListeningDifficulty, ListeningShowExplanation,
} from '@/types';
import { AudioPlayer, getDriveFileId } from '@/components/AudioPlayer';
import {
  generateId, getListeningAudioUrl, getListeningQuestionsAdmin,
  loadClasses, uploadListeningAudio, upsertListeningLessons, upsertListeningQuestions,
} from '@/storage';

interface ListeningAdminModalProps {
  lesson: ListeningLesson | null;
  onClose: () => void;
  onSaved: () => void;
}

const LEVELS: ListeningLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
const STATUSES: ListeningStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

interface ParsedRow {
  rowNum: number;
  kind: 'lesson' | 'question';
  data: Record<string, string>;
  errors: string[];
}

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, '_');
}

function getStr(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = row[normKey(n)];
    if (v !== undefined && v.trim() !== '') return v.trim();
  }
  return '';
}

function parseBool(v: string, dflt: boolean): boolean {
  const t = v.trim().toLowerCase();
  if (['true', '1', 'yes', 'có', 'x'].includes(t)) return true;
  if (['false', '0', 'no', 'không'].includes(t)) return false;
  return dflt;
}

function parseTs(v: string): number | null {
  const t = v.trim();
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export function ListeningAdminModal({ lesson, onClose, onSaved }: ListeningAdminModalProps) {
  const isNew = lesson === null;
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [subtitle, setSubtitle] = useState(lesson?.subtitle ?? '');
  const [level, setLevel] = useState<ListeningLevel>(lesson?.level ?? 'N5');
  const [category, setCategory] = useState(lesson?.category ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [sourceType, setSourceType] = useState<ListeningSourceType>(lesson?.audioSourceType ?? 'URL');
  const [audioSource, setAudioSource] = useState(lesson?.audioSource ?? '');
  const [audioFileName, setAudioFileName] = useState(lesson?.audioFileName ?? '');
  const [durationSeconds, setDurationSeconds] = useState(lesson?.durationSeconds ?? 0);
  const [transcript, setTranscript] = useState(lesson?.transcript ?? '');
  const [teacherName, setTeacherName] = useState(lesson?.teacherName ?? '');
  const [classScope, setClassScope] = useState<string[]>(lesson?.classScope ?? []);
  const [status, setStatus] = useState<ListeningStatus>(lesson?.status ?? 'DRAFT');

  const [classes, setClasses] = useState<string[]>([]);
  const [questions, setQuestions] = useState<ListeningQuestionFull[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [audioError, setAudioError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [parsedFileName, setParsedFileName] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const excelRef = useRef<HTMLInputElement | null>(null);
  const lessonId = lesson?.id ?? generateId('listen');

  useEffect(() => {
    loadClasses().then(setClasses);
  }, []);

  useEffect(() => {
    if (!isNew && lesson) {
      getListeningQuestionsAdmin(lesson.id).then(setQuestions).catch(() => setQuestions([]));
    }
  }, [isNew, lesson]);

  const previewUrl = useMemo(() => {
    if (!audioSource) return '';
    return sourceType === 'URL' ? audioSource : getListeningAudioUrl(audioSource, 'UPLOAD');
  }, [audioSource, sourceType]);

  const handleUpload = useCallback(async (file: File) => {
    setAudioError('');
    if (!['audio/mpeg', 'audio/mp3'].includes(file.type) && !file.name.toLowerCase().endsWith('.mp3')) {
      setAudioError('Chỉ hỗ trợ file MP3.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setAudioError('File quá lớn (tối đa 20MB).');
      return;
    }
    setUploading(true);
    setUploadPct(10);
    const timer = setInterval(() => setUploadPct((p) => Math.min(p + 10, 90)), 300);
    try {
      const { path, publicUrl } = await uploadListeningAudio(file);
      setAudioSource(path);
      setAudioFileName(file.name);
      setUploadPct(100);
      const a = new Audio(publicUrl);
      a.addEventListener('loadedmetadata', () => {
        if (isFinite(a.duration)) setDurationSeconds(Math.round(a.duration));
      });
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : 'Lỗi khi tải file lên.');
    } finally {
      clearInterval(timer);
      setUploading(false);
    }
  }, []);

  // ── Excel parsing ─────────────────────────────────────────────
  const handleExcel = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const rows: ParsedRow[] = [];
    const seenLessonIds = new Set<string>();
    const seenQIds = new Set<string>();

    const lessonSheet = wb.Sheets['BAI_NGHE'];
    if (lessonSheet) {
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(lessonSheet, { defval: '' });
      json.forEach((raw, i) => {
        const data: Record<string, string> = {};
        Object.entries(raw).forEach(([k, v]) => { data[normKey(k)] = String(v ?? '').trim(); });
        const errors: string[] = [];
        const id = getStr(data, 'lesson_id');
        const lvl = getStr(data, 'level').toUpperCase();
        const st = getStr(data, 'status').toUpperCase();
        const stype = getStr(data, 'audio_source_type').toUpperCase();
        if (!id) errors.push('Thiếu lesson_id');
        if (seenLessonIds.has(id)) errors.push('Trùng lesson_id');
        if (!getStr(data, 'title')) errors.push('Thiếu title');
        if (!LEVELS.includes(lvl as ListeningLevel)) errors.push('level phải là N5-N1');
        if (!['UPLOAD', 'URL'].includes(stype)) errors.push('audio_source_type phải là UPLOAD/URL');
        if (!getStr(data, 'audio_source')) errors.push('Thiếu audio_source');
        if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(st)) errors.push('status phải là DRAFT/PUBLISHED/ARCHIVED');
        seenLessonIds.add(id);
        rows.push({ rowNum: i + 2, kind: 'lesson', data, errors });
      });
    }

    const qSheet = wb.Sheets['CAU_HOI'];
    if (qSheet) {
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(qSheet, { defval: '' });
      json.forEach((raw, i) => {
        const data: Record<string, string> = {};
        Object.entries(raw).forEach(([k, v]) => { data[normKey(k)] = String(v ?? '').trim(); });
        const errors: string[] = [];
        const id = getStr(data, 'question_id');
        const lid = getStr(data, 'lesson_id');
        const ans = getStr(data, 'correct_answer').toUpperCase();
        if (!id) errors.push('Thiếu question_id');
        if (seenQIds.has(id)) errors.push('Trùng question_id');
        if (!lid) errors.push('Thiếu lesson_id');
        else if (!seenLessonIds.has(lid)) errors.push(`lesson_id "${lid}" không tồn tại trong sheet BAI_NGHE`);
        if (!getStr(data, 'question_text')) errors.push('Thiếu question_text');
        if (!getStr(data, 'option_a')) errors.push('Thiếu option_a');
        if (!getStr(data, 'option_b')) errors.push('Thiếu option_b');
        if (!['A', 'B', 'C', 'D'].includes(ans)) errors.push('correct_answer phải là A/B/C/D');
        const st = parseTs(getStr(data, 'start_time_sec'));
        const et = parseTs(getStr(data, 'end_time_sec'));
        if (st !== null && et !== null && et <= st) errors.push('end_time_sec phải > start_time_sec');
        seenQIds.add(id);
        rows.push({ rowNum: i + 2, kind: 'question', data, errors });
      });
    }

    if (rows.length === 0) {
      setSaveError('File không có sheet BAI_NGHE hoặc CAU_HOI hợp lệ.');
      return;
    }
    setParsedFileName(file.name);
    setParsed(rows);
  }, []);

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const invalidRows = parsed?.filter((r) => r.errors.length > 0) ?? [];
  const validLessonRows = validRows.filter((r) => r.kind === 'lesson');
  const validQuestionRows = validRows.filter((r) => r.kind === 'question');

  const confirmImport = useCallback(async () => {
    if (!parsed || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const ls: ListeningLesson[] = validLessonRows.map((r) => ({
        id: getStr(r.data, 'lesson_id'),
        title: getStr(r.data, 'title'),
        subtitle: getStr(r.data, 'subtitle'),
        level: getStr(r.data, 'level').toUpperCase() as ListeningLevel,
        category: getStr(r.data, 'category'),
        description: getStr(r.data, 'description'),
        audioSourceType: getStr(r.data, 'audio_source_type').toUpperCase() as ListeningSourceType,
        audioSource: getStr(r.data, 'audio_source'),
        audioFileName: getStr(r.data, 'audio_file_name'),
        durationSeconds: parseTs(getStr(r.data, 'duration_seconds')) ?? 0,
        transcript: getStr(r.data, 'transcript'),
        teacherName: getStr(r.data, 'teacher_name'),
        classScope: getStr(r.data, 'class_scope') ? getStr(r.data, 'class_scope').split(';').map((s) => s.trim()).filter(Boolean) : [],
        status: getStr(r.data, 'status').toUpperCase() as ListeningStatus,
        sortOrder: parseTs(getStr(r.data, 'sort_order')) ?? validLessonRows.indexOf(r) + 1,
        createdAt: new Date().toISOString(),
      }));
      const qs: ListeningQuestionFull[] = validQuestionRows.map((r) => ({
        id: getStr(r.data, 'question_id'),
        lessonId: getStr(r.data, 'lesson_id'),
        questionNo: parseTs(getStr(r.data, 'question_no')) ?? validQuestionRows.indexOf(r) + 1,
        startTimeSec: parseTs(getStr(r.data, 'start_time_sec')),
        endTimeSec: parseTs(getStr(r.data, 'end_time_sec')),
        questionText: getStr(r.data, 'question_text'),
        questionTranslationVi: getStr(r.data, 'question_translation_vi'),
        optionA: getStr(r.data, 'option_a'),
        optionB: getStr(r.data, 'option_b'),
        optionC: getStr(r.data, 'option_c'),
        optionD: getStr(r.data, 'option_d'),
        correctAnswer: getStr(r.data, 'correct_answer').toUpperCase() as ListeningAnswerKey,
        explanationVi: getStr(r.data, 'explanation_vi'),
        explanationJa: getStr(r.data, 'explanation_ja'),
        transcriptSegment: getStr(r.data, 'transcript_segment'),
        difficulty: (getStr(r.data, 'difficulty').toUpperCase() || 'NORMAL') as ListeningDifficulty,
        points: parseTs(getStr(r.data, 'points')) ?? 1,
        allowReplay: parseBool(getStr(r.data, 'allow_replay'), true),
        showExplanation: (getStr(r.data, 'show_explanation').toUpperCase() || 'AFTER_SUBMIT') as ListeningShowExplanation,
        imageUrl: getStr(r.data, 'image_url'),
        tags: getStr(r.data, 'tags'),
      }));
      if (ls.length > 0) await upsertListeningLessons(ls);
      if (qs.length > 0) await upsertListeningQuestions(qs);
      setParsed(null);
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi khi nhập dữ liệu.');
    } finally {
      setSaving(false);
    }
  }, [parsed, saving, validLessonRows, validQuestionRows, onSaved, onClose]);

  const downloadTemplate = useCallback(() => {
    const lessonRows = [{
      lesson_id: 'LISTEN_N2_001',
      title: 'Bài nghe N2 - Hẹn lịch họp',
      subtitle: 'Nghe hội thoại và chọn đáp án đúng',
      level: 'N2',
      category: 'Hội thoại',
      description: 'Luyện nghe sắp xếp lịch họp',
      audio_source_type: 'URL',
      audio_source: 'https://example.com/meeting_schedule_n2_01.mp3',
      audio_file_name: 'meeting_schedule_n2_01.mp3',
      duration_seconds: 85,
      transcript: '田中さんと佐藤さんが会議の時間について話しています。',
      teacher_name: 'Nguyễn Văn Khoa',
      class_scope: 'MVTC',
      status: 'DRAFT',
      sort_order: 1,
    }];
    const questionRows = [{
      question_id: 'Q_N2_001_01',
      lesson_id: 'LISTEN_N2_001',
      question_no: 1,
      start_time_sec: 0,
      end_time_sec: 42,
      question_text: '会議は何時から始まりますか。',
      question_translation_vi: 'Cuộc họp bắt đầu lúc mấy giờ?',
      option_a: '9時',
      option_b: '10時',
      option_c: '11時',
      option_d: '午後1時',
      correct_answer: 'B',
      explanation_vi: 'Người nói thống nhất bắt đầu lúc 10 giờ.',
      explanation_ja: '二人は10時から始めることにしました。',
      transcript_segment: 'では、10時から始めましょう。',
      difficulty: 'NORMAL',
      points: 1,
      allow_replay: 'TRUE',
      show_explanation: 'AFTER_SUBMIT',
      image_url: '',
      tags: 'time;meeting',
    }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lessonRows), 'BAI_NGHE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(questionRows), 'CAU_HOI');
    XLSX.writeFile(wb, 'mau_bai_nghe.xlsx');
  }, []);

  // ── Question editor helpers ───────────────────────────────────
  const addQuestion = () => {
    setQuestions((prev) => [...prev, {
      id: generateId('q'),
      lessonId,
      questionNo: prev.length + 1,
      startTimeSec: null,
      endTimeSec: null,
      questionText: '',
      questionTranslationVi: '',
      optionA: '',
      optionB: '',
      optionC: '',
      optionD: '',
      correctAnswer: 'A',
      explanationVi: '',
      explanationJa: '',
      transcriptSegment: '',
      difficulty: 'NORMAL',
      points: 1,
      allowReplay: true,
      showExplanation: 'AFTER_SUBMIT',
      imageUrl: '',
      tags: '',
    }]);
  };

  const updateQuestion = (idx: number, patch: Partial<ListeningQuestionFull>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, questionNo: i + 1 })));
  };

  const toggleClass = (cls: string) => {
    setClassScope((prev) => (prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]));
  };

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!title.trim()) { setSaveError('Vui lòng nhập tiêu đề.'); return; }
    if (!audioSource.trim()) { setSaveError('Vui lòng cung cấp nguồn âm thanh (upload hoặc URL).'); return; }
    const badQ = questions.findIndex((q) => !q.questionText.trim() || !q.optionA.trim() || !q.optionB.trim());
    if (badQ >= 0) { setSaveError(`Câu hỏi số ${badQ + 1} còn thiếu nội dung/đáp án A hoặc B.`); return; }
    setSaving(true);
    setSaveError('');
    try {
      const l: ListeningLesson = {
        id: lessonId,
        title: title.trim(),
        subtitle: subtitle.trim(),
        level,
        category: category.trim(),
        description: description.trim(),
        audioSourceType: sourceType,
        audioSource: audioSource.trim(),
        audioFileName,
        durationSeconds,
        transcript,
        teacherName: teacherName.trim(),
        classScope,
        status,
        sortOrder: lesson?.sortOrder ?? 1,
        createdAt: lesson?.createdAt ?? new Date().toISOString(),
      };
      await upsertListeningLessons([l]);
      if (questions.length > 0) {
        await upsertListeningQuestions(questions.map((q) => ({ ...q, lessonId })));
      }
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi khi lưu bài nghe.');
    } finally {
      setSaving(false);
    }
  }, [title, audioSource, questions, saving, lesson, subtitle, level, category, description, sourceType, audioFileName, durationSeconds, transcript, teacherName, classScope, status, lessonId, onSaved, onClose]);

  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
  const labelCls = 'mb-1 block text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:rounded-2xl md:animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Music4 size={20} className="text-blue-600" />
            {isNew ? 'Tạo bài nghe' : 'Sửa bài nghe'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        {/* Info fields */}
        <div className="mb-4 space-y-3">
          <div>
            <label className={labelCls}>Tiêu đề *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Bài nghe N2 - Hẹn lịch họp" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phụ đề</label>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Cấp độ *</label>
              <select value={level} onChange={(e) => setLevel(e.target.value as ListeningLevel)} className={inputCls}>
                {LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Danh mục</label>
              <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="Hội thoại, Monologue..." />
            </div>
            <div>
              <label className={labelCls}>Trạng thái</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as ListeningStatus)} className={inputCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{s === 'DRAFT' ? 'Nháp' : s === 'PUBLISHED' ? 'Đã xuất bản' : 'Lưu trữ'}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Mô tả</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} rows={2} />
          </div>
          <div>
            <label className={labelCls}>Giáo viên</label>
            <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Lớp áp dụng</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setClassScope([])}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${classScope.length === 0 ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
              >
                Tất cả
              </button>
              {classes.map((cls) => (
                <button
                  key={cls}
                  onClick={() => toggleClass(cls)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all ${classScope.includes(cls) ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* A. Audio source */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-bold text-slate-700">NGUỒN ÂM THANH *</p>
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => setSourceType('UPLOAD')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${sourceType === 'UPLOAD' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              <Upload size={14} /> Upload MP3
            </button>
            <button
              onClick={() => setSourceType('URL')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${sourceType === 'URL' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              <Link2 size={14} /> URL
            </button>
          </div>

          {sourceType === 'UPLOAD' ? (
            <div>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white py-5 hover:border-blue-400"
              >
                <Upload size={24} className={`mb-1.5 ${uploading ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`} />
                <p className="text-xs font-medium text-slate-600">{audioFileName || 'Chọn file MP3 (tối đa 20MB)'}</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".mp3,audio/mpeg"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />
              </div>
              {uploading && (
                <div className="mt-2">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${uploadPct}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-slate-500">{uploadPct}%</p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <input
                value={audioSource}
                onChange={(e) => setAudioSource(e.target.value)}
                className={inputCls}
                placeholder="https://example.com/audio.mp3 hoặc link Google Drive"
              />
              {getDriveFileId(audioSource) && (
                <p className="mt-1.5 text-[11px] font-medium text-emerald-600">
                  Đã nhận diện link Google Drive — học sinh sẽ nghe qua trình phát của Google.
                </p>
              )}
              {audioSource.trim() !== '' && !getDriveFileId(audioSource) && !/\.(mp3|m4a|wav|ogg)(\?|$)/i.test(audioSource) && (
                <p className="mt-1.5 text-[11px] font-medium text-amber-600">
                  Link không phải file MP3 trực tiếp cũng không phải Google Drive — có thể không phát được. Nếu là file Drive, hãy đảm bảo chia sẻ "Bất kỳ ai có link".
                </p>
              )}
            </div>
          )}

          {audioError && <p className="mt-2 text-xs font-medium text-red-500">{audioError}</p>}

          {previewUrl && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-semibold text-slate-500">Nghe thử:</p>
              <AudioPlayer src={previewUrl} onDuration={(d) => setDurationSeconds(Math.round(d))} />
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Thời lượng (giây)</label>
              <input
                type="number" min={0}
                value={durationSeconds}
                onChange={(e) => setDurationSeconds(Number(e.target.value) || 0)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Tên file</label>
              <input value={audioFileName} onChange={(e) => setAudioFileName(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Transcript */}
        <div className="mb-4">
          <label className={labelCls}>Transcript (hiện sau khi nộp bài)</label>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} className={`${inputCls} font-jp`} rows={3} />
        </div>

        {/* B. Questions */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-700">CÂU HỎI ({questions.length})</p>
            <div className="flex gap-2">
              <button onClick={downloadTemplate} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
                <Download size={12} /> Tải Excel mẫu
              </button>
              <button onClick={() => excelRef.current?.click()} className="flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-200">
                <FileSpreadsheet size={12} /> Import Excel
              </button>
              <button onClick={addQuestion} className="flex items-center gap-1 rounded-lg bg-blue-100 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-200">
                <Plus size={12} /> Thêm câu
              </button>
            </div>
          </div>
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleExcel(f); e.target.value = ''; }}
          />

          {questions.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">Chưa có câu hỏi nào. Thêm thủ công hoặc import Excel.</p>
          )}

          {questions.map((q, idx) => (
            <div key={q.id} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Câu {idx + 1}</span>
                <button onClick={() => removeQuestion(idx)} className="rounded p-1 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
              <input
                value={q.questionText}
                onChange={(e) => updateQuestion(idx, { questionText: e.target.value })}
                className={`${inputCls} mb-1.5 font-jp`}
                placeholder="Câu hỏi (tiếng Nhật) *"
              />
              <input
                value={q.questionTranslationVi}
                onChange={(e) => updateQuestion(idx, { questionTranslationVi: e.target.value })}
                className={`${inputCls} mb-2`}
                placeholder="Dịch nghĩa tiếng Việt"
              />
              <div className="mb-2 grid grid-cols-2 gap-2">
                {(['optionA', 'optionB', 'optionC', 'optionD'] as const).map((opt, i) => (
                  <input
                    key={opt}
                    value={q[opt]}
                    onChange={(e) => updateQuestion(idx, { [opt]: e.target.value } as Partial<ListeningQuestionFull>)}
                    className={`${inputCls} font-jp`}
                    placeholder={`Đáp án ${'ABCD'[i]}${i < 2 ? ' *' : ''}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Đáp án</label>
                  <select
                    value={q.correctAnswer}
                    onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value as ListeningAnswerKey })}
                    className={inputCls}
                  >
                    {(['A', 'B', 'C', 'D'] as ListeningAnswerKey[]).map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Start (s)</label>
                  <input
                    type="number" min={0}
                    value={q.startTimeSec ?? ''}
                    onChange={(e) => updateQuestion(idx, { startTimeSec: e.target.value === '' ? null : Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">End (s)</label>
                  <input
                    type="number" min={0}
                    value={q.endTimeSec ?? ''}
                    onChange={(e) => updateQuestion(idx, { endTimeSec: e.target.value === '' ? null : Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Điểm</label>
                  <input
                    type="number" min={0}
                    value={q.points}
                    onChange={(e) => updateQuestion(idx, { points: Number(e.target.value) || 1 })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  value={q.explanationVi}
                  onChange={(e) => updateQuestion(idx, { explanationVi: e.target.value })}
                  className={inputCls}
                  placeholder="Giải thích tiếng Việt"
                />
                <input
                  value={q.explanationJa}
                  onChange={(e) => updateQuestion(idx, { explanationJa: e.target.value })}
                  className={`${inputCls} font-jp`}
                  placeholder="解説 (tiếng Nhật)"
                />
              </div>
            </div>
          ))}
        </div>

        {saveError && (
          <div className="mb-3 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600">{saveError}</div>
        )}

        {/* Save */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} /> {saving ? 'Đang lưu...' : 'Lưu bài nghe'}
          </button>
        </div>
      </div>

      {/* Excel preview overlay */}
      {parsed && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setParsed(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
              <FileSpreadsheet size={18} className="text-emerald-600" /> Xem trước import
            </h4>
            <div className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">{parsedFileName}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-slate-500">
                <span>Bài nghe: {validLessonRows.length}</span>
                <span>Câu hỏi: {validQuestionRows.length}</span>
                <span className="text-emerald-600">Hợp lệ: {validRows.length}</span>
                {invalidRows.length > 0 && <span className="text-red-500">Lỗi: {invalidRows.length}</span>}
              </div>
            </div>

            <div className="mb-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
              {parsed.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 border-b border-slate-50 px-3 py-2 text-xs ${r.errors.length > 0 ? 'bg-red-50/50' : ''}`}>
                  <span className="w-8 shrink-0 font-mono text-[10px] text-slate-400">{r.rowNum}</span>
                  {r.errors.length > 0 ? (
                    <span className="flex-1 text-red-500">
                      <span className="font-medium">{r.kind === 'lesson' ? `[${getStr(r.data, 'lesson_id') || '?'}]` : `[${getStr(r.data, 'question_id') || '?'}]`}</span>
                      <ul className="mt-0.5 list-inside list-disc">
                        {r.errors.map((er, j) => <li key={j}>{er}</li>)}
                      </ul>
                    </span>
                  ) : r.kind === 'lesson' ? (
                    <span className="flex-1">
                      <span className="font-semibold text-slate-700">{getStr(r.data, 'title')}</span>
                      <span className="ml-2 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-bold text-blue-600">{getStr(r.data, 'level')}</span>
                    </span>
                  ) : (
                    <span className="font-jp flex-1 truncate text-slate-700">{getStr(r.data, 'question_text')}</span>
                  )}
                  {r.errors.length === 0 && <Check size={13} className="shrink-0 text-emerald-500" />}
                  {r.errors.length > 0 && <AlertTriangle size={13} className="shrink-0 text-red-400" />}
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
                <FileSpreadsheet size={15} />
                {saving ? 'Đang nhập...' : `Nhập ${validRows.length} dòng`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
