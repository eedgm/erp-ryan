require('dotenv').config();
const { withTransaction } = require('./database');
const logger = require('../utils/logger');

// Empleados del organigrama (los mismos que los usuarios del Sprint 1)
const EMPLEADOS = [
  { nombre:'Ryan',      apellidos:'(CEO)',          puesto:'Director General',              unidad_codigo:'CI', tipo:'Tiempo Completo', salario:45000, periodicidad:'Quincenal', bono:2000 },
  { nombre:'Danae',     apellidos:'(C.Comercial)',   puesto:'Coordinadora Comercial',       unidad_codigo:'CI', tipo:'Tiempo Completo', salario:28000, periodicidad:'Quincenal', bono:1500 },
  { nombre:'Lua',       apellidos:'(COO)',           puesto:'Directora de Operaciones',     unidad_codigo:'OM', tipo:'Tiempo Completo', salario:38000, periodicidad:'Quincenal', bono:1800 },
  { nombre:'Erendira',  apellidos:'(C.Admin)',        puesto:'Coordinadora Administrativa',  unidad_codigo:'CI', tipo:'Tiempo Completo', salario:26000, periodicidad:'Quincenal', bono:1500 },
  { nombre:'Diego',     apellidos:'',                puesto:'Asesor Comercial',             unidad_codigo:'CI', tipo:'Tiempo Completo', salario:18000, periodicidad:'Quincenal', bono:1000 },
  { nombre:'Dakira',    apellidos:'(PY Asesor SR)',   puesto:'Asesora Senior PY',            unidad_codigo:'PY', tipo:'Tiempo Completo', salario:22000, periodicidad:'Quincenal', bono:1200 },
  { nombre:'Maibeth',   apellidos:'',                puesto:'Asesora Comercial',            unidad_codigo:'CI', tipo:'Tiempo Completo', salario:16000, periodicidad:'Quincenal', bono:900  },
  { nombre:'Daniel',    apellidos:'(OyM)',            puesto:'Coordinador OM',               unidad_codigo:'OM', tipo:'Tiempo Completo', salario:24000, periodicidad:'Quincenal', bono:1300 },
  { nombre:'Danna',     apellidos:'',                puesto:'Supervisora',                  unidad_codigo:'OM', tipo:'Tiempo Completo', salario:20000, periodicidad:'Quincenal', bono:1100 },
  { nombre:'Cesar',     apellidos:'(Coord CI)',       puesto:'Coordinador CI',               unidad_codigo:'CI', tipo:'Tiempo Completo', salario:23000, periodicidad:'Quincenal', bono:1300 },
  { nombre:'Ricardo',   apellidos:'(Coord OyM)',      puesto:'Coordinador OM',               unidad_codigo:'OM', tipo:'Tiempo Completo', salario:23000, periodicidad:'Quincenal', bono:1300 },
  { nombre:'Zynai',     apellidos:'',                puesto:'Asesora PY',                   unidad_codigo:'PY', tipo:'Tiempo Completo', salario:15000, periodicidad:'Quincenal', bono:800  },
  { nombre:'Elizabeth', apellidos:'',                puesto:'Auxiliar OM',                  unidad_codigo:'OM', tipo:'Tiempo Completo', salario:14000, periodicidad:'Quincenal', bono:750  },
  { nombre:'Laura',     apellidos:'',                puesto:'Auxiliar Supervisión',         unidad_codigo:'OM', tipo:'Tiempo Completo', salario:14000, periodicidad:'Quincenal', bono:750  },
  { nombre:'Daniel',    apellidos:'(Técnico)',        puesto:'Técnico Instalador',           unidad_codigo:'OM', tipo:'Tiempo Completo', salario:13000, periodicidad:'Quincenal', bono:650  },
  { nombre:'Manuel',    apellidos:'',                puesto:'Técnico Instalador',           unidad_codigo:'OM', tipo:'Tiempo Completo', salario:13000, periodicidad:'Quincenal', bono:650  },
  { nombre:'Padilla',   apellidos:'',                puesto:'Técnico Instalador',           unidad_codigo:'OM', tipo:'Tiempo Completo', salario:12500, periodicidad:'Quincenal', bono:600  },
  { nombre:'Juan',      apellidos:'',                puesto:'Técnico Auxiliar',             unidad_codigo:'OM', tipo:'Tiempo Completo', salario:11000, periodicidad:'Quincenal', bono:500  },
  { nombre:'Jose',      apellidos:'(Almacén)',        puesto:'Responsable de Almacén',      unidad_codigo:'CI', tipo:'Tiempo Completo', salario:15000, periodicidad:'Quincenal', bono:800  },
  { nombre:'Andrea',    apellidos:'(Compras)',        puesto:'Coordinadora de Compras',     unidad_codigo:'CI', tipo:'Tiempo Completo', salario:18000, periodicidad:'Quincenal', bono:1000 },
];

const runSeed9 = async () => {
  logger.info('Iniciando seed Sprint 9 — Empleados...');
  await withTransaction(async (client) => {
    let creados = 0;

    for (let i = 0; i < EMPLEADOS.length; i++) {
      const e = EMPLEADOS[i];
      const numEmp = String(i + 1).padStart(4, '0');

      // Buscar unidad de negocio
      const unidadRes = await client.query(
        'SELECT id FROM unidades_negocio WHERE codigo = $1', [e.unidad_codigo]
      );
      const unidadId = unidadRes.rows[0]?.id;

      // Buscar usuario relacionado por nombre
      const usuarioRes = await client.query(
        `SELECT id FROM usuarios WHERE nombre ILIKE $1 AND activo = true LIMIT 1`,
        [e.nombre.split(' ')[0]]
      );
      const usuarioId = usuarioRes.rows[0]?.id || null;

      // Crear empleado
      const empRes = await client.query(`
        INSERT INTO empleados
          (numero_empleado, nombre, apellidos, puesto, tipo_jornada,
           unidad_negocio_id, usuario_id, fecha_ingreso, activo, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,true,1)
        ON CONFLICT (numero_empleado) DO NOTHING
        RETURNING id
      `, [
        `EMP-${numEmp}`,
        e.nombre, e.apellidos,
        e.puesto, e.tipo,
        unidadId, usuarioId
      ]);

      if (!empRes.rows.length) continue;
      const empId = empRes.rows[0].id;

      // Crear contrato activo
      await client.query(`
        INSERT INTO contratos_empleado
          (empleado_id, tipo_contrato, fecha_inicio, salario_base, moneda_salario,
           periodicidad, tiene_imss, tiene_vacaciones, dias_vacaciones,
           bono_puntualidad, moneda_bono, activo, creado_por)
        VALUES ($1,'Indefinido',CURRENT_DATE,$2,'MXN',$3,true,true,6,$4,'MXN',true,1)
        ON CONFLICT DO NOTHING
      `, [empId, e.salario, e.periodicidad, e.bono]);

      creados++;
    }

    logger.info(`Seed Sprint 9 completado: ${creados} empleados creados con contratos.`);
  });
};

runSeed9().catch(err => {
  logger.error('Error en seed Sprint 9:', err.message);
  throw err;
});

module.exports = runSeed9;
