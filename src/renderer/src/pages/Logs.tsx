import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Empty } from '@/components/ui/primitives';
import { useAction } from '@/lib/action';
import { LOG_KIND_LABELS, LOG_PAGE_EXCLUDED_KINDS, LOG_PAGE_KIND_ORDER } from '@/lib/constants';
import { devmgr } from '@/lib/devmgr';
import { cn } from '@/lib/utils';
import type { LogSource } from '@/lib/types';

function isGlobal(src: LogSource): boolean {
  return Boolean(src.kind) && !LOG_PAGE_EXCLUDED_KINDS.has(src.kind);
}

export function Logs() {
  const { t } = useTranslation();
  const { runAction } = useAction();
  const [sources, setSources] = useState<LogSource[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState(() => t('logs.viewerTitle'));
  const [content, setContent] = useState(() => t('logs.selectPrompt'));

  const viewRef = useRef<HTMLPreElement>(null);
  const appendCleanup = useRef<(() => void) | null>(null);
  const activeRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    const el = viewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const teardown = useCallback(async () => {
    const id = activeRef.current;
    activeRef.current = null;
    appendCleanup.current?.();
    appendCleanup.current = null;
    if (id) {
      try {
        await devmgr.logs.unfollow(id);
      } catch {
        // ignore
      }
    }
  }, []);

  const select = useCallback(
    async (id: string, label: string) => {
      if (activeRef.current === id) return;
      await teardown();
      activeRef.current = id;
      setActiveId(id);
      setActiveLabel(label);
      setContent(t('common.loading'));
      try {
        const lines = await devmgr.logs.tail(id, 200);
        setContent(lines.join('\n') || t('logs.empty'));
        requestAnimationFrame(scrollToBottom);
        appendCleanup.current = devmgr.logs.onAppend(({ id: sourceId, chunk }) => {
          if (sourceId !== id) return;
          setContent((prev) => prev + chunk);
          requestAnimationFrame(scrollToBottom);
        });
        await devmgr.logs.follow(id);
      } catch (err) {
        setContent(err instanceof Error ? err.message : String(err));
      }
    },
    [teardown],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await devmgr.logs.list();
      const filtered = (all as LogSource[]).filter(isGlobal);
      if (cancelled) return;
      setSources(filtered);
      if (!activeRef.current && filtered[0]) void select(filtered[0].id, filtered[0].label);
    })();
    return () => {
      cancelled = true;
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byKind = new Map<string, LogSource[]>();
  for (const src of sources) {
    const kind = src.kind || 'other';
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind)!.push(src);
  }
  const kinds = [
    ...LOG_PAGE_KIND_ORDER.filter((k) => byKind.has(k)),
    ...[...byKind.keys()].filter((k) => !LOG_PAGE_KIND_ORDER.includes(k)),
  ];

  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface/40 p-3">
        <p className="text-xs text-text-muted">{t('logs.intro')}</p>
        {sources.length === 0 ? (
          <Empty>{t('logs.noFiles')}</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {kinds.map((kind) => (
              <li key={kind}>
                <span className="px-1 text-xs font-medium uppercase tracking-wide text-text-muted">
                  {LOG_KIND_LABELS[kind] ?? kind}
                </span>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {byKind.get(kind)!.map((src) => (
                    <li key={src.id}>
                      <button
                        type="button"
                        onClick={() =>
                          runAction({
                            key: `logs-tab-${src.id}`,
                            successToast: false,
                            run: () => select(src.id, src.label),
                          })
                        }
                        className={cn(
                          'w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                          src.id === activeId
                            ? 'bg-primary/10 text-primary'
                            : 'text-text-secondary hover:bg-surface hover:text-foreground',
                        )}
                      >
                        {src.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-surface/40">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold">{activeLabel}</h3>
          <Button
            size="sm"
            disabled={!activeId}
            onClick={() =>
              activeId &&
              runAction({
                key: `log-popout-${activeId}`,
                successToast: false,
                run: () => devmgr.logs.open(activeId, activeLabel),
              })
            }
          >
            {t('logs.openInWindow')}
          </Button>
        </header>
        <pre
          ref={viewRef}
          className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-text-secondary"
        >
          {content}
        </pre>
      </div>
    </div>
  );
}
