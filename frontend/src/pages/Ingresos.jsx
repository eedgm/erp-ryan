import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN  = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtNum  = (v,d=4) => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtDate = v => v ? new Date(v+'T12:00:00').toLocaleDateString('es-MX') : '—';

const COBRO_STYLE = {
  'Pendiente':    { color:'bg-amber-100 text-amber-700', dot:'bg-amber-500' },
  'Cobro Parcial':{ color:'bg-blue-100 text-blue-700',   dot:'bg-blue-500'  },
  'Cobrado':      { color:'bg-green-100 text-green-700', dot:'bg-green-500' },
};
const MONEDAS = ['MXN','USD','USDT','USDC','BTC','ETH'];
const TIPOS_ING = ['Venta Servicio','Venta Suministro','Anticipo','Estimacion','Otro'];
const FORMAS_PAGO = ['Transferencia','Cheque','Efectivo','USDT','USDC','BTC','ETH'];

const Badge = ({ texto, color, dot }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
    {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}{texto}
  </span>
);

// ── Formulario de nueva partida ───────────────────────────────
const PartidaRow = ({ p, idx, onChange, onRemove, productos }) => {
  const qty   = parseFloat(p.cantidad||1);
  const price = parseFloat(p.precio_unitario||0);
  const desc  = parseFloat(p.descuento_pct||0);
  const sub   = qty * price * (1 - desc/100);
  const iva   = p.aplica_iva ? sub * (parseFloat(p.tasa_iva||16)/100) : 0;

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="grid grid-cols-6 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-0.5">Producto / Descripción *</label>
          <select value={p.producto_id||''} onChange={e => {
            const prod = productos.find(pr=>String(pr.id)===e.target.value);
            onChange(idx,'producto_id',e.target.value);
            if(prod){ onChange(idx,'descripcion',prod.nombre); onChange(idx,'precio_unitario',prod.precio_venta_mxn||''); onChange(idx,'unidad_medida',prod.unidad_medida||''); }
          }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">— Manual —</option>
            {productos.map(pr=><option key={pr.id} value={pr.id}>{pr.codigo?`[${pr.codigo}] `:''}{pr.nombre}</option>)}
          </select>
          <input value={p.descripcion||''} onChange={e=>onChange(idx,'descripcion',e.target.value)} required
            placeholder="Descripción" className="w-full mt-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-0.5">Unidad</label>
          <input value={p.unidad_medida||''} onChange={e=>onChange(idx,'unidad_medida',e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-0.5">Cantidad</label>
          <input type="number" step="0.01" value={p.cantidad||1} onChange={e=>onChange(idx,'cantidad',e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-0.5">Precio Unitario</label>
          <input type="number" step="0.0001" value={p.precio_unitario||''} onChange={e=>onChange(idx,'precio_unitario',e.target.value)} required
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-0.5">IVA</label>
            <label className="flex items-center gap-1 mt-1.5">
              <input type="checkbox" checked={p.aplica_iva!==false} onChange={e=>onChange(idx,'aplica_iva',e.target.checked)} className="rounded" />
              <span className="text-xs text-gray-500">16%</span>
            </label>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-0.5">Total</label>
            <div className="px-2 py-1.5 bg-gray-50 rounded text-xs font-semibold border border-gray-200">{fmtMXN(sub+iva)}</div>
          </div>
          <button type="button" onClick={()=>onRemove(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none mb-0.5">×</button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
// LISTA DE INGRESOS
// ════════════════════════════════════════════════════════════
export function IngresosLista() {
  const navigate = useNavigate();
  const [ingresos,  setIngresos]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [totales,   setTotales]   = useState({});
  const [cargando,  setCargando]  = useState(true);
  const [filtros,   setFiltros]   = useState({ search:'', estado_cobro:'', tipo:'', desde:'', hasta:'' });
  const [modalCobro, setModalCobro] = useState(null);
  const [formCobro,  setFormCobro]  = useState({ fecha:'', monto:'', moneda:'MXN', tipo_cambio:'1', forma_pago:'Transferencia', referencia:'' });
  const [guardando,  setGuardando]  = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = {...filtros, limit:30};
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const res = await api.get('/ingresos', { params });
      setIngresos(res.data.datos);
      setTotal(res.data.total);
      setTotales(res.data.totales||{});
    } finally { setCargando(false); }
  }, [filtros]);

  useEffect(()=>{ cargar(); },[cargar]);

  const showMsg = txt => { setMsg(txt); setTimeout(()=>setMsg(''),4000); };

  const registrarCobro = async () => {
    setGuardando(true);
    try {
      await api.post(`/ingresos/${modalCobro.id}/cobros`, formCobro);
      setModalCobro(null);
      showMsg('Cobro registrado correctamente');
      cargar();
    } catch(err){ alert(err.response?.data?.error||'Error'); }
    finally { setGuardando(false); }
  };

  const hoy = new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Ingresos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} registros</p>
        </div>
        <button onClick={()=>navigate('/ingresos/nuevo')} className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Nuevo Ingreso</button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Total Ingresos', val: fmtMXN(totales.total_total),     color:'text-blue-900', bg:'bg-blue-50' },
          { label:'Cobrado',        val: fmtMXN(totales.cobrado_total),    color:'text-green-700',bg:'bg-green-50'},
          { label:'Por Cobrar',     val: fmtMXN(totales.pendiente_total),  color:'text-amber-700',bg:'bg-amber-50'},
          { label:'IVA Trasladado', val: fmtMXN(totales.iva_total),        color:'text-orange-700',bg:'bg-orange-50'},
        ].map(k=>(
          <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input type="text" placeholder="Buscar folio, concepto, cliente..."
          value={filtros.search} onChange={e=>setFiltros(f=>({...f,search:e.target.value}))}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filtros.estado_cobro} onChange={e=>setFiltros(f=>({...f,estado_cobro:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los cobros</option>
          <option>Pendiente</option><option>Cobro Parcial</option><option>Cobrado</option>
        </select>
        <select value={filtros.tipo} onChange={e=>setFiltros(f=>({...f,tipo:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los tipos</option>
          {TIPOS_ING.map(t=><option key={t}>{t}</option>)}
        </select>
        <input type="date" value={filtros.desde} onChange={e=>setFiltros(f=>({...f,desde:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="date" value={filtros.hasta} onChange={e=>setFiltros(f=>({...f,hasta:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-10 text-center text-gray-400 text-sm">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Folio','Fecha','Proyecto','Cliente','Tipo','Moneda','Subtotal','IVA','Total','Cobrado','Estado',''].map(h=>(
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingresos.map((ing,i)=>{
                  const st = COBRO_STYLE[ing.estado_cobro] || COBRO_STYLE['Pendiente'];
                  const cobradoPct = parseFloat(ing.total_mxn)>0
                    ? Math.min(Math.round(parseFloat(ing.cobrado_mxn||0)/parseFloat(ing.total_mxn)*100),100)
                    : 0;
                  return (
                    <tr key={ing.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="px-3 py-3 font-mono text-xs font-bold text-blue-900">{ing.folio_interno}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(ing.fecha)}</td>
                      <td className="px-3 py-3">
                        {ing.proyecto_folio
                          ? <span className="font-mono text-xs text-blue-700">{ing.proyecto_folio}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-700 max-w-32 truncate">{ing.cliente_nombre||'—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500">{ing.tipo}</td>
                      <td className="px-3 py-3"><Badge texto={ing.moneda} color={ing.moneda==='MXN'?'bg-blue-50 text-blue-700':'bg-purple-50 text-purple-700'} /></td>
                      <td className="px-3 py-3">{fmtMXN(ing.subtotal_mxn)}</td>
                      <td className="px-3 py-3 text-orange-600">{fmtMXN(ing.iva_mxn)}</td>
                      <td className="px-3 py-3 font-semibold">{fmtMXN(ing.total_mxn)}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="bg-gray-100 rounded-full h-1.5 w-14 overflow-hidden">
                            <div className="h-full rounded-full bg-green-500" style={{width:`${cobradoPct}%`}} />
                          </div>
                          <span className="text-xs text-gray-500">{cobradoPct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Badge texto={ing.estado_cobro} color={st.color} dot={st.dot} /></td>
                      <td className="px-3 py-3">
                        {ing.estado_cobro !== 'Cobrado' && (
                          <button onClick={()=>{setModalCobro(ing);setFormCobro({fecha:hoy,monto:'',moneda:'MXN',tipo_cambio:'1',forma_pago:'Transferencia',referencia:''});}}
                            className="text-xs text-blue-600 font-medium hover:text-blue-800 whitespace-nowrap">
                            + Cobro
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!ingresos.length && <tr><td colSpan="12" className="px-4 py-10 text-center text-gray-400 text-sm">Sin ingresos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal cobro */}
      {modalCobro && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModalCobro(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-1">Registrar Cobro</h3>
            <p className="text-sm text-gray-500 mb-4">{modalCobro.folio_interno} · Pendiente: {fmtMXN(parseFloat(modalCobro.total_mxn)-parseFloat(modalCobro.cobrado_mxn||0))}</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['fecha','Fecha','date',true],['monto','Monto','number',true],
              ].map(([k,l,t,req])=>(
                <div key={k}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{l}{req&&' *'}</label>
                  <input type={t} value={formCobro[k]} onChange={e=>setFormCobro(f=>({...f,[k]:e.target.value}))} required={req}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Moneda</label>
                <select value={formCobro.moneda} onChange={e=>setFormCobro(f=>({...f,moneda:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {MONEDAS.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Forma de Pago</label>
                <select value={formCobro.forma_pago} onChange={e=>setFormCobro(f=>({...f,forma_pago:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FORMAS_PAGO.map(fp=><option key={fp}>{fp}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Referencia</label>
                <input value={formCobro.referencia} onChange={e=>setFormCobro(f=>({...f,referencia:e.target.value}))}
                  placeholder="No. transferencia, hash, cheque..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={()=>setModalCobro(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={registrarCobro} disabled={guardando||!formCobro.fecha||!formCobro.monto}
                className="px-4 py-2 text-sm font-semibold bg-green-700 text-white rounded-lg disabled:opacity-50">
                {guardando?'Guardando...':'Registrar Cobro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// NUEVO INGRESO
// ════════════════════════════════════════════════════════════
export function NuevoIngreso() {
  const navigate = useNavigate();
  const [clientes,  setClientes]  = useState([]);
  const [proyectos, setProyectos] = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [cuentas,   setCuentas]   = useState([]);
  const [productos, setProductos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState('');
  const hoy = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    unidad_negocio_id:'', proyecto_id:'', cliente_id:'',
    fecha: hoy, concepto:'', tipo:'Venta Servicio',
    moneda:'MXN', tipo_cambio:'1',
    cuenta_bancaria_id:'', referencia_externa:'', notas:'',
  });
  const [partidas, setPartidas] = useState([{
    producto_id:'', descripcion:'', unidad_medida:'',
    cantidad:1, precio_unitario:'', aplica_iva:true, tasa_iva:16, descuento_pct:0,
  }]);

  useEffect(()=>{
    Promise.all([
      api.get('/clientes?activo=true&limit=200'),
      api.get('/proyectos?estado=Activo&limit=100'),
      api.get('/unidades'),
      api.get('/cuentas-bancarias'),
      api.get('/productos?activo=true&limit=500'),
    ]).then(([cRes,pRes,uRes,cbRes,prodRes])=>{
      setClientes(cRes.data.datos);
      setProyectos(pRes.data.datos);
      setUnidades(uRes.data.datos);
      setCuentas(cbRes.data.datos);
      setProductos(prodRes.data.datos);
    });
  },[]);

  const setField = (k,v) => setForm(f=>({...f,[k]:v}));
  const setPField = (idx,k,v) => setPartidas(ps=>ps.map((p,i)=>i===idx?{...p,[k]:v}:p));
  const addPartida  = () => setPartidas(ps=>[...ps,{producto_id:'',descripcion:'',unidad_medida:'',cantidad:1,precio_unitario:'',aplica_iva:true,tasa_iva:16,descuento_pct:0}]);
  const removePartida = idx => setPartidas(ps=>ps.filter((_,i)=>i!==idx));

  const totales = partidas.reduce((acc,p)=>{
    const sub = parseFloat(p.cantidad||1)*parseFloat(p.precio_unitario||0)*(1-parseFloat(p.descuento_pct||0)/100);
    const iva = p.aplica_iva ? sub*(parseFloat(p.tasa_iva||16)/100) : 0;
    return { subtotal:acc.subtotal+sub, iva:acc.iva+iva, total:acc.total+sub+iva };
  },{ subtotal:0, iva:0, total:0 });

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    const pValidas = partidas.filter(p=>p.descripcion&&parseFloat(p.precio_unitario)>=0);
    if(!pValidas.length){ setError('Agrega al menos una partida válida'); return; }
    setGuardando(true);
    try {
      const res = await api.post('/ingresos',{...form,partidas:pValidas});
      navigate('/ingresos');
    } catch(err){ setError(err.response?.data?.error||'Error al crear ingreso'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={()=>navigate('/ingresos')} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
        <h1 className="text-xl font-bold text-blue-900">Nuevo Ingreso</h1>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Datos Generales</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { k:'unidad_negocio_id', l:'Unidad de Negocio *', type:'select', opts:unidades.map(u=>({v:u.id,l:`${u.codigo} — ${u.nombre}`})), req:true },
              { k:'proyecto_id', l:'Proyecto', type:'select', opts:[{v:'',l:'Sin proyecto'},...proyectos.map(p=>({v:p.id,l:`${p.folio} — ${p.nombre}`}))] },
              { k:'cliente_id', l:'Cliente', type:'select', opts:[{v:'',l:'Sin cliente'},...clientes.map(c=>({v:c.id,l:c.nombre}))] },
              { k:'fecha', l:'Fecha *', type:'date', req:true },
              { k:'tipo', l:'Tipo', type:'select', opts:TIPOS_ING.map(t=>({v:t,l:t})) },
              { k:'moneda', l:'Moneda', type:'select', opts:MONEDAS.map(m=>({v:m,l:m})) },
            ].map(f=>(
              <div key={f.k}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{f.l}</label>
                {f.type==='select'
                  ? <select value={form[f.k]} onChange={e=>setField(f.k,e.target.value)} required={f.req}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {f.opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  : <input type={f.type} value={form[f.k]} onChange={e=>setField(f.k,e.target.value)} required={f.req}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />}
              </div>
            ))}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Concepto *</label>
              <input value={form.concepto} onChange={e=>setField('concepto',e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cuenta Bancaria</label>
              <select value={form.cuenta_bancaria_id} onChange={e=>setField('cuenta_bancaria_id',e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin cuenta</option>
                {cuentas.map(c=><option key={c.id} value={c.id}>{c.banco} — {c.nombre_cuenta} ({c.moneda})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Referencia Externa</label>
              <input value={form.referencia_externa} onChange={e=>setField('referencia_externa',e.target.value)}
                placeholder="No. orden cliente, referencia..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* Partidas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Partidas</h2>
            <button type="button" onClick={addPartida} className="text-xs font-semibold px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">+ Partida</button>
          </div>
          <div className="space-y-3">
            {partidas.map((p,idx)=>(
              <PartidaRow key={idx} p={p} idx={idx} onChange={setPField} onRemove={removePartida} productos={productos} />
            ))}
          </div>
          <div className="border-t border-gray-100 mt-4 pt-4 flex justify-end">
            <div className="text-sm space-y-1 w-52">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmtMXN(totales.subtotal)}</span></div>
              <div className="flex justify-between text-orange-600"><span>IVA (16%)</span><span>{fmtMXN(totales.iva)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-1">
                <span>Total {form.moneda}</span><span>{fmtMXN(totales.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={()=>navigate('/ingresos')} className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-5 py-2.5 text-sm font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {guardando?'Guardando...':'Registrar Ingreso'}
          </button>
        </div>
      </form>
    </div>
  );
}
