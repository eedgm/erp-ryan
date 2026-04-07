import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

// ── Helpers ───────────────────────────────────────────────────
const fmtMXN  = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtNum  = (v,d=2) => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:d});
const fmtDate = v => v ? new Date(v).toLocaleDateString('es-MX') : '—';

const ESTADO_STYLE = {
  borrador:           { label:'Borrador',          color:'bg-gray-100 text-gray-600' },
  en_revision:        { label:'En Revisión',        color:'bg-blue-100 text-blue-700' },
  autorizada:         { label:'Autorizada',         color:'bg-green-100 text-green-700' },
  enviada_proveedor:  { label:'Enviada',            color:'bg-teal-100 text-teal-700' },
  recibida_parcial:   { label:'Recibida Parcial',   color:'bg-amber-100 text-amber-700' },
  recibida_total:     { label:'Recibida Total',     color:'bg-purple-100 text-purple-700' },
  cancelada:          { label:'Cancelada',          color:'bg-red-100 text-red-700' },
};

const ACCION_STYLE = {
  de_almacen: { label:'Del Almacén',  color:'bg-green-100 text-green-700', dot:'bg-green-500' },
  mixto:      { label:'Mixto',        color:'bg-amber-100 text-amber-700', dot:'bg-amber-500' },
  comprar:    { label:'Comprar',      color:'bg-red-100 text-red-700',     dot:'bg-red-500'   },
  sin_stock_verificado: { label:'Sin verificar', color:'bg-gray-100 text-gray-500', dot:'bg-gray-400' },
};

const Badge = ({ texto, color }) => (
  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{texto}</span>
);

// ════════════════════════════════════════════════════════════
// LISTA DE OC
// ════════════════════════════════════════════════════════════
export function OrdenesCompraLista() {
  const navigate = useNavigate();
  const [ocs, setOcs] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ search:'', estado:'', page:1 });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = { ...filtros, limit: 25 };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const res = await api.get('/ordenes-compra', { params });
      setOcs(res.data.datos);
      setTotal(res.data.total);
    } finally { setCargando(false); }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const ESTADOS = ['borrador','en_revision','autorizada','enviada_proveedor','recibida_parcial','recibida_total','cancelada'];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Órdenes de Compra</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} órdenes registradas</p>
        </div>
        <button onClick={() => navigate('/ordenes-compra/nueva')}
          className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          + Nueva OC
        </button>
      </div>

      {/* Resumen por estado */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { key:'borrador',    label:'Borrador',  count: ocs.filter(o=>o.estado==='borrador').length },
          { key:'autorizada',  label:'Autorizadas',count: ocs.filter(o=>o.estado==='autorizada').length },
          { key:'recibida_parcial',label:'Parciales',count: ocs.filter(o=>o.estado==='recibida_parcial').length },
          { key:'recibida_total',  label:'Completas', count: ocs.filter(o=>o.estado==='recibida_total').length },
        ].map(s => (
          <div key={s.key} className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition ${
            filtros.estado===s.key ? 'border-blue-900' : 'border-gray-200 hover:border-gray-300'
          }`} onClick={() => setFiltros(f => ({...f, estado: f.estado===s.key?'':s.key, page:1}))}>
            <div className="text-2xl font-bold text-gray-900">{s.count}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Buscar folio, proyecto, proveedor..."
          value={filtros.search} onChange={e => setFiltros(f=>({...f,search:e.target.value,page:1}))}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filtros.estado} onChange={e => setFiltros(f=>({...f,estado:e.target.value,page:1}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_STYLE[e]?.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-10 text-center text-gray-400 text-sm">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Folio OC','Proyecto','Proveedor','Unidad','Partidas','Total','Moneda','Estado','Fecha Nec.'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ocs.map((oc, i) => (
                  <tr key={oc.id} onClick={() => navigate(`/ordenes-compra/${oc.id}`)}
                    className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition ${i%2===0?'':'bg-gray-50/30'}`}>
                    <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-blue-900">{oc.folio}</span></td>
                    <td className="px-4 py-3">
                      {oc.proyecto_folio
                        ? <><div className="font-mono text-xs text-blue-700">{oc.proyecto_folio}</div>
                            <div className="text-xs text-gray-400 truncate max-w-32">{oc.proyecto_nombre}</div></>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{oc.proveedor_nombre || <span className="text-gray-400">Sin asignar</span>}</td>
                    <td className="px-4 py-3"><Badge texto={oc.unidad_codigo||'—'} color="bg-blue-100 text-blue-800" /></td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-semibold ${parseInt(oc.partidas_completas)===parseInt(oc.total_partidas)?'text-green-700':'text-amber-600'}`}>
                        {oc.partidas_completas}/{oc.total_partidas}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold">{fmtMXN(oc.total)}</td>
                    <td className="px-4 py-3"><Badge texto={oc.moneda} color={oc.moneda==='MXN'?'bg-blue-50 text-blue-700':'bg-purple-50 text-purple-700'} /></td>
                    <td className="px-4 py-3"><Badge texto={ESTADO_STYLE[oc.estado]?.label||oc.estado} color={ESTADO_STYLE[oc.estado]?.color||'bg-gray-100 text-gray-600'} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(oc.fecha_necesidad)}</td>
                  </tr>
                ))}
                {!ocs.length && <tr><td colSpan="9" className="px-4 py-10 text-center text-gray-400 text-sm">No se encontraron órdenes de compra</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// NUEVA OC — Formulario con verificación de stock
// ════════════════════════════════════════════════════════════
export function NuevaOrdenCompra() {
  const navigate = useNavigate();
  const [proyectos,   setProyectos]   = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [unidades,    setUnidades]    = useState([]);
  const [productos,   setProductos]   = useState([]);
  const [almacenes,   setAlmacenes]   = useState([]);
  const [guardando,   setGuardando]   = useState(false);
  const [error,       setError]       = useState('');
  const [verificando, setVerificando] = useState(false);
  const [stockResult, setStockResult] = useState([]);

  const [form, setForm] = useState({
    proyecto_id:'', unidad_negocio_id:'', proveedor_id:'',
    moneda:'MXN', tipo_cambio:'1',
    fecha_necesidad:'', condiciones_pago:'', lugar_entrega:'', notas:'',
  });
  const [partidas, setPartidas] = useState([{
    producto_id:'', descripcion:'', unidad_medida:'',
    cantidad_solicitada:'', precio_unitario:'',
    aplica_iva:true, tasa_iva:16, descuento_pct:0,
  }]);

  useEffect(() => {
    Promise.all([
      api.get('/proyectos?estado=Activo&limit=100'),
      api.get('/proveedores?activo=true&limit=200'),
      api.get('/unidades'),
      api.get('/productos?activo=true&tipo=Suministro&limit=500'),
      api.get('/almacenes?activo=true'),
    ]).then(([pRes, pvRes, uRes, prodRes, almRes]) => {
      setProyectos(pRes.data.datos);
      setProveedores(pvRes.data.datos);
      setUnidades(uRes.data.datos);
      setProductos(prodRes.data.datos);
      setAlmacenes(almRes.data.datos);
    });
  }, []);

  const setField = (k, v) => setForm(f => ({...f, [k]:v}));

  const addPartida = () => setPartidas(ps => [...ps, {
    producto_id:'', descripcion:'', unidad_medida:'',
    cantidad_solicitada:'', precio_unitario:'',
    aplica_iva:true, tasa_iva:16, descuento_pct:0,
  }]);

  const removePartida = (idx) => setPartidas(ps => ps.filter((_,i)=>i!==idx));

  const setPartidaField = (idx, k, v) => {
    setPartidas(ps => ps.map((p,i) => {
      if (i !== idx) return p;
      const np = {...p, [k]:v};
      // Auto-rellenar desde producto seleccionado
      if (k === 'producto_id' && v) {
        const prod = productos.find(pr => String(pr.id) === String(v));
        if (prod) {
          np.descripcion    = prod.nombre;
          np.unidad_medida  = prod.unidad_medida || '';
          np.precio_unitario= prod.precio_venta_mxn || prod.costo_mxn || '';
          np.aplica_iva     = prod.aplica_iva;
          np.tasa_iva       = prod.tasa_iva;
        }
      }
      return np;
    }));
    setStockResult([]); // limpiar verificación al cambiar
  };

  // Calcular totales por partida
  const calcPartida = (p) => {
    const qty   = parseFloat(p.cantidad_solicitada||0);
    const price = parseFloat(p.precio_unitario||0);
    const desc  = parseFloat(p.descuento_pct||0);
    const sub   = qty * price * (1 - desc/100);
    const iva   = p.aplica_iva ? sub * (parseFloat(p.tasa_iva||16)/100) : 0;
    return { subtotal: sub, iva, total: sub+iva };
  };

  const totales = partidas.reduce((acc, p) => {
    const c = calcPartida(p);
    return { subtotal: acc.subtotal+c.subtotal, iva: acc.iva+c.iva, total: acc.total+c.total };
  }, { subtotal:0, iva:0, total:0 });

  const verificarStock = async () => {
    const items = partidas
      .filter(p => p.producto_id && parseFloat(p.cantidad_solicitada) > 0)
      .map(p => ({ producto_id: parseInt(p.producto_id), cantidad: parseFloat(p.cantidad_solicitada) }));
    if (!items.length) return;
    setVerificando(true);
    try {
      const res = await api.post('/ordenes-compra/verificar-stock', { items });
      setStockResult(res.data.datos);
    } finally { setVerificando(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.unidad_negocio_id) { setError('Selecciona la unidad de negocio'); return; }
    const partidasValidas = partidas.filter(p => p.descripcion && parseFloat(p.cantidad_solicitada)>0);
    if (!partidasValidas.length) { setError('Agrega al menos una partida válida'); return; }

    setGuardando(true);
    try {
      const res = await api.post('/ordenes-compra', { ...form, partidas: partidasValidas });
      navigate(`/ordenes-compra/${res.data.datos.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error creando la OC');
    } finally { setGuardando(false); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/ordenes-compra')} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
        <h1 className="text-xl font-bold text-blue-900">Nueva Orden de Compra</h1>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Datos generales */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Datos Generales</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unidad de Negocio *</label>
              <select value={form.unidad_negocio_id} onChange={e=>setField('unidad_negocio_id',e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar...</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proyecto / Folio</label>
              <select value={form.proyecto_id} onChange={e=>setField('proyecto_id',e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin proyecto</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.folio} — {p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proveedor</label>
              <select value={form.proveedor_id} onChange={e=>setField('proveedor_id',e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar después</option>
                {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha Requerida</label>
              <input type="date" value={form.fecha_necesidad} onChange={e=>setField('fecha_necesidad',e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Moneda</label>
              <select value={form.moneda} onChange={e=>setField('moneda',e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['MXN','USD','USDT','USDC'].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Condiciones de Pago</label>
              <input value={form.condiciones_pago} onChange={e=>setField('condiciones_pago',e.target.value)}
                placeholder="Ej. 30 días neto"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Lugar de Entrega</label>
              <input value={form.lugar_entrega} onChange={e=>setField('lugar_entrega',e.target.value)}
                placeholder="Dirección o ubicación de entrega"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Partidas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Partidas</h2>
            <div className="flex gap-2">
              <button type="button" onClick={verificarStock} disabled={verificando}
                className="text-xs font-semibold px-3 py-1.5 border border-green-300 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50">
                {verificando ? 'Verificando...' : '🔍 Verificar Stock'}
              </button>
              <button type="button" onClick={addPartida}
                className="text-xs font-semibold px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                + Partida
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {partidas.map((p, idx) => {
              const calc = calcPartida(p);
              const sv   = stockResult[stockResult.findIndex(s => s.producto_id === parseInt(p.producto_id))];
              const accionStyle = sv ? (ACCION_STYLE[sv.accion] || ACCION_STYLE.sin_stock_verificado) : null;

              return (
                <div key={idx} className={`border rounded-xl p-4 ${sv ? (sv.accion==='de_almacen'?'border-green-200 bg-green-50/30':sv.accion==='comprar'?'border-red-200 bg-red-50/20':'border-amber-200 bg-amber-50/20') : 'border-gray-200'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-gray-400 mt-2.5 w-5 text-center">{idx+1}</span>
                    <div className="flex-1 grid grid-cols-6 gap-2">
                      {/* Producto */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-400 mb-0.5">Producto del catálogo</label>
                        <select value={p.producto_id} onChange={e => setPartidaField(idx,'producto_id',e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                          <option value="">— Manual —</option>
                          {productos.map(pr => <option key={pr.id} value={pr.id}>{pr.codigo ? `[${pr.codigo}] `:''}{pr.nombre}</option>)}
                        </select>
                      </div>
                      {/* Descripción */}
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-400 mb-0.5">Descripción *</label>
                        <input value={p.descripcion} onChange={e=>setPartidaField(idx,'descripcion',e.target.value)} required
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      {/* Unidad */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Unidad</label>
                        <input value={p.unidad_medida} onChange={e=>setPartidaField(idx,'unidad_medida',e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      {/* Cantidad */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Cantidad *</label>
                        <input type="number" step="0.01" value={p.cantidad_solicitada} onChange={e=>setPartidaField(idx,'cantidad_solicitada',e.target.value)} required
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      {/* Precio */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Precio Unit.</label>
                        <input type="number" step="0.0001" value={p.precio_unitario} onChange={e=>setPartidaField(idx,'precio_unitario',e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      </div>
                      {/* IVA */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">IVA</label>
                        <div className="flex items-center gap-1 mt-1">
                          <input type="checkbox" checked={p.aplica_iva} onChange={e=>setPartidaField(idx,'aplica_iva',e.target.checked)} className="rounded" />
                          <span className="text-xs text-gray-500">16%</span>
                        </div>
                      </div>
                      {/* Total */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Total</label>
                        <div className="px-2 py-1.5 bg-gray-50 rounded text-xs font-semibold text-gray-800 border border-gray-200">
                          {fmtMXN(calc.total)}
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => removePartida(idx)} className="text-red-400 hover:text-red-600 text-lg mt-1 leading-none">×</button>
                  </div>

                  {/* Resultado de verificación de stock */}
                  {sv && (
                    <div className={`mt-3 flex items-center gap-3 text-xs px-3 py-2 rounded-lg ${accionStyle.color}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accionStyle.dot}`} />
                      <div className="flex-1">
                        <span className="font-semibold">{accionStyle.label}: </span>
                        {sv.accion === 'de_almacen' && `Disponible en almacén (${fmtNum(sv.stock_total,2)} unidades). Se generará Orden de Trabajo.`}
                        {sv.accion === 'comprar'    && `Sin stock en almacenes generales. Requiere compra a proveedor.`}
                        {sv.accion === 'mixto'      && `Stock parcial: ${fmtNum(sv.cantidad_de_almacen,2)} del almacén + ${fmtNum(sv.cantidad_a_comprar,2)} a comprar.`}
                      </div>
                      {sv.almacen_sugerido && <span className="font-mono opacity-75">{sv.almacen_sugerido.clave}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Totales */}
          <div className="border-t border-gray-100 mt-4 pt-4 flex justify-end">
            <div className="text-sm space-y-1 w-56">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmtMXN(totales.subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>IVA</span><span>{fmtMXN(totales.iva)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-1">
                <span>Total {form.moneda}</span><span>{fmtMXN(totales.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/ordenes-compra')}
            className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="px-5 py-2.5 text-sm font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {guardando ? 'Creando OC...' : 'Crear Orden de Compra'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DETALLE OC — Con acciones de autorizar, enviar y recepcionar
// ════════════════════════════════════════════════════════════
export function OrdenCompraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [oc, setOc] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modal, setModal] = useState(null); // 'recepcion'|'email'
  const [recepcion, setRecepcion] = useState([]);
  const [emailDest, setEmailDest] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { cargar(); }, [id]);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await api.get(`/ordenes-compra/${id}`);
      setOc(res.data.datos);
      setEmailDest(res.data.datos.email_compras || res.data.datos.proveedor_email || '');
      // Inicializar formulario de recepción
      setRecepcion((res.data.datos.partidas||[])
        .filter(p => p.estado_partida !== 'completo' && p.estado_partida !== 'cancelado')
        .map(p => ({
          oc_partida_id: p.id,
          descripcion: p.descripcion,
          pendiente: parseFloat(p.cantidad_solicitada) - parseFloat(p.cantidad_recibida),
          cantidad_recibida: '',
          almacen_destino_id: '',
        })));
    } catch { navigate('/ordenes-compra'); }
    finally { setCargando(false); }
  };

  const showMsg = (txt) => { setMsg(txt); setTimeout(() => setMsg(''), 4000); };

  const autorizar = async () => {
    setProcesando(true);
    try { await api.patch(`/ordenes-compra/${id}/autorizar`); showMsg('OC autorizada'); cargar(); }
    catch (err) { alert(err.response?.data?.error || 'Error'); }
    finally { setProcesando(false); }
  };

  const enviarEmail = async () => {
    setProcesando(true);
    try { await api.post(`/ordenes-compra/${id}/enviar-email`, { email_destino: emailDest }); setModal(null); showMsg(`OC enviada a ${emailDest}`); cargar(); }
    catch (err) { alert(err.response?.data?.error || 'Error enviando email'); }
    finally { setProcesando(false); }
  };

  const registrarRecepcion = async () => {
    const items = recepcion.filter(r => parseFloat(r.cantidad_recibida) > 0);
    if (!items.length) { alert('Ingresa al menos una cantidad recibida'); return; }
    setProcesando(true);
    try {
      await api.post(`/ordenes-compra/${id}/recepcion`, { recepciones: items });
      setModal(null); showMsg('Recepción registrada'); cargar();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    finally { setProcesando(false); }
  };

  if (cargando) return <div className="p-12 text-center text-gray-400">Cargando...</div>;
  if (!oc) return null;

  const estoEstado = oc.estado;
  const puedeAutorizar = ['borrador','en_revision'].includes(estoEstado);
  const puedeEnviar    = ['autorizada','enviada_proveedor'].includes(estoEstado);
  const puedeRecepcionar = ['enviada_proveedor','recibida_parcial'].includes(estoEstado);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => navigate('/ordenes-compra')} className="text-gray-400 hover:text-gray-700 text-sm">← OC</button>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm font-bold text-blue-900">{oc.folio}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge texto={ESTADO_STYLE[estoEstado]?.label||estoEstado} color={ESTADO_STYLE[estoEstado]?.color||'bg-gray-100 text-gray-600'} />
            {oc.proveedor_nombre && <span className="text-sm text-gray-600">· {oc.proveedor_nombre}</span>}
            {oc.proyecto_folio && <span className="text-xs text-blue-700 font-mono">· {oc.proyecto_folio}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {puedeAutorizar   && <button onClick={autorizar} disabled={procesando} className="px-3 py-2 text-sm font-semibold bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50">Autorizar</button>}
          {puedeEnviar      && <button onClick={() => setModal('email')} className="px-3 py-2 text-sm font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800">Enviar Email</button>}
          {puedeRecepcionar && <button onClick={() => setModal('recepcion')} className="px-3 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700">Registrar Recepción</button>}
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Total OC', val: `${fmtMXN(oc.total)} ${oc.moneda}` },
          { label:'Partidas', val: `${oc.partidas?.filter(p=>p.estado_partida==='completo').length||0} / ${oc.partidas?.length||0}` },
          { label:'Fecha Solicitud', val: fmtDate(oc.fecha_solicitud) },
          { label:'Fecha Requerida', val: fmtDate(oc.fecha_necesidad) },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">{k.label}</div>
            <div className="font-bold text-gray-900">{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabla de partidas con semáforo de stock */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Partidas</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['#','Descripción','Unidad','Solicitado','Recibido','Precio U.','Total','Stock','Acción','Estado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(oc.partidas||[]).map((p, i) => {
                const accionS = ACCION_STYLE[p.accion_sugerida] || ACCION_STYLE.sin_stock_verificado;
                const pct = parseFloat(p.cantidad_solicitada)>0
                  ? Math.round(parseFloat(p.cantidad_recibida)/parseFloat(p.cantidad_solicitada)*100)
                  : 0;
                return (
                  <tr key={p.id} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                    <td className="px-4 py-3 text-gray-400 text-xs">{p.numero_partida}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.descripcion}</div>
                      {p.producto_codigo && <div className="text-xs text-gray-400 font-mono">{p.producto_codigo}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.unidad_medida||'—'}</td>
                    <td className="px-4 py-3 font-semibold">{fmtNum(p.cantidad_solicitada)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-green-700">{fmtNum(p.cantidad_recibida)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        <div className="bg-gray-100 rounded-full h-1 w-16 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{width:`${Math.min(pct,100)}%`}} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{fmtMXN(p.precio_unitario)}</td>
                    <td className="px-4 py-3 font-semibold">{fmtMXN(p.total)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtNum(p.stock_verificado,2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${accionS.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${accionS.dot}`} />
                        {accionS.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge texto={p.estado_partida} color={
                        p.estado_partida==='completo'?'bg-green-100 text-green-700':
                        p.estado_partida==='parcial' ?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-500'
                      } />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recepciones */}
      {(oc.recepciones||[]).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-700">Recepciones Registradas</div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['Fecha','Partida','Cantidad','Remisión','Factura','Almacén','Recibió'].map(h=>(
                <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {oc.recepciones.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-xs">{fmtDate(r.fecha_recepcion)}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{r.partida_descripcion}</td>
                  <td className="px-4 py-2 font-semibold text-green-700">{fmtNum(r.cantidad_recibida)}</td>
                  <td className="px-4 py-2 text-xs font-mono">{r.numero_remision||'—'}</td>
                  <td className="px-4 py-2 text-xs font-mono">{r.numero_factura||'—'}</td>
                  <td className="px-4 py-2 text-xs">{r.almacen_clave||'—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{r.recibido_por_nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Enviar email */}
      {modal === 'email' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-4">Enviar OC por Email</h3>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email del Proveedor</label>
              <input type="email" value={emailDest} onChange={e=>setEmailDest(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="bg-blue-50 text-blue-700 text-xs rounded-lg p-3 mb-4">
              Se enviará la OC <strong>{oc.folio}</strong> con {oc.partidas?.length} partida(s) por un total de {fmtMXN(oc.total)} {oc.moneda}.
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={enviarEmail} disabled={procesando||!emailDest}
                className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
                {procesando ? 'Enviando...' : 'Enviar OC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar recepción */}
      {modal === 'recepcion' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-blue-900 mb-4">Registrar Recepción de Material</h3>
            <div className="space-y-3">
              {recepcion.map((r, idx) => (
                <div key={r.oc_partida_id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800">{r.descripcion}</span>
                    <span className="text-xs text-gray-400">Pendiente: {fmtNum(r.pendiente,2)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-400 mb-0.5">Cantidad Recibida</label>
                      <input type="number" step="0.01" max={r.pendiente} value={r.cantidad_recibida}
                        onChange={e=>setRecepcion(rs=>rs.map((x,i)=>i===idx?{...x,cantidad_recibida:e.target.value}:x))}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-0.5">Almacén destino</label>
                      <select value={r.almacen_destino_id}
                        onChange={e=>setRecepcion(rs=>rs.map((x,i)=>i===idx?{...x,almacen_destino_id:e.target.value}:x))}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">Sin mover a almacén</option>
                        {(oc.partidas||[]).length > 0 && (
                          <>
                            <option disabled>── Generales ──</option>
                            {/* Los almacenes se pasan desde el estado si se carga el catálogo */}
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">No. Remisión</label>
                  <input id="remision" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-0.5">No. Factura</label>
                  <input id="factura" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={()=>setModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={registrarRecepcion} disabled={procesando}
                className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg disabled:opacity-50">
                {procesando ? 'Guardando...' : 'Confirmar Recepción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
