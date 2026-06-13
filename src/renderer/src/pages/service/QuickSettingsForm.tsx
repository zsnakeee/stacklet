import { useEffect, useState, type ReactNode } from 'react';
import { Button, Empty, Field, Input, Toggle } from '@/components/ui/primitives';
import { Dropdown } from '@/components/ui/Dropdown';
import { useAction } from '@/lib/action';
import type { QuickField } from '@/lib/constants';

type FormValue = string | boolean;
type Values = Record<string, FormValue>;

/**
 * Generic quick-edit settings form for a list of fields. Loads current values
 * for the selected version, renders typed inputs, and saves a patch.
 */
export function QuickSettingsForm({
  version,
  fields,
  actionKey,
  saveLabel,
  load,
  save,
  emptyText,
  toolbar,
  footnote,
}: {
  version: string;
  fields: QuickField[];
  actionKey: string;
  saveLabel: string;
  load: (version: string) => Promise<Record<string, unknown> | null>;
  save: (patch: Record<string, string | number | boolean>, version: string) => Promise<void>;
  emptyText: string;
  toolbar?: ReactNode;
  footnote?: ReactNode;
}) {
  const { runAction } = useAction();
  const [values, setValues] = useState<Values | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await load(version);
      if (!alive) return;
      if (!data) {
        setMissing(true);
        setValues(null);
        return;
      }
      const next: Values = {};
      for (const f of fields) {
        const raw = data[f.key];
        next[f.key] = f.type === 'checkbox' ? Boolean(raw) : raw == null ? '' : String(raw);
      }
      setMissing(false);
      setValues(next);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const set = (key: string, value: FormValue) => setValues((prev) => ({ ...(prev ?? {}), [key]: value }));

  const onSave = () =>
    runAction({
      key: actionKey,
      label: saveLabel,
      run: async () => {
        const patch: Record<string, string | number | boolean> = {};
        for (const f of fields) {
          const v = values?.[f.key];
          if (f.type === 'checkbox') {
            patch[f.key] = Boolean(v);
            continue;
          }
          const str = String(v ?? '');
          if (str === '') continue;
          patch[f.key] = f.type === 'number' ? Number(str) : str;
        }
        await save(patch, version);
      },
    });

  if (missing) return <Empty>{emptyText}</Empty>;
  if (!values) return <Empty>Loading…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      {footnote}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          if (f.type === 'checkbox') {
            return (
              <Toggle
                key={f.key}
                label={f.label}
                checked={Boolean(values[f.key])}
                onChange={(c) => set(f.key, c)}
              />
            );
          }
          if (f.type === 'select') {
            return (
              <Field key={f.key} label={f.label} inline>
                <Dropdown
                  className="min-w-44"
                  ariaLabel={f.label}
                  value={String(values[f.key] ?? '')}
                  options={(f.options ?? []).map((o) => ({
                    value: String(o.value),
                    label: o.label,
                  }))}
                  onChange={(v) => set(f.key, v)}
                />
              </Field>
            );
          }
          return (
            <Field key={f.key} label={f.label} inline>
              <Input
                type={f.type === 'number' ? 'number' : 'text'}
                className="max-w-44"
                value={String(values[f.key] ?? '')}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </Field>
          );
        })}
      </div>
      <div>
        <Button variant="primary" onClick={onSave}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
