const RESET  = '\x1b[0m';
const DIM    = '\x1b[2m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';

function statusColor(code) {
  if (code >= 500) return RED;
  if (code >= 400) return YELLOW;
  if (code >= 300) return CYAN;
  return GREEN;
}

function pad(str, len) {
  return String(str).padEnd(len);
}

export function requestLogger(req, res, next) {
  // Skip health checks to avoid noise
  if (req.path === '/api/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const code   = res.statusCode;
    const color  = statusColor(code);
    const ts     = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const method = pad(req.method, 7);
    const path   = req.originalUrl;
    const user   = req.user ? ` ${DIM}[${req.user.name ?? req.user.email}]${RESET}` : '';

    process.stdout.write(
      `${DIM}${ts}${RESET}  ${BOLD}${color}${code}${RESET}  ${CYAN}${method}${RESET}${path}${user}  ${DIM}${ms}ms${RESET}\n`
    );
  });

  next();
}

export function actionLogger(action, detail = '') {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  process.stdout.write(`${DIM}${ts}${RESET}  ${YELLOW}ACT${RESET}  ${BOLD}${action}${RESET}${detail ? `  ${DIM}${detail}${RESET}` : ''}\n`);
}
