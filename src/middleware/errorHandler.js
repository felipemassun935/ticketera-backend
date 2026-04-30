export function notFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    process.stderr.write(`${ts}  ERROR  ${req.method} ${req.originalUrl}\n${err.stack || err.message}\n`);
  }
  res.status(status).json({
    error:   err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
