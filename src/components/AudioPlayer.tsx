import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw, Gauge, ExternalLink, AlertTriangle } from 'lucide-react';

interface AudioPlayerProps {
  src: string;
  onDuration?: (d: number) => void;
  seekTo?: { time: number; nonce: number } | null;
}

const SPEEDS = [0.75, 1, 1.25, 1.5];

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function getDriveFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=)|docs\.google\.com\/file\/d\/)([a-zA-Z0-9_-]{20,})/);
  return m?.[1] ?? null;
}

// Google Drive sets X-Frame-Options on /view and blocks <audio> on /uc, but the
// usercontent download endpoint streams with permissive headers.
export function getDirectAudioUrl(url: string): string {
  const fileId = getDriveFileId(url);
  if (fileId) return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
  return url;
}

export function AudioPlayer({ src, onDuration, seekTo }: AudioPlayerProps) {
  const { t } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState(false);

  const driveFileId = useMemo(() => getDriveFileId(src), [src]);
  const streamSrc = useMemo(() => getDirectAudioUrl(src), [src]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => setError(true)); }
    else a.pause();
  }, []);

  const skip = useCallback((delta: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.min(Math.max(0, a.currentTime + delta), a.duration || 0);
  }, []);

  const changeSpeed = useCallback(() => {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !seekTo) return;
    a.currentTime = Math.min(seekTo.time, a.duration || seekTo.time);
    a.play().catch(() => setError(true));
  }, [seekTo]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <audio
        ref={audioRef}
        src={streamSrc}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d)) { setDuration(d); onDuration?.(d); }
        }}
        onError={(e) => {
          console.error('Lỗi tải audio:', e.currentTarget.error, src);
          setError(true);
        }}
      />
      {error && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
            <AlertTriangle size={14} /> {t('audio.errorTitle')}
          </p>
          {driveFileId ? (
            <a
              href={`https://drive.google.com/file/d/${driveFileId}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <ExternalLink size={14} /> {t('audio.openDrive')}
            </a>
          ) : (
            <p className="mt-1 text-[11px] text-amber-600">{t('audio.checkLink')}</p>
          )}
        </div>
      )}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = Number(e.target.value); }}
        className="mb-2 h-2 w-full cursor-pointer accent-blue-600"
        aria-label={t('audio.progress')}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition-all hover:bg-blue-700 active:scale-95"
            aria-label={playing ? t('audio.pause') : t('audio.play')}
          >
            {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
          <button onClick={() => skip(-5)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={t('audio.rewind5')}>
            <RotateCcw size={18} />
          </button>
          <button onClick={() => skip(5)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={t('audio.forward5')}>
            <RotateCw size={18} />
          </button>
          <span className="ml-1 text-xs font-medium tabular-nums text-slate-600">
            {fmt(current)} / {fmt(duration)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={changeSpeed} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200" aria-label={t('audio.changeSpeed')}>
            <Gauge size={14} /> {speed}x
          </button>
          <button
            onClick={() => { setMuted((m) => !m); if (audioRef.current) audioRef.current.muted = !muted; }}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label={muted ? t('audio.unmute') : t('audio.mute')}
          >
            {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v); setMuted(v === 0);
              if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = v === 0; }
            }}
            className="hidden h-1.5 w-20 cursor-pointer accent-blue-600 sm:block"
            aria-label={t('audio.volume')}
          />
        </div>
      </div>
    </div>
  );
}
