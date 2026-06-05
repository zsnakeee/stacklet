import net from 'net';

export type PipeProbeState = 'ready' | 'missing' | 'denied';

/** Listen on a named pipe with ACLs that allow non-elevated clients (Windows). */
export function listenOnPipe(
  server: net.Server,
  pipePath: string,
  onListening?: () => void,
): void {
  if (process.platform === 'win32') {
    server.listen(
      { path: pipePath, readableAll: true, writableAll: true },
      onListening,
    );
    return;
  }
  server.listen(pipePath, onListening);
}

export function probePipe(pipePath: string): Promise<PipeProbeState> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: pipePath });
    socket.once('connect', () => {
      socket.destroy();
      resolve('ready');
    });
    socket.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        resolve('denied');
        return;
      }
      resolve('missing');
    });
  });
}
