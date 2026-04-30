export function notFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
}

export function errorHandler(err, req, res, _next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error:   err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
