require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool }  = require('./config/database');
const logger    = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 500 }));

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok:true, db:'conectada' }); }
  catch { res.status(503).json({ ok:false, db:'error' }); }
});

// Todas las rutas de los 9 sprints
app.use('/api', require('./routes/index'));          // Auth + Usuarios
app.use('/api', require('./routes/catalogos'));       // Catálogos
app.use('/api', require('./routes/proyectos'));       // Proyectos
app.use('/api', require('./routes/almacenes'));       // Almacenes
app.use('/api', require('./routes/ordenesCompra'));   // OC
app.use('/api', require('./routes/ordenesTrabajo'));  // OT
app.use('/api', require('./routes/finanzas'));        // Ingresos/Gastos/IVA
app.use('/api', require('./routes/reportes'));        // Reportes
app.use('/api', require('./routes/rrhh'));            // RRHH/Nómina

app.use((err, req, res, next) => {
  logger.error('Error:', err.message);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
});
app.use((req, res) => res.status(404).json({ error: `Ruta no encontrada: ${req.path}` }));

app.listen(PORT, () => logger.info(`ERP corriendo en puerto ${PORT} [${process.env.NODE_ENV || 'dev'}]`));
module.exports = app;
