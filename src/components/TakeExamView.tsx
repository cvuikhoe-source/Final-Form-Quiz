import { useState, useEffect, useRef } from 'react';
import type { Exam } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { getSubjectMeta } from '@/storage';
import { X, ExternalLink, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

interface TakeExamViewProps {
  exam: Exam;
  completed: boolean;
  onClose: () => void;
  onComplete: (id: string) => void;
}

export function TakeExamView({ exam, completed, onClose, onComplete }: TakeExamViewProps) {
  const { t } = useLanguage();
  const [secondsLeft, setSecondsLeft] = useState(exam.durationMinutes * 60);
  const [iframeError, setIframeError] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const meta = getSubjectMeta(exam.subject);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const isProbablyBlocked = exam.formsUrl.includes('forms.office.com');
      if (isProbablyBlocked) {
        setIframeError(true);
      }
    }, 4000);
    return () => clearTimeout(timeout);
  }, [exam.formsUrl]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isUrgent = secondsLeft <= 60 && secondsLeft > 0;
  const isTimeUp = secondsLeft === 0;

  const handleConfirmComplete = () => {
    onComplete(exam.id);
    setShowCompleteConfirm(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Top bar with countdown */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2.5 shadow-sm safe-top">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          <X size={20} />
          {t('exam.exit')}
        </button>

        <div className="flex items-center gap-2">
          <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${meta.bg} ${meta.text}`}>
            {exam.subject}
          </span>
          <div
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-lg font-bold tabular-nums transition-colors ${
              isTimeUp
                ? 'bg-red-600 text-white'
                : isUrgent
                ? 'bg-red-50 text-red-600 animate-pulse'
                : 'bg-blue-50 text-blue-700'
            }`}
          >
            <Clock size={18} />
            {timeStr}
          </div>
        </div>
      </div>

      {/* Exam title bar */}
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
        <p className="truncate text-sm font-semibold text-slate-700">{exam.title}</p>
      </div>

      {/* Iframe or fallback */}
      <div className="relative flex-1 overflow-hidden">
        {!iframeError ? (
          <iframe
            ref={iframeRef}
            src={exam.formsUrl}
            className="h-full w-full border-0"
            title={exam.title}
            sandbox="allow-same-origin allow-forms allow-scripts allow-popups allow-popups-to-escape-sandbox"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle size={32} className="text-amber-600" />
            </div>
            <h3 className="mb-2 text-lg font-bold text-slate-800">{t('exam.iframeErrorTitle')}</h3>
            <p className="mb-6 max-w-xs text-sm leading-relaxed text-slate-500">
              {t('exam.iframeErrorBody')}
            </p>
            <a
              href={exam.formsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-blue-700"
            >
              <ExternalLink size={18} />
              {t('exam.openNewTab')}
            </a>
            <p className="text-xs text-slate-400">
              {t('exam.timerNote')}
            </p>
          </div>
        )}

        {isTimeUp && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
              <Clock size={40} className="mx-auto mb-2 text-red-500" />
              <h3 className="mb-1 text-lg font-bold text-slate-800">{t('exam.timeUpTitle')}</h3>
              <p className="mb-4 text-sm text-slate-500">{t('exam.timeUpBody')}</p>
              <button
                onClick={handleConfirmComplete}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white"
              >
                {t('exam.submitted')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-slate-200 bg-white px-4 py-3 safe-bottom">
        <div className="flex gap-2">
          {iframeError && (
            <a
              href={exam.formsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition-all active:scale-[0.98] hover:bg-slate-100"
            >
              <ExternalLink size={18} />
              {t('exam.openTabNew')}
            </a>
          )}
          {completed ? (
            <div className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={18} />
              {t('exam.alreadySubmitted')}
            </div>
          ) : (
            <button
              onClick={() => setShowCompleteConfirm(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-[0.98] hover:bg-emerald-700"
            >
              <CheckCircle2 size={18} />
              {t('exam.markDone')}
            </button>
          )}
        </div>
      </div>

      {/* Complete confirmation modal */}
      {showCompleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 animate-fade-in"
          onClick={() => setShowCompleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 size={28} className="text-emerald-600" />
            </div>
            <h3 className="mb-2 text-center text-lg font-bold text-slate-800">
              {t('exam.confirmTitle')}
            </h3>
            <p className="mb-6 text-center text-sm text-slate-500">
              {t('exam.confirmBody', { title: exam.title })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmComplete}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
