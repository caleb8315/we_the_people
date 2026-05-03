'use client';

import { useMemo, useState } from 'react';

interface ExpandableTextProps {
  text: string;
  previewLines?: number;
  minCharsToCollapse?: number;
  className?: string;
}

export function ExpandableText({
  text,
  previewLines = 5,
  minCharsToCollapse = 340,
  className = '',
}: ExpandableTextProps) {
  const value = String(text ?? '').trim();
  const shouldCollapse = value.length >= minCharsToCollapse || lineCount(value) > previewLines + 1;
  const [expanded, setExpanded] = useState(false);

  const preview = useMemo(() => {
    if (!shouldCollapse || expanded) return value;
    return buildPreview(value, previewLines);
  }, [expanded, previewLines, shouldCollapse, value]);

  return (
    <div className={className}>
      <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700 sm:text-sm">{preview}</pre>
      {shouldCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 rounded-full border border-ink-200 bg-paper px-2.5 py-1 text-[11px] font-medium text-ink-600 hover:border-ink-300 hover:text-ink"
        >
          {expanded ? 'Show less' : 'Expand message'}
        </button>
      )}
    </div>
  );
}

function buildPreview(text: string, previewLines: number): string {
  const lines = text.split(/\r?\n/);
  if (lines.length > previewLines) {
    return `${lines.slice(0, previewLines).join('\n')}\n…`;
  }
  return `${text.slice(0, 360).trimEnd()}…`;
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).length;
}
