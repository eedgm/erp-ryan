import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const fmtDate = v => v ? new Date(v).toLocaleDateString('es-MX') : '—';
const fmtNum  = (v,d=2) => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:d});

const SEMAFORO = {
  verde:    { label:'Hay stock',     dot:'bg-green-500',  badge:'bg-green-100 text-green-700',  accion:'Del almacén' },
  amarillo: { label:'Stock parcial', dot:'bg-amber-500',  badge:'bg-amber-100 text-amber-700',  accion:'Mixto' },
  rojo:     { label:'Sin stock',     dot:'bg-red-500',    badge:'bg-red-100 text-red-700',      accion:'Comprar' },
};

const ESTADO_STYLE = {
  pendiente:      'bg-gray-100 text-gray-600',
  en_proceso:     'bg-blue-100 text-blue-700',
  surtida_parcial:'bg-amber-100 text-amber-700',
  surtida_total:  'bg-green-100 text-green-700',
  cancelada:      'bg-red-100 text-red-700',
};

export default function RequisicionesPanel() {
  const [reqs, setReqs]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [cargando, setCargando] = useState(true);
  const [proveedores, setProveedores] = useState([]);
  const [filtros, setFiltros]   = useState({ search:'', estado:'pendiente' });
  const [modal, setModal]       = useState(null);  // { tipo:'proveedor'|'detalle', req }
  const [form, setForm]         = useState({ proveedor_id:'', monto_estimado:'', fecha_pago_programada:'' });
  const [guardando, setGuardando]= useState(false);
  const [msg, setMsg]           = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = { ...filtros, limit:50 };
      if (!params.estado) delete params.estado;
      if (!params.search) delete params.search;
      const [rRes, pvRes] = await Promise.all([
        api.get('/requisiciones', { params }),
        api.get('/proveedores?activo=true&limit=200'),
      ]);
      setReqs(rRes.data.datos);
      setTotal(rRes.data.total);
      setProveedores(pvRes.data.datos);
    } finally { setCargando(false); }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const showMsg = (txt) => { setMsg(txt); setTimeout(() => setMsg(''), 4000); };

  const asignarProveedor = async () => {
    setGuardando(true);
    try {
      await api.patch(`/requisiciones/${modal.req.id}/proveedor`, form);
      setModal(null);
      showMsg('Proveedor asignado correctamente');
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    } finally { setGuardando(false); }
  };

  // KPIs rápidos
  const kpis = {
    pendientes: reqs.filter(r => r.estado === 'pendiente').length,
    sinStock:   reqs.filter(r => r.semaforo_stock === 'rojo').length,
    conStock:   reqs.filter(r => r.semaforo_stock === 'verde').length,
    proxVencer: reqs.filter(r => {
      if (!r.fecha_requerida) return false;
      const dias = Math.ceil((new Date(r.fecha_requerida) - new Date()) / 86400000);
      return dias >= 0 && dias <= 5;
    }).length,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Panel de Requisiciones — Compras</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} requisiciones · Vista del área de compras</p>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Pendientes de surtir', val: kpis.pendientes, color:'text-blue-900', bg:'bg-blue-50' },
          { label:'Sin stock en almacén', val: kpis.sinStock,   color:'text-red-700',  bg:'bg-red-50'  },
          { label:'Se puede del almacén', val: kpis.conStock,   color:'text-green-700',bg:'bg-green-50'},
          { label:'Vencen en ≤ 5 días',  val: kpis.proxVencer, color:'text-amber-700', bg:'bg-amber-50'},
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
            <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Buscar producto, proyecto..."
          value={filtros.search} onChange={e => setFiltros(f=>({...f,search:e.target.value}))}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filtros.estado} onChange={e => setFiltros(f=>({...f,estado:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendientes</option>
          <option value="en_proceso">En proceso</option>
          <option value="surtida_parcial">Surtidas parcial</option>
          <option value="surtida_total">Surtidas total</option>
        </select>
      </div>

      {/* Tabla de requisiciones */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? (
          <div className="p-10 text-center text-gray-400 text-sm">Cargando requisiciones...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Folio Req.','Proyecto','Producto','Cantidad','Stock Disp.','Semáforo','Acción',
                    'Proveedor','Pago Prog.','Fecha Req.','Estado',''].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reqs.map((r, i) => {
                  const sem = SEMAFORO[r.semaforo_stock] || SEMAFORO.rojo;
                  const diasVence = r.fecha_requerida
                    ? Math.ceil((new Date(r.fecha_requerida) - new Date()) / 86400000)
                    : null;
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs font-bold text-blue-900">{r.folio}</span>
                      </td>
                      <td className="px-3 py-3">
                        {r.proyecto_folio
                          ? <><div className="font-mono text-xs text-blue-700">{r.proyecto_folio}</div>
                              <div className="text-xs text-gray-400 truncate max-w-28">{r.proyecto_nombre}</div></>
                          : <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 max-w-40 truncate">{r.descripcion || r.producto_nombre}</div>
                        {r.producto_codigo && <div className="text-xs text-gray-400 font-mono">{r.producto_codigo}</div>}
                      </td>
                      <td className="px-3 py-3 font-semibold">{fmtNum(r.cantidad,2)} <span className="text-xs text-gray-400">{r.unidad_medida}</span></td>
                      <td className="px-3 py-3">
                        <span className={`font-semibold ${parseFloat(r.stock_disponible)<=0?'text-red-600':parseFloat(r.stock_disponible)<parseFloat(r.cantidad)?'text-amber-600':'text-green-700'}`}>
                          {fmtNum(r.stock_disponible,2)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${sem.badge}`}>
                          <span className={`w-2 h-2 rounded-full ${sem.dot}`} />
                          {sem.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-semibold ${r.semaforo_stock==='verde'?'text-green-700':r.semaforo_stock==='amarillo'?'text-amber-600':'text-red-600'}`}>
                          {sem.accion}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {r.proveedor_nombre
                          ? <div className="text-xs text-gray-700">{r.proveedor_nombre}</div>
                          : <button onClick={() => { setModal({tipo:'proveedor',req:r}); setForm({proveedor_id:'',monto_estimado:'',fecha_pago_programada:''}); }}
                              className="text-xs text-blue-600 font-medium hover:text-blue-800 whitespace-nowrap">
                              + Asignar
                            </button>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r.fecha_pago_programada
                          ? <span className={Math.ceil((new Date(r.fecha_pago_programada)-new Date())/86400000)<=3?'text-red-600 font-semibold':'text-gray-600'}>
                              {fmtDate(r.fecha_pago_programada)}
                            </span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3">
                        {diasVence !== null && (
                          <span className={`text-xs font-medium ${diasVence<0?'text-red-600':diasVence<=5?'text-amber-600':'text-gray-500'}`}>
                            {diasVence<0?`Vencido hace ${Math.abs(diasVence)}d`:diasVence===0?'Hoy':`${diasVence}d`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_STYLE[r.estado]||'bg-gray-100 text-gray-500'}`}>
                          {r.estado?.replace('_',' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {r.oc_folio && (
                          <span className="text-xs font-mono text-blue-700 hover:underline cursor-pointer">{r.oc_folio}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!reqs.length && (
                  <tr><td colSpan="12" className="px-4 py-10 text-center text-gray-400 text-sm">
                    No hay requisiciones con los filtros seleccionados
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Asignar proveedor */}
      {modal?.tipo === 'proveedor' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-1">Asignar Proveedor</h3>
            <p className="text-sm text-gray-500 mb-4">{modal.req.descripcion || modal.req.producto_nombre}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proveedor *</label>
                <select value={form.proveedor_id} onChange={e=>setForm(f=>({...f,proveedor_id:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Seleccionar...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Monto Estimado</label>
                <input type="number" step="0.01" value={form.monto_estimado}
                  onChange={e=>setForm(f=>({...f,monto_estimado:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha de Pago Programada</label>
                <input type="date" value={form.fecha_pago_programada}
                  onChange={e=>setForm(f=>({...f,fecha_pago_programada:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={asignarProveedor} disabled={guardando||!form.proveedor_id}
                className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Asignar Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
