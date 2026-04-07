import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Páginas
import Login                    from './pages/Login';
import DashboardFinanciero      from './pages/DashboardFinanciero';
import { ClientesPage, ProveedoresPage, ProductosPage,
         TiposCambioPage, CuentasBancariasPage, CarterasCriptoPage } from './pages/Catalogos';
import ProyectosLista           from './pages/ProyectosLista';
import ProyectoNuevo            from './pages/ProyectoNuevo';
import ProyectoDetalle          from './pages/ProyectoDetalle';
import AlmacenesPage            from './pages/AlmacenesPage';
import { OrdenesCompraLista, NuevaOrdenCompra, OrdenCompraDetalle } from './pages/OrdenesCompra';
import RequisicionesPanel       from './pages/RequisicionesPanel';
import { OrdenesTrabajoLista, NuevaOrdenTrabajo, OrdenTrabajoDetalle } from './pages/OrdenesTrabajo';
import { IngresosLista, NuevoIngreso }   from './pages/Ingresos';
import { GastosLista, NuevoGasto, ControlIVA } from './pages/GastosIVA';
import ReportesHub              from './pages/Reportes';
import Usuarios                 from './pages/Usuarios';
import { EmpleadosLista, AsistenciasPage, NominaLista, NominaDetalle } from './pages/RRHH';

// ── Ruta protegida ────────────────────────────────────────────
function Privada({ children, nivelMin = 3 }) {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div className="flex items-center justify-center h-screen text-gray-400">Cargando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  if (nivelMin < usuario.rol_nivel) return <Navigate to="/" replace />;
  return children;
}

// ── Menú lateral ──────────────────────────────────────────────
const MENU = [
  { grupo: 'Principal',
    items: [
      { path:'/',              label:'Dashboard',    icon:'📊' },
      { path:'/reportes',      label:'Reportes',     icon:'📈' },
    ]
  },
  { grupo: 'Operaciones',
    items: [
      { path:'/proyectos',     label:'Proyectos',    icon:'📁' },
      { path:'/almacenes',     label:'Almacenes',    icon:'🏭' },
      { path:'/ordenes-compra',label:'Órd. Compra',  icon:'🛒' },
      { path:'/requisiciones', label:'Requisiciones',icon:'📋' },
      { path:'/ordenes-trabajo',label:'Órd. Trabajo',icon:'🔧' },
    ]
  },
  { grupo: 'Finanzas',
    items: [
      { path:'/ingresos',      label:'Ingresos',     icon:'💰' },
      { path:'/gastos',        label:'Gastos',       icon:'💳' },
      { path:'/iva',           label:'Control IVA',  icon:'🧾' },
    ]
  },
  { grupo: 'Catálogos',
    items: [
      { path:'/clientes',      label:'Clientes',     icon:'👥' },
      { path:'/proveedores',   label:'Proveedores',  icon:'🏢' },
      { path:'/productos',     label:'Productos',    icon:'📦' },
      { path:'/tipos-cambio',  label:'Tipos Cambio', icon:'💱' },
    ]
  },
  { grupo: 'RRHH',
    items: [
      { path:'/rrhh/empleados',  label:'Empleados',  icon:'👤' },
      { path:'/rrhh/asistencias',label:'Asistencias',icon:'⏰' },
      { path:'/rrhh/nomina',     label:'Nómina',     icon:'💵' },
    ]
  },
  { grupo: 'Admin',
    items: [
      { path:'/usuarios',      label:'Usuarios',     icon:'⚙️', nivelMin: 1 },
    ]
  },
];

function Sidebar() {
  const { usuario, logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="w-56 bg-blue-900 text-white flex flex-col min-h-screen flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-blue-800">
        <div className="text-lg font-bold tracking-tight">Sistema ERP</div>
        <div className="text-xs text-blue-300 mt-0.5 truncate">{usuario?.nombre}</div>
      </div>

      {/* Menú */}
      <nav className="flex-1 overflow-y-auto py-3">
        {MENU.map(grupo => (
          <div key={grupo.grupo} className="mb-3">
            <div className="px-5 py-1 text-xs font-bold text-blue-400 uppercase tracking-widest">
              {grupo.grupo}
            </div>
            {grupo.items
              .filter(item => !item.nivelMin || usuario?.rol_nivel <= item.nivelMin)
              .map(item => {
                const activo = loc.pathname === item.path || (item.path !== '/' && loc.pathname.startsWith(item.path));
                return (
                  <Link key={item.path} to={item.path}
                    className={`flex items-center gap-2.5 px-5 py-2 text-sm transition ${
                      activo
                        ? 'bg-blue-800 text-white font-semibold'
                        : 'text-blue-200 hover:bg-blue-800/50 hover:text-white'
                    }`}>
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      {/* Perfil y logout */}
      <div className="px-5 py-4 border-t border-blue-800">
        <div className="text-xs text-blue-300 mb-0.5">{usuario?.email}</div>
        <div className="text-xs text-blue-400 mb-3 capitalize">{usuario?.rol_nombre || 'Usuario'}</div>
        <button onClick={logout}
          className="w-full text-xs text-blue-300 hover:text-white border border-blue-700 rounded-lg py-1.5 transition hover:bg-blue-800">
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ── Layout con sidebar ────────────────────────────────────────
function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────
function AppRoutes() {
  const { usuario } = useAuth();

  if (!usuario) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*"      element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        {/* Dashboard */}
        <Route path="/"                    element={<Privada><DashboardFinanciero /></Privada>} />

        {/* Reportes */}
        <Route path="/reportes"            element={<Privada><ReportesHub /></Privada>} />

        {/* Proyectos */}
        <Route path="/proyectos"           element={<Privada><ProyectosLista /></Privada>} />
        <Route path="/proyectos/nuevo"     element={<Privada><ProyectoNuevo /></Privada>} />
        <Route path="/proyectos/:id"       element={<Privada><ProyectoDetalle /></Privada>} />

        {/* Almacenes */}
        <Route path="/almacenes"           element={<Privada><AlmacenesPage /></Privada>} />

        {/* Órdenes de Compra */}
        <Route path="/ordenes-compra"          element={<Privada><OrdenesCompraLista /></Privada>} />
        <Route path="/ordenes-compra/nueva"    element={<Privada><NuevaOrdenCompra /></Privada>} />
        <Route path="/ordenes-compra/:id"      element={<Privada><OrdenCompraDetalle /></Privada>} />
        <Route path="/requisiciones"           element={<Privada><RequisicionesPanel /></Privada>} />

        {/* Órdenes de Trabajo */}
        <Route path="/ordenes-trabajo"         element={<Privada><OrdenesTrabajoLista /></Privada>} />
        <Route path="/ordenes-trabajo/nueva"   element={<Privada><NuevaOrdenTrabajo /></Privada>} />
        <Route path="/ordenes-trabajo/:id"     element={<Privada><OrdenTrabajoDetalle /></Privada>} />

        {/* Finanzas */}
        <Route path="/ingresos"            element={<Privada><IngresosLista /></Privada>} />
        <Route path="/ingresos/nuevo"      element={<Privada><NuevoIngreso /></Privada>} />
        <Route path="/gastos"              element={<Privada><GastosLista /></Privada>} />
        <Route path="/gastos/nuevo"        element={<Privada><NuevoGasto /></Privada>} />
        <Route path="/iva"                 element={<Privada><ControlIVA /></Privada>} />

        {/* Catálogos */}
        <Route path="/clientes"            element={<Privada><ClientesPage /></Privada>} />
        <Route path="/proveedores"         element={<Privada><ProveedoresPage /></Privada>} />
        <Route path="/productos"           element={<Privada><ProductosPage /></Privada>} />
        <Route path="/tipos-cambio"        element={<Privada><TiposCambioPage /></Privada>} />
        <Route path="/cuentas-bancarias"   element={<Privada><CuentasBancariasPage /></Privada>} />
        <Route path="/carteras-cripto"     element={<Privada><CarterasCriptoPage /></Privada>} />

        {/* RRHH */}
        <Route path="/rrhh/empleados"      element={<Privada><EmpleadosLista /></Privada>} />
        <Route path="/rrhh/asistencias"    element={<Privada><AsistenciasPage /></Privada>} />
        <Route path="/rrhh/nomina"         element={<Privada><NominaLista /></Privada>} />
        <Route path="/rrhh/nomina/:id"     element={<Privada><NominaDetalle /></Privada>} />

        {/* Admin */}
        <Route path="/usuarios"            element={<Privada nivelMin={1}><Usuarios /></Privada>} />

        {/* Catch-all */}
        <Route path="*"                    element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
