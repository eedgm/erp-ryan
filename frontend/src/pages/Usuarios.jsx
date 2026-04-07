import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';

const ROLES_COLORS = {
  'Administrador': 'bg-blue-100 text-blue-800',
  'Coordinador':   'bg-green-100 text-green-800',
  'Captura':       'bg-amber-100 text-amber-800',
};
const UNIDADES_COLORS = {
  CI: 'bg-blue-50 text-blue-700',
  PY: 'bg-green-50 text-green-700',
  OM: 'bg-orange-50 text-orange-700',
};

export default function Usuarios() {
  const { esAdmin, puedo } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [modal, setModal] = useState(null); // null | 'crear' | 'editar'
  const [seleccionado, setSeleccionado] = useState(null);
  const [roles, setRoles] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [form, setForm] = useState({ nombre:'', apellidos:'', email:'', rol_id:'', unidad_negocio_id:'', puesto:'', nivel_jerarquico:'Operativo' });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState({ tipo:'', texto:'' });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [usRes, rolRes, unRes] = await Promise.all([
        api.get('/usuarios?activo=true'),
        api.get('/roles'),
        api.get('/unidades'),
      ]);
      setUsuarios(usRes.data.datos);
      setRoles(rolRes.data.datos);
      setUnidades(unRes.data.datos);
    } catch (err) {
      showMsg('error', 'Error cargando datos: ' + (err.response?.data?.error || err.message));
    } finally {
      setCargando(false);
    }
  };

  const showMsg = (tipo, texto) => {
    setMsg({ tipo, texto });
    setTimeout(() => setMsg({ tipo:'', texto:'' }), 4000);
  };

  const usuariosFiltrados = usuarios.filter(u => {
    const matchQ = !busqueda ||
      u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      u.email?.toLowerCase().includes(busqueda.toLowerCase()) ||
      u.puesto?.toLowerCase().includes(busqueda.toLowerCase());
    const matchR = !filtroRol || u.rol_nombre === filtroRol;
    return matchQ && matchR;
  });

  const abrirCrear = () => {
    setForm({ nombre:'', apellidos:'', email:'', rol_id:'', unidad_negocio_id:'', puesto:'', nivel_jerarquico:'Operativo' });
    setSeleccionado(null);
    setModal('crear');
  };

  const abrirEditar = (u) => {
    setForm({
      nombre: u.nombre, apellidos: u.apellidos || '',
      email: u.email, rol_id: u.rol_id,
      unidad_negocio_id: u.unidad_id || '',
      puesto: u.puesto || '',
      nivel_jerarquico: u.nivel_jerarquico || 'Operativo',
    });
    setSeleccionado(u);
    setModal('editar');
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      if (modal === 'crear') {
        await api.post('/usuarios', form);
        showMsg('ok', 'Usuario creado. Password inicial: Cambiar123!');
      } else {
        await api.put(`/usuarios/${seleccionado.id}`, form);
        showMsg('ok', 'Usuario actualizado correctamente');
      }
      setModal(null);
      cargarDatos();
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'Error guardando usuario');
    } finally {
      setGuardando(false);
    }
  };

  const desactivar = async (u) => {
    if (!confirm(`¿Desactivar a ${u.nombre}? Perdera acceso al sistema.`)) return;
    try {
      await api.delete(`/usuarios/${u.id}`);
      showMsg('ok', 'Usuario desactivado');
      cargarDatos();
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'Error al desactivar');
    }
  };

  const resetPass = async (u) => {
    if (!confirm(`¿Resetear password de ${u.nombre}? Se asignara: Cambiar123!`)) return;
    try {
      await api.post(`/usuarios/${u.id}/reset-password`);
      showMsg('ok', `Password de ${u.nombre} reseteado a: Cambiar123!`);
    } catch (err) {
      showMsg('error', err.response?.data?.error || 'Error al resetear');
    }
  };

  if (!puedo('usuarios', 'ver')) {
    return (
      <div className="p-8 text-center text-gray-500">
        No tienes acceso al modulo de usuarios.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Usuarios y Permisos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {usuarios.length} usuarios activos en el sistema
          </p>
        </div>
        {esAdmin && (
          <button
            onClick={abrirCrear}
            className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      {/* Mensaje feedback */}
      {msg.texto && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          msg.tipo === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {msg.texto}
        </div>
      )}

      {/* Stats rápidas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', val: usuarios.length, color: 'bg-blue-50 text-blue-700' },
          { label: 'Administradores', val: usuarios.filter(u=>u.rol_nombre==='Administrador').length, color: 'bg-blue-100 text-blue-800' },
          { label: 'Coordinadores', val: usuarios.filter(u=>u.rol_nombre==='Coordinador').length, color: 'bg-green-100 text-green-800' },
          { label: 'Captura', val: usuarios.filter(u=>u.rol_nombre==='Captura').length, color: 'bg-amber-100 text-amber-800' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${s.color}`}>{s.label}</div>
            <div className="text-2xl font-bold text-gray-900">{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          placeholder="Buscar nombre, email o puesto..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filtroRol}
          onChange={e => setFiltroRol(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los roles</option>
          <option>Administrador</option>
          <option>Coordinador</option>
          <option>Captura</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando usuarios...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Puesto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unidad</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nivel</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ultimo acceso</th>
                {esAdmin && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((u, i) => (
                <tr key={u.id} className={`border-b border-gray-50 hover:bg-gray-50 transition ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-800 text-xs font-bold flex-shrink-0">
                        {u.nombre?.charAt(0)}{u.apellidos?.charAt(0) || ''}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{u.nombre} {u.apellidos}</div>
                        <div className="text-xs text-gray-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{u.puesto || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${ROLES_COLORS[u.rol_nombre] || 'bg-gray-100 text-gray-600'}`}>
                      {u.rol_nombre}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.unidad_codigo ? (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${UNIDADES_COLORS[u.unidad_codigo] || 'bg-gray-100 text-gray-600'}`}>
                        {u.unidad_codigo}
                      </span>
                    ) : <span className="text-gray-400 text-xs">Todas</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{u.nivel_jerarquico || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' }) : 'Nunca'}
                  </td>
                  {esAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirEditar(u)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => resetPass(u)}
                          className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                        >
                          Reset pwd
                        </button>
                        <button
                          onClick={() => desactivar(u)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Desactivar
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!usuariosFiltrados.length && (
                <tr><td colSpan="7" className="px-4 py-8 text-center text-gray-400 text-sm">No se encontraron usuarios</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Crear/Editar */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-5">
              {modal === 'crear' ? 'Nuevo usuario' : `Editar: ${seleccionado?.nombre}`}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                ['nombre', 'Nombre', 'text', true],
                ['apellidos', 'Apellidos', 'text', false],
                ['email', 'Email', 'email', true],
                ['puesto', 'Puesto', 'text', false],
              ].map(([field, label, type, req]) => (
                <div key={field} className={field === 'email' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}{req && ' *'}</label>
                  <input
                    type={type}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Rol *</label>
                <select
                  value={form.rol_id}
                  onChange={e => setForm(f => ({ ...f, rol_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.nombre} (Nivel {r.nivel})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unidad de Negocio</label>
                <select
                  value={form.unidad_negocio_id}
                  onChange={e => setForm(f => ({ ...f, unidad_negocio_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todas las unidades</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nivel Jerarquico</label>
                <select
                  value={form.nivel_jerarquico}
                  onChange={e => setForm(f => ({ ...f, nivel_jerarquico: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['Directivo','Coordinador','Especialista','Operativo'].map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {modal === 'crear' && (
              <p className="text-xs text-amber-600 mt-3 bg-amber-50 px-3 py-2 rounded-lg">
                El usuario recibira el password inicial: <strong>Cambiar123!</strong> — debera cambiarlo en su primer acceso.
              </p>
            )}
            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={guardando}
                className="px-4 py-2 text-sm font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-lg disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : modal === 'crear' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
