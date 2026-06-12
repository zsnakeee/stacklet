import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './globals.css';
import { devmgr } from '@/lib/devmgr';

function LogWindow() {
  const params = new URLSearchParams(window.location.search);
  const logId = params.get('id');
  const label = params.get('label') || 'Log';
  const [content, setContent] = useState('');
  const viewRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    document.title = label;
  }, [label]);

  useEffect(() => {
    if (!logId) {
      setContent('No log id');
      return;
    }
    let cleanup: (() => void) | null = null;
    void (async () => {
      try {
        const lines = await devmgr.logs.tail(logId, 200);
        setContent(lines.join('\n') || '(empty)');
        cleanup = devmgr.logs.onAppend(({ id, chunk }) => {
          if (id !== logId) return;
          setContent((prev) => prev + chunk);
          requestAnimationFrame(() => {
            const el = viewRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          });
        });
        await devmgr.logs.follow(logId);
      } catch (err) {
        setContent(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cleanup?.();
      void devmgr.logs.unfollow(logId);
    };
  }, [logId]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="border-b border-border px-4 py-2.5">
        <h1 className="text-sm font-semibold text-foreground">{label}</h1>
      </header>
      <pre
        ref={viewRef}
        className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-text-secondary"
      >
        {content}
      </pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LogWindow />
  </StrictMode>,
);
