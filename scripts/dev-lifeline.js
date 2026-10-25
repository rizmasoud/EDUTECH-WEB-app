'use strict';
/**
 * Lifeline guard for the API development runner (scripts/dev-api.mjs). Preloaded into every Node.js process of the
 * runner's process tree through NODE_OPTIONS ("--require"); it does nothing unless EDUTECH_DEV_LIFELINE is set.
 *
 * The runner listens on a private local socket (a unix socket, or a named pipe on Windows) for each process tree it
 * starts. This guard connects to it, reports the process id on one line, and then keeps the connection open:
 *
 *  - When the connection ends, the runner released the tree (a restart or a shutdown) or the runner itself died, even
 *    abruptly (SIGKILL, a crash, a terminated terminal). The process then exits. This is how a process that outlives
 *    its parent (on Windows there are no process groups, and no link from a child to a parent that already exited)
 *    still gets cleaned up, without anyone having to look up its PID.
 *  - If the socket cannot be reached because it no longer exists (the runner is gone, or already released the tree and
 *    stopped listening), a process that starts late exits at once instead of becoming an orphan.
 *  - Because the connection is open for exactly as long as the process is alive, the runner can tell which processes of
 *    the tree are still running, and the pid reported here is certain to identify this process.
 *
 * The connection is unref'd: it never keeps a process alive on its own. Dependency-free on purpose.
 */
const lifeline = process.env.EDUTECH_DEV_LIFELINE;

if (lifeline) {
  const net = require('node:net');
  const socket = net.connect(lifeline);
  let connected = false;
  socket.unref();
  socket.on('connect', () => {
    connected = true;
    socket.write(`${process.pid}\n`);
  });
  socket.on('error', (error) => {
    // "No such socket" or "refused": the runner is gone or has released this tree, so this process is an orphan.
    // Any other failure to connect means the lifeline itself is unusable (not that the runner is gone): keep running,
    // unguarded, rather than breaking development over a problem with the guard.
    if (!connected && error.code !== 'ENOENT' && error.code !== 'ECONNREFUSED') {
      process.stderr.write(`[dev-lifeline] pid ${process.pid}: cannot use the runner lifeline (${error.code}); continuing unguarded.\n`);
      socket.removeAllListeners('close');
    }
  });
  // Read, so that the runner closing its end is noticed (an unread socket never reports it).
  socket.resume();
  socket.on('close', () => process.exit(0));
}
