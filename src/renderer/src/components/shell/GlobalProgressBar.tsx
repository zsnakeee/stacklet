import { useEffect, useRef, useState } from 'react';
import { useAction } from '@/lib/action';
import { cn } from '@/lib/utils';

/**
 * Thin top progress bar shown whenever ANY action is running. Indeterminate
 * (we don't know real percent for most ops), so it eases toward ~90% while busy
 * then completes and fades out — giving every action immediate visible feedback.
 */
export function GlobalProgressBar() {
  const { anyBusy } = useAction();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (anyBusy) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(true);
      setProgress((p) => (p < 8 ? 8 : p));
      timer.current = setInterval(() => {
        // Ease toward 90% — never reach 100 until the action finishes.
        setProgress((p) => (p >= 90 ? 90 : p + Math.max(0.5, (90 - p) * 0.08)));
      }, 120);
      return () => {
        if (timer.current) clearInterval(timer.current);
      };
    }
    // Finished: snap to 100, then fade out and reset.
    if (timer.current) clearInterval(timer.current);
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 280);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [anyBusy]);

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div
        className="h-full bg-gradient-to-r from-[#2dd4aa] to-[#60a5fa] shadow-[0_0_8px_rgba(45,212,170,0.6)] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
