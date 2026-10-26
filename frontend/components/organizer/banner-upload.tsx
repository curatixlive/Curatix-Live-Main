'use client';

import * as React from 'react';
import { ImagePlus, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The banner picker: a wide drop-target button instead of the browser's grey
 * "Choose File" control.
 *
 * It shows the picture that will be used (the one just chosen, else the saved
 * one), says what to do next, and offers Replace and Remove-the-pick. Dropping
 * a file works as well as pressing. The native input stays underneath — it is
 * what carries the file and what keyboard and screen-reader users operate — and
 * is only visually replaced.
 */
export function BannerUpload({
  id,
  currentUrl,
  previewUrl,
  fileName,
  onPick,
  onClear,
}: {
  id: string;
  /** The saved banner, if any. */
  currentUrl?: string;
  /** An object URL for the file just chosen, if any. */
  previewUrl: string | null;
  fileName?: string;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const shown = previewUrl ?? currentUrl ?? '';

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && file.type.startsWith('image/')) onPick(file);
        }}
        className={cn(
          'group relative flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-sunken transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          over ? 'border-primary bg-nav-active' : 'border-border-strong hover:border-primary',
        )}
        aria-label={shown ? 'Replace banner image' : 'Upload banner image'}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview or remote user media
          <img src={shown} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <span
          className={cn(
            'relative inline-flex items-center gap-2 rounded-full px-4 py-2 text-body-sm font-semibold shadow-sm transition-transform group-hover:scale-[1.03] motion-reduce:transition-none',
            shown
              ? 'bg-surface/95 text-foreground backdrop-blur'
              : 'bg-primary text-primary-foreground',
          )}
        >
          {shown ? (
            <RefreshCw className="size-4" aria-hidden />
          ) : (
            <ImagePlus className="size-4" aria-hidden />
          )}
          {shown ? 'Replace banner' : 'Upload banner'}
        </span>
      </button>
      <div className="flex min-h-5 items-start justify-between gap-3 text-caption text-muted-foreground">
        <span className="min-w-0">
          {fileName
            ? `${fileName} — not saved yet`
            : 'Drag a wide image here, or press the button. About 1600 × 400, JPEG, PNG or WebP, up to 10 MB.'}
        </span>
        {fileName ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
          >
            <X className="size-3.5" aria-hidden />
            Undo
          </button>
        ) : null}
      </div>
    </div>
  );
}
