require('dotenv').config();
const bcrypt = require('bcryptjs');
const { withTransaction } = require('./database');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

const runSeed = async () => {
  logger.info('Iniciando seed de datos iniciales...');

  await withTransaction(async (client) => {

    // ── Empresa ─────────────────────────────────────────────
    await client.query(`
      INSERT INTO empresa (nombre, rfc, email)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `, ['Mi Empresa SA de CV', 'MEM000101AAA', 'admin@empresa.com']);

    // ── Unidades de Negocio ──────────────────────────────────
    await client.query(`
      INSERT INTO unidades_negocio (codigo, nombre, descripcion) VALUES
        ('CI', 'Comercio e Industria',    'Proyectos y ventas al sector comercial e industrial'),
        ('PY', 'Pymes',                   'Servicios y soluciones para pequenas y medianas empresas'),
        ('OM', 'Operacion y Mantenimiento','Contratos de operacion y mantenimiento')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ── Roles ────────────────────────────────────────────────
    const rolesRes = await client.query(`
      INSERT INTO roles (nombre, nivel, descripcion) VALUES
        ('Administrador', 1, 'Acceso total al sistema — todas las unidades'),
        ('Coordinador',   2, 'Acceso a su unidad de negocio con edicion y autorizacion'),
        ('Captura',       3, 'Ingreso de datos — sin eliminacion ni autorizacion')
      ON CONFLICT DO NOTHING
      RETURNING id, nombre
    `);

    // Obtener IDs de roles
    const rolesQ = await client.query('SELECT id, nombre FROM roles ORDER BY nivel');
    const rolMap = {};
    rolesQ.rows.forEach(r => rolMap[r.nombre] = r.id);
    const adminRolId = rolMap['Administrador'];
    const coordRolId = rolMap['Coordinador'];
    const capturaRolId = rolMap['Captura'];

    // ── Departamentos ────────────────────────────────────────
    await client.query(`
      INSERT INTO departamentos (nombre) VALUES
        ('Direccion General'),
        ('Comercial y Marketing'),
        ('Administracion'),
        ('Operaciones CI'),
        ('Operaciones Pymes'),
        ('Operaciones OyM')
      ON CONFLICT DO NOTHING
    `);

    // ── Permisos por Rol ─────────────────────────────────────
    const modulos = [
      'clientes','proveedores','proyectos','presupuesto_familias',
      'ingresos','gastos','ordenes_compra','ordenes_trabajo',
      'almacenes','inventario','compras','reportes',
      'usuarios','configuracion','recursos_humanos','nomina','checador'
    ];

    // Admin — acceso total
    for (const mod of modulos) {
      await client.query(`
        INSERT INTO permisos (rol_id,modulo,puede_ver,puede_crear,puede_editar,puede_eliminar,puede_exportar,puede_autorizar)
        VALUES ($1,$2,true,true,true,true,true,true)
        ON CONFLICT DO NOTHING
      `, [adminRolId, mod]);
    }

    // Coordinador — sin eliminar, sin config ni usuarios
    const modCoord = modulos.filter(m => !['usuarios','configuracion'].includes(m));
    for (const mod of modCoord) {
      await client.query(`
        INSERT INTO permisos (rol_id,modulo,puede_ver,puede_crear,puede_editar,puede_eliminar,puede_exportar,puede_autorizar)
        VALUES ($1,$2,true,true,true,false,true,true)
        ON CONFLICT DO NOTHING
      `, [coordRolId, mod]);
    }

    // Captura — solo ver y crear
    const modCaptura = ['clientes','proveedores','proyectos','ingresos','gastos','ordenes_compra','ordenes_trabajo','inventario'];
    for (const mod of modCaptura) {
      await client.query(`
        INSERT INTO permisos (rol_id,modulo,puede_ver,puede_crear,puede_editar,puede_eliminar,puede_exportar,puede_autorizar)
        VALUES ($1,$2,true,true,false,false,false,false)
        ON CONFLICT DO NOTHING
      `, [capturaRolId, mod]);
    }

    // ── Unidades IDs ─────────────────────────────────────────
    const unidadesQ = await client.query('SELECT id, codigo FROM unidades_negocio');
    const unidadMap = {};
    unidadesQ.rows.forEach(u => unidadMap[u.codigo] = u.id);

    // ── Usuarios del Organigrama ─────────────────────────────
    // Primero crear al admin (Ryan) sin reporta_a
    const pwHash = await bcrypt.hash('Cambiar123!', BCRYPT_ROUNDS);

    const usersData = [
      // [nombre, apellidos, email, rol, unidad_codigo, puesto, nivel_jer]
      ['Ryan',      '',          'ryan@empresa.com',      'Administrador', null, 'Chief Executive Officer',              'Directivo'],
      ['Danae',     '',          'danae@empresa.com',     'Administrador', null, 'C. Comercial y Marketing',             'Directivo'],
      ['Lua',       '',          'lua@empresa.com',       'Administrador', null, 'Chief Operations Officer',             'Directivo'],
      ['Erendira',  '',          'erendira@empresa.com',  'Administrador', null, 'C. Administracion',                    'Directivo'],
      ['Diego',     '',          'diego@empresa.com',     'Captura',       null, 'Material Audiovisual',                 'Operativo'],
      ['Dakira',    '',          'dakira@empresa.com',    'Coordinador',   'PY', 'PYMES Asesor SR',                      'Especialista'],
      ['Maibeth',   '',          'maibeth@empresa.com',   'Captura',       'CI', 'C & I Auxiliar Calculista',            'Especialista'],
      ['Daniel',    'OyM',       'daniel.oym@empresa.com','Coordinador',   'OM', 'OyM Coordinador',                     'Coordinador'],
      ['Danna',     '',          'danna@empresa.com',     'Captura',       'CI', 'Calculista y Planeacion de Proyectos', 'Especialista'],
      ['Cesar',     '',          'cesar@empresa.com',     'Coordinador',   'CI', 'Coord Proyectos CyI',                 'Coordinador'],
      ['Ricardo',   '',          'ricardo@empresa.com',   'Coordinador',   'OM', 'Coord Proyectos OyM',                 'Coordinador'],
      ['Zynai',     '',          'zynai@empresa.com',     'Captura',       'PY', 'PYMES Auxiliar Calculista',            'Operativo'],
      ['Elizabeth', '',          'elizabeth@empresa.com', 'Captura',       'OM', 'OyM Operativo',                       'Operativo'],
      ['Laura',     '',          'laura@empresa.com',     'Captura',       'CI', 'Calculista y Planeacion de Proyectos', 'Operativo'],
      ['Daniel',    'Tecnico',   'daniel.t@empresa.com',  'Captura',       'OM', 'Tecnico Instalador',                  'Operativo'],
      ['Manuel',    '',          'manuel@empresa.com',    'Captura',       'OM', 'Tecnico Instalador',                  'Operativo'],
      ['Padilla',   '',          'padilla@empresa.com',   'Captura',       'OM', 'Tecnico Instalador',                  'Operativo'],
      ['Juan',      '',          'juan@empresa.com',      'Captura',       'OM', 'Tecnico Instalador',                  'Operativo'],
      ['Jose',      '',          'jose@empresa.com',      'Captura',       null, 'Almacen',                             'Operativo'],
      ['Andrea',    '',          'andrea@empresa.com',    'Coordinador',   null, 'Compras',                             'Especialista'],
    ];

    const insertedUsers = {};
    for (const [nombre, apellidos, email, rolNombre, unidadCodigo, puesto, nivelJer] of usersData) {
      const rolId = rolMap[rolNombre];
      const unidadId = unidadCodigo ? unidadMap[unidadCodigo] : null;
      const res = await client.query(`
        INSERT INTO usuarios (nombre, apellidos, email, password_hash, rol_id, unidad_negocio_id, puesto, nivel_jerarquico)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (email) DO UPDATE SET puesto = EXCLUDED.puesto
        RETURNING id, nombre, email
      `, [nombre, apellidos, email, pwHash, rolId, unidadId, puesto, nivelJer]);
      if (res.rows.length > 0) {
        insertedUsers[nombre] = res.rows[0].id;
      }
    }

    // Asignar jerarquia (reporta_a_id)
    const hierarchy = [
      ['Danae',     'Ryan'],
      ['Lua',       'Ryan'],
      ['Erendira',  'Ryan'],
      ['Diego',     'Danae'],
      ['Dakira',    'Danae'],
      ['Maibeth',   'Danae'],
      ['Daniel',    'Lua'],   // Daniel OyM
      ['Danna',     'Lua'],
      ['Cesar',     'Lua'],
      ['Ricardo',   'Lua'],
      ['Zynai',     'Dakira'],
      ['Elizabeth', 'Daniel'],
      ['Laura',     'Danna'],
      ['Manuel',    'Ricardo'],
      ['Padilla',   'Ricardo'],
      ['Juan',      'Ricardo'],
      ['Jose',      'Erendira'],
      ['Andrea',    'Erendira'],
    ];

    for (const [hijo, padre] of hierarchy) {
      if (insertedUsers[hijo] && insertedUsers[padre]) {
        await client.query(
          'UPDATE usuarios SET reporta_a_id = $1 WHERE id = $2',
          [insertedUsers[padre], insertedUsers[hijo]]
        );
      }
    }

    // ── Organigrama tabla ────────────────────────────────────
    const orgData = [
      ['Ryan',      'Chief Executive Officer',              'Direccion',               '—',        'Directivo',   'Administrador', 'Todas', 1],
      ['Danae',     'C. Comercial y Marketing',             'C. Comercial y Marketing','Ryan',      'Directivo',   'Administrador', 'Todas', 2],
      ['Lua',       'Chief Operations Officer',             'Operaciones CI',          'Ryan',      'Directivo',   'Administrador', 'Todas', 3],
      ['Erendira',  'C. Administracion',                    'C. Administracion',       'Ryan',      'Directivo',   'Administrador', 'Admin', 4],
      ['Diego',     'Material Audiovisual',                 'C. Comercial y Marketing','Danae',     'Operativo',   'Captura',       'Todas', 5],
      ['Dakira',    'PYMES Asesor SR',                      'C. Comercial y Marketing','Danae',     'Especialista','Coordinador',   'PY',    6],
      ['Maibeth',   'C & I Auxiliar Calculista',            'Operaciones CI',          'Danae',     'Especialista','Captura',       'CI',    7],
      ['Daniel OyM','OyM Coordinador',                      'Operaciones OyM',         'Lua',       'Coordinador', 'Coordinador',   'OM',    8],
      ['Danna',     'Calculista y Planeacion de Proyectos', 'Operaciones CI',          'Lua',       'Especialista','Captura',       'CI',    9],
      ['Cesar',     'Coord Proyectos CyI',                  'Operaciones CI',          'Lua',       'Coordinador', 'Coordinador',   'CI',    10],
      ['Ricardo',   'Coord Proyectos OyM',                  'Operaciones OyM',         'Lua',       'Coordinador', 'Coordinador',   'OM',    11],
      ['Zynai',     'PYMES Auxiliar Calculista',             'C. Comercial y Marketing','Dakira',    'Operativo',   'Captura',       'PY',    12],
      ['Elizabeth', 'OyM Operativo',                        'Operaciones OyM',         'Daniel OyM','Operativo',   'Captura',       'OM',    13],
      ['Laura',     'Calculista y Planeacion de Proyectos', 'Operaciones CI',          'Danna',     'Operativo',   'Captura',       'CI',    14],
      ['Daniel T.', 'Tecnico Instalador',                   'Operaciones OyM',         'Ricardo',   'Operativo',   'Captura',       'OM',    15],
      ['Manuel',    'Tecnico Instalador',                   'Operaciones OyM',         'Ricardo',   'Operativo',   'Captura',       'OM',    16],
      ['Padilla',   'Tecnico Instalador',                   'Operaciones OyM',         'Ricardo',   'Operativo',   'Captura',       'OM',    17],
      ['Juan',      'Tecnico Instalador',                   'Operaciones OyM',         'Ricardo',   'Operativo',   'Captura',       'OM',    18],
      ['Jose',      'Almacen',                              'C. Administracion',       'Erendira',  'Operativo',   'Captura',       'Admin', 19],
      ['Andrea',    'Compras',                              'C. Administracion',       'Erendira',  'Especialista','Coordinador',   'Admin', 20],
    ];

    for (const [nombre, puesto, area, reportaA, nivel, rolErp, unidad, orden] of orgData) {
      await client.query(`
        INSERT INTO organigrama (nombre, puesto, area, reporta_a_nombre, nivel_jerarquico, rol_erp, unidad, orden)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [nombre, puesto, area, reportaA, nivel, rolErp, unidad, orden]);
    }

    logger.info('Seed completado.', {
      usuarios: usersData.length,
      roles: 3,
      unidades: 3,
      organigrama: orgData.length
    });
    logger.info('Password inicial de todos los usuarios: Cambiar123!');
    logger.info('Los usuarios deberan cambiar su password en el primer login.');
  });
};

runSeed().catch(err => {
  logger.error('Error en seed:', err.message);
  throw err;
});

module.exports = runSeed;
