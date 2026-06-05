const params = new URLSearchParams(window.location.search);
const logId = params.get('id');
const label = params.get('label') || 'Log';
const logViewEl = document.getElementById('log-view');

document.getElementById('log-title').textContent = label;
document.title = label;

let unfollowLog = null;

async function loadLog() {
  if (!logId) {
    logViewEl.textContent = 'No log id';
    return;
  }

  const lines = await window.devmgr.logs.tail(logId, 200);
  logViewEl.textContent = lines.join('\n') || '(empty)';

  unfollowLog = window.devmgr.logs.onAppend(({ id, chunk }) => {
    if (id !== logId) return;
    logViewEl.textContent += chunk;
    logViewEl.scrollTop = logViewEl.scrollHeight;
  });
  await window.devmgr.logs.follow(logId);
}

window.addEventListener('beforeunload', () => {
  if (logId && unfollowLog) {
    void window.devmgr.logs.unfollow(logId);
    unfollowLog();
  }
});

loadLog().catch((err) => {
  logViewEl.textContent = err.message ?? String(err);
});
