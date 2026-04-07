# Sistema ERP — Sprint 2: Catálogos

## Archivos nuevos en este sprint

```
erp-sprint2/
├── backend/src/
│   ├── config/
│   │   ├── migrate2.js          # Crea 7 tablas nuevas de catálogos
│   │   └── seed2.js             # Datos iniciales (categorías, TC, cuentas, carteras)
│   ├── controllers/
│   │   ├── clientesController.js    # CRUD completo con paginación y bitácora
│   │   ├── proveedoresController.js # CRUD + soporte wallet cripto y RST
│   │   ├── productosController.js   # CRUD + categorías + productos RST
│   │   └── financieroController.js  # TC, cuentas bancarias, carteras cripto
│   └── routes/
│       └── catalogos.js         # Todas las rutas con guards de permisos
└── frontend/src/
    ├── components/
    │   └── CatalogPage.jsx      # Componente reutilizable para todos los catálogos
    └── pages/
        └── Catalogos.jsx        # 6 páginas: Clientes, Proveedores, Productos,
                                 #           TC, Cuentas Bancarias, Carteras Cripto
```

---

## Configuración en el servidor (agregar al server.js del Sprint 1)

```javascript
// En backend/src/server.js — agregar después de las rutas existentes:
const catalogosRoutes = require('./routes/catalogos');
app.use('/api', catalogosRoutes);
```

---

## Comandos Sprint 2

```bash
cd backend

# Crear tablas nuevas (correr después de migrate del Sprint 1)
npm run migrate2

# Insertar datos iniciales de catálogos
npm run seed2
```

---

## Endpoints nuevos

### Clientes
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/clientes` | Lista con búsqueda, filtro y paginación |
| GET    | `/api/clientes/:id` | Detalle con saldo pendiente |
| POST   | `/api/clientes` | Crear (genera código automático) |
| PUT    | `/api/clientes/:id` | Actualizar |
| DELETE | `/api/clientes/:id` | Desactivar (lógico) |

### Proveedores
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/proveedores` | Lista con filtro RST y paginación |
| GET    | `/api/proveedores/:id` | Detalle |
| POST   | `/api/proveedores` | Crear con datos de wallet cripto |
| PUT    | `/api/proveedores/:id` | Actualizar |
| DELETE | `/api/proveedores/:id` | Desactivar |

### Productos y Servicios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/categorias` | Lista de categorías con conteo |
| GET    | `/api/productos` | Lista filtrable por tipo, categoría, RST |
| GET    | `/api/productos/:id` | Detalle |
| POST   | `/api/productos` | Crear |
| PUT    | `/api/productos/:id` | Actualizar |
| DELETE | `/api/productos/:id` | Desactivar |

### Tipos de Cambio
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET    | `/api/tipos-cambio` | Histórico |
| GET    | `/api/tipos-cambio/hoy` | TC del día en objeto por moneda |
| GET    | `/api/tipos-cambio/convertir?monto=X&moneda=Y` | Convertir a MXN |
| POST   | `/api/tipos-cambio` | Registrar (upsert por fecha+moneda) |
| POST   | `/api/tipos-cambio/bulk` | Registrar múltiples monedas a la vez |

### Cuentas Bancarias y Carteras
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/PUT | `/api/cuentas-bancarias` | CRUD cuentas |
| GET/POST/PUT | `/api/carteras-cripto` | CRUD carteras Binance |
| GET    | `/api/familias-presupuesto` | Lista de familias |
| POST   | `/api/familias-presupuesto` | Crear familia |

---

## Tablas creadas en este sprint

| Tabla | Descripción |
|-------|-------------|
| `tipos_cambio` | TC histórico por fecha y moneda (upsert) |
| `clientes` | Catálogo de clientes con crédito y contacto |
| `proveedores` | Catálogo con wallet cripto y flag RST |
| `categorias_producto` | Árbol de categorías por tipo |
| `productos_servicios` | Catálogo con precios MXN/USD y control RST |
| `cuentas_bancarias` | Cuentas MXN/USD de la empresa |
| `carteras_cripto` | Wallets Binance por moneda |
| `familias_presupuesto_catalogo` | Familias configurables de presupuesto |

---

## Notas importantes

- El componente `CatalogPage.jsx` es reutilizable para cualquier catálogo futuro: solo pasa `columnas`, `campos` y las funciones de API.
- Los clientes y proveedores usan **eliminación lógica** — nunca se borran de la BD.
- El endpoint `/api/tipos-cambio/convertir` es usado por todos los módulos que necesiten equivalencia en MXN.
- Los tipos de cambio se guardan con **upsert** (INSERT ... ON CONFLICT DO UPDATE) para que se pueda actualizar el valor del día.

---

## Sprint 3 — Siguiente paso
Folios de Proyectos con presupuesto por familias y control presupuestal en tiempo real.
