import { useEffect, useState } from 'react';
import { Button, Empty, Field, Hint, Input, Toggle } from '@/components/ui/primitives';
import { Dropdown } from '@/components/ui/Dropdown';
import { useAction } from '@/lib/action';
import { devmgr } from '@/lib/devmgr';
import { useStore } from '@/lib/store';
import { useToast } from '@/lib/toast';

type RedisData = Awaited<ReturnType<typeof devmgr.redis.getSettings>>;

const POLICIES = [
  'noeviction',
  'allkeys-lru',
  'allkeys-lfu',
  'volatile-lru',
  'volatile-lfu',
  'allkeys-random',
  'volatile-random',
  'volatile-ttl',
];

export function RedisSettings() {
  const { runAction } = useAction();
  const { refresh } = useStore();
  const toast = useToast();
  const [data, setData] = useState<RedisData | null>(null);
  const [port, setPort] = useState('6379');
  const [password, setPassword] = useState('');
  const [maxmemory, setMaxmemory] = useState('');
  const [policy, setPolicy] = useState('noeviction');
  const [appendonly, setAppendonly] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const load = async () => {
    const d = await devmgr.redis.getSettings();
    setData(d);
    setPort(String(d.port));
    setPassword(d.password);
    setMaxmemory(d.maxmemory);
    setPolicy(d.maxmemoryPolicy || 'noeviction');
    setAppendonly(d.appendonly);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!data) return <Empty>Loading Redis settings…</Empty>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <Field label="Port">
          <Input
            className="max-w-40"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
          />
        </Field>

        <Field label="Password (requirepass — empty = no auth)">
          <div className="flex max-w-md items-center gap-2">
            <Input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="no password set"
              autoComplete="off"
            />
            <Button size="sm" onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Hide' : 'Show'}
            </Button>
          </div>
        </Field>

        <Field label="Max memory (empty = unlimited)">
          <Input
            className="max-w-40"
            value={maxmemory}
            onChange={(e) => setMaxmemory(e.target.value)}
            placeholder="256mb"
          />
        </Field>

        <Field label="Eviction policy (when max memory is reached)">
          <Dropdown
            className="max-w-xs"
            ariaLabel="Eviction policy"
            value={policy}
            options={POLICIES.map((p) => ({ value: p, label: p }))}
            onChange={setPolicy}
          />
        </Field>

        <Toggle
          label="Append-only file (AOF persistence)"
          checked={appendonly}
          onChange={setAppendonly}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() =>
            runAction({
              key: 'redis-save',
              label: 'Save Redis settings',
              global: true,
              run: async () => {
                await devmgr.redis.saveSettings({
                  port: Number(port) || data.port,
                  password,
                  maxmemory,
                  maxmemoryPolicy: policy === 'noeviction' ? '' : policy,
                  appendonly,
                });
                await refresh();
                await load();
                toast.success('Redis settings saved and restarted.');
              },
            })
          }
        >
          Save & restart Redis
        </Button>
        <Button
          size="sm"
          onClick={() =>
            runAction({
              key: 'redis-open-conf',
              label: 'Open redis.conf',
              successToast: false,
              run: async () => {
                await devmgr.redis.openConf();
                toast.success('redis.conf opened');
              },
            })
          }
        >
          Open redis.conf
        </Button>
      </div>

      <Hint>
        Settings are saved to Stacklet config and written to <code>redis.conf</code> (which Stacklet
        regenerates, so edit values here rather than the file). Clients then connect with{' '}
        <code>AUTH</code> when a password is set.
      </Hint>
      {!data.aclSupported && (
        <Hint>
          <strong>Users:</strong> the bundled Redis is 5.x, which has a single shared password and no
          ACL user accounts. Per-user accounts (<code>ACL SETUSER</code>) require Redis 6+.
        </Hint>
      )}
    </div>
  );
}
