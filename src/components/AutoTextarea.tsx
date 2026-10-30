import { useEffect, useRef } from 'react';

interface AutoTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  // Extra classes appended after className so they win the Tailwind conflict (e.g. font-jp)
  classNameAfter?: string;
  relaxed?: boolean;
}

export function AutoTextarea({
  value,
  onChange,
  placeholder,
  minHeight = 90,
  maxHeight = 600,
  className = '',
  classNameAfter = '',
  relaxed = false,
}: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, maxHeight))}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, minHeight, maxHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${className} ${classNameAfter} ${relaxed ? 'leading-relaxed text-[15px]' : ''} resize-none block w-full`}
      style={{ minHeight, padding: '12px', lineHeight: relaxed ? 1.7 : undefined, fontSize: relaxed ? '15px' : undefined }}
    />
  );
}
