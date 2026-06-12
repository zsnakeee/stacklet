import { devmgr } from '@/lib/devmgr';

/** Resolve + open a service's log in the pop-out window. Returns false if none yet. */
export async function openServiceLog(bundledId: string): Promise<boolean> {
  const logId = await devmgr.logs.resolveForService(bundledId);
  if (!logId) return false;
  const sources = await devmgr.logs.list();
  const src = sources.find((s) => s.id === logId);
  await devmgr.logs.open(logId, src?.label ?? 'Log');
  return true;
}

/** Resolve + open a site's Laravel log in the pop-out window. Returns false if none. */
export async function openSiteLog(siteName: string): Promise<boolean> {
  const logId = await devmgr.site.resolveLog(siteName);
  if (!logId) return false;
  const sources = await devmgr.logs.list();
  const src = sources.find((s) => s.id === logId);
  await devmgr.logs.open(logId, src?.label ?? 'Laravel log');
  return true;
}
