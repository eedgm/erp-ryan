import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN  = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtDate = v => v ? new Date(v+'T12:00:00').toLocaleDateString('es-MX') : '—';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONEDAS   = ['MXN','USD','USDT','USDC','BTC','ETH'];
const FORMAS    = ['Transferencia','Cheque','Efectivo','USDT','USDC','BTC','ETH'];
const COMPROBANTES = ['Factura','Recibo','Nota','Sin comprobante'];
const CATEGORIAS = ['Material','Mano de Obra','Subcontrato','Administracion','Viaticos','Flete','Operacion','Otro'];

const Badge = ({texto,color}) => <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{texto}</span>;

// ════════════════════════════════════════════════════════════
// LISTA DE GASTOS
// ════════════════════════════════════════════════════════════
export function GastosLista() {
  const navigate = useNavigate();
  const [gastos,   setGastos]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [totales,  setTotales]  = useState({});
  const [cargando, setCargando] = useState(true);
  const [filtros,  setFiltros]  = useState({ search:'',estado_pago:'',comprobante_tipo:'',categoria:'',desde:'',hasta:'' });
  const [modalPago, setModalPago] = useState(null);
  const [formPago,  setFormPago]  = useState({ fecha:'', monto:'', moneda:'MXN', tipo_cambio:'1', forma_pago:'Transferencia', referencia:'' });
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = {...filtros,limit:30};
      Object.keys(params).forEach(k=>!params[k]&&delete params[k]);
      const res = await api.get('/gastos',{params});
      setGastos(res.data.datos); setTotal(res.data.total); setTotales(res.data.totales||{});
    } finally { setCargando(false); }
  },[filtros]);

  useEffect(()=>{cargar();},[cargar]);
  const showMsg = txt => { setMsg(txt); setTimeout(()=>setMsg(''),4000); };

  const registrarPago = async () => {
    setGuardando(true);
    try {
      await api.post(`/gastos/${modalPago.id}/pagos`, formPago);
      setModalPago(null); showMsg('Pago registrado'); cargar();
    } catch(err){ alert(err.response?.data?.error||'Error'); }
    finally { setGuardando(false); }
  };

  const hoy = new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Gastos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} registros</p>
        </div>
        <button onClick={()=>navigate('/gastos/nuevo')} className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Nuevo Gasto</button>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Total Gastos',      val: fmtMXN(totales.total_total),              color:'text-blue-900',  bg:'bg-blue-50'  },
          { label:'Pagado',            val: fmtMXN(totales.pagado_total),             color:'text-green-700', bg:'bg-green-50' },
          { label:'Pendiente Pago',    val: fmtMXN(totales.pendiente_total),          color:'text-amber-700', bg:'bg-amber-50' },
          { label:'IVA Acreditable',   val: fmtMXN(totales.iva_acreditable_facturas), color:'text-teal-700',  bg:'bg-teal-50'  },
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
        <input type="text" placeholder="Buscar folio, concepto, proveedor..."
          value={filtros.search} onChange={e=>setFiltros(f=>({...f,search:e.target.value}))}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filtros.estado_pago} onChange={e=>setFiltros(f=>({...f,estado_pago:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los pagos</option>
          <option>Pendiente</option><option>Pagado</option>
        </select>
        <select value={filtros.comprobante_tipo} onChange={e=>setFiltros(f=>({...f,comprobante_tipo:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos comprobantes</option>
          {COMPROBANTES.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={filtros.categoria} onChange={e=>setFiltros(f=>({...f,categoria:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas categorías</option>
          {CATEGORIAS.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-10 text-center text-gray-400 text-sm">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Folio','Fecha','Proyecto','Proveedor','Familia','Categoría','Comprobante','Total MXN','IVA Acred.','Estado',''].map(h=>(
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.map((g,i)=>(
                  <tr key={g.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                    <td className="px-3 py-3 font-mono text-xs font-bold text-blue-900">{g.folio_interno}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(g.fecha)}</td>
                    <td className="px-3 py-3">{g.proyecto_folio?<span className="font-mono text-xs text-blue-700">{g.proyecto_folio}</span>:<span className="text-gray-300 text-xs">—</span>}</td>
                    <td className="px-3 py-3 text-xs text-gray-700 max-w-32 truncate">{g.proveedor_nombre||'—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{g.familia_nombre||'—'}</td>
                    <td className="px-3 py-3"><Badge texto={g.categoria} color="bg-gray-100 text-gray-600" /></td>
                    <td className="px-3 py-3">
                      <Badge texto={g.comprobante_tipo}
                        color={g.comprobante_tipo==='Factura'?'bg-green-100 text-green-700':g.comprobante_tipo==='Sin comprobante'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-600'} />
                    </td>
                    <td className="px-3 py-3 font-semibold">{fmtMXN(g.total_mxn)}</td>
                    <td className="px-3 py-3 text-teal-700">{g.comprobante_tipo==='Factura'?fmtMXN(g.iva_mxn):'—'}</td>
                    <td className="px-3 py-3">
                      <Badge texto={g.estado_pago} color={g.estado_pago==='Pagado'?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'} />
                    </td>
                    <td className="px-3 py-3">
                      {g.estado_pago!=='Pagado' && (
                        <button onClick={()=>{setModalPago(g);setFormPago({fecha:hoy,monto:'',moneda:'MXN',tipo_cambio:'1',forma_pago:'Transferencia',referencia:''});}}
                          className="text-xs text-blue-600 font-medium hover:text-blue-800 whitespace-nowrap">+ Pago</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!gastos.length && <tr><td colSpan="11" className="px-4 py-10 text-center text-gray-400 text-sm">Sin gastos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal pago */}
      {modalPago && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModalPago(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-1">Registrar Pago</h3>
            <p className="text-sm text-gray-500 mb-4">{modalPago.folio_interno} · Total: {fmtMXN(modalPago.total_mxn)}</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha *</label>
                <input type="date" value={formPago.fecha} onChange={e=>setFormPago(f=>({...f,fecha:e.target.value}))} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Monto *</label>
                <input type="number" step="0.01" value={formPago.monto} onChange={e=>setFormPago(f=>({...f,monto:e.target.value}))} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Moneda</label>
                <select value={formPago.moneda} onChange={e=>setFormPago(f=>({...f,moneda:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {MONEDAS.map(m=><option key={m}>{m}</option>)}
                </select></div>
              <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Forma de Pago</label>
                <select value={formPago.forma_pago} onChange={e=>setFormPago(f=>({...f,forma_pago:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FORMAS.map(fp=><option key={fp}>{fp}</option>)}
                </select></div>
              <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Referencia</label>
                <input value={formPago.referencia} onChange={e=>setFormPago(f=>({...f,referencia:e.target.value}))}
                  placeholder="No. transferencia, cheque, hash..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={()=>setModalPago(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={registrarPago} disabled={guardando||!formPago.fecha||!formPago.monto}
                className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
                {guardando?'Guardando...':'Registrar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CONTROL DE IVA
// ════════════════════════════════════════════════════════════
export function ControlIVA() {
  const anioActual = new Date().getFullYear();
  const mesActual  = new Date().getMonth() + 1;
  const [anio,  setAnio]  = useState(anioActual);
  const [mesSelec, setMesSelec] = useState(mesActual);
  const [resumen, setResumen] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [msg, setMsg] = useState('');

  const cargarResumen = useCallback(async () => {
    setCargando(true);
    try { const r = await api.get(`/iva/anual?anio=${anio}`); setResumen(r.data); }
    finally { setCargando(false); }
  },[anio]);

  const cargarDetalle = useCallback(async () => {
    try { const r = await api.get(`/iva/periodo/${anio}/${mesSelec}`); setDetalle(r.data); }
    catch { setDetalle(null); }
  },[anio, mesSelec]);

  useEffect(()=>{ cargarResumen(); },[cargarResumen]);
  useEffect(()=>{ cargarDetalle(); },[cargarDetalle]);

  const showMsg = txt => { setMsg(txt); setTimeout(()=>setMsg(''),4000); };

  const cerrarPeriodo = async () => {
    if(!confirm(`¿Cerrar el periodo ${MESES[mesSelec-1]} ${anio}? Esta acción no se puede deshacer.`)) return;
    setProcesando(true);
    try {
      await api.patch(`/iva/periodo/${anio}/${mesSelec}/cerrar`);
      showMsg(`Periodo ${MESES[mesSelec-1]} ${anio} cerrado`);
      cargarResumen(); cargarDetalle();
    } catch(err){ alert(err.response?.data?.error||'Error'); }
    finally { setProcesando(false); }
  };

  const periodoDetalle = detalle?.periodo;
  const esAbierto = periodoDetalle?.estado === 'Abierto' || !periodoDetalle;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-blue-900">Control de IVA</h1>
        <div className="flex items-center gap-3">
          <select value={anio} onChange={e=>setAnio(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {[anioActual-1, anioActual, anioActual+1].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* Resumen anual */}
      {resumen && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="text-sm font-bold text-gray-700 mb-3">Resumen {anio}</div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label:'IVA Trasladado Acum.',  val: fmtMXN(resumen.acumulado.trasladado),  color:'text-orange-600', bg:'bg-orange-50' },
              { label:'IVA Acreditable Acum.', val: fmtMXN(resumen.acumulado.acreditable), color:'text-teal-700',   bg:'bg-teal-50'   },
              { label:'IVA Neto Acumulado',    val: fmtMXN(resumen.acumulado.neto),
                color: resumen.acumulado.neto > 0 ? 'text-red-700' : 'text-green-700',
                bg:    resumen.acumulado.neto > 0 ? 'bg-red-50'    : 'bg-green-50',
                sub:   resumen.acumulado.neto > 0 ? 'A pagar' : 'A favor' },
            ].map(k=>(
              <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
                <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
                {k.sub && <div className={`text-xs font-semibold mt-1 ${k.color}`}>{k.sub}</div>}
              </div>
            ))}
          </div>
          {/* Grid mensual clickeable */}
          <div className="grid grid-cols-6 gap-2">
            {cargando ? <div className="col-span-6 text-center text-gray-400 py-4 text-sm">Calculando...</div> :
              Array.from({length:12},(_,i)=>i+1).map(m=>{
                const mes = resumen.meses.find(r=>parseInt(r.mes)===m);
                const neto = parseFloat(mes?.iva_neto||0);
                const isSelec = m === mesSelec;
                return (
                  <div key={m} onClick={()=>setMesSelec(m)}
                    className={`rounded-lg p-2.5 cursor-pointer border-2 transition ${isSelec?'border-blue-900 bg-blue-50':'border-gray-100 hover:border-gray-300 bg-white'}`}>
                    <div className={`text-xs font-semibold ${isSelec?'text-blue-900':'text-gray-600'}`}>{MESES[m-1].substring(0,3)}</div>
                    <div className={`text-sm font-bold mt-0.5 ${neto>0?'text-red-600':neto<0?'text-green-600':'text-gray-400'}`}>
                      {mes ? fmtMXN(Math.abs(neto)).replace('$','$') : '—'}
                    </div>
                    {mes?.estado==='Cerrado' && <div className="text-xs text-purple-600 font-semibold mt-0.5">Cerrado</div>}
                  </div>
                );
              })
            }
          </div>
        </div>
      )}

      {/* Detalle del mes seleccionado */}
      {detalle && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-bold text-gray-900 text-base">{MESES[mesSelec-1]} {anio}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge texto={periodoDetalle?.estado||'Abierto'} color={periodoDetalle?.estado==='Cerrado'?'bg-purple-100 text-purple-700':'bg-green-100 text-green-700'} />
              </div>
            </div>
            {esAbierto && (
              <button onClick={cerrarPeriodo} disabled={procesando}
                className="px-3 py-2 text-sm font-semibold border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50">
                Cerrar Periodo
              </button>
            )}
          </div>

          {/* Resumen del mes */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label:'IVA Trasladado',  val: fmtMXN(detalle.totales.iva_trasladado),  sub:'En ingresos del mes',    color:'text-orange-600', bg:'bg-orange-50' },
              { label:'IVA Acreditable', val: fmtMXN(detalle.totales.iva_acreditable), sub:'En facturas de gastos',  color:'text-teal-700',   bg:'bg-teal-50' },
              { label: detalle.totales.iva_neto>0?'IVA a Pagar':'IVA a Favor',
                val:   fmtMXN(detalle.totales.iva_neto>0?detalle.totales.a_pagar:detalle.totales.a_favor),
                sub:   detalle.totales.iva_neto>0?'Traslado − Acreditable':'Acreditable > Traslado',
                color: detalle.totales.iva_neto>0?'text-red-700':'text-green-700',
                bg:    detalle.totales.iva_neto>0?'bg-red-50':'bg-green-50' },
            ].map(k=>(
              <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
                <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
                <div className="text-sm font-semibold text-gray-700 mt-0.5">{k.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Por unidad de negocio */}
          {detalle.por_unidad?.length > 0 && (
            <div className="mb-5">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Por Unidad de Negocio</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {['Unidad','IVA Trasladado','IVA Acreditable','IVA Neto'].map(h=>(
                      <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {detalle.por_unidad.map(u=>{
                      const neto = parseFloat(u.iva_trasladado) - parseFloat(u.iva_acreditable);
                      return (
                        <tr key={u.codigo} className="border-b border-gray-50">
                          <td className="px-3 py-2"><Badge texto={u.codigo} color="bg-blue-100 text-blue-800" /></td>
                          <td className="px-3 py-2 text-orange-600">{fmtMXN(u.iva_trasladado)}</td>
                          <td className="px-3 py-2 text-teal-700">{fmtMXN(u.iva_acreditable)}</td>
                          <td className="px-3 py-2"><span className={`font-semibold ${neto>0?'text-red-600':'text-green-600'}`}>{fmtMXN(neto)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tablas ingresos y gastos del mes */}
          <div className="grid grid-cols-2 gap-5">
            {/* Ingresos con IVA */}
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Ingresos con IVA ({detalle.ingresos_con_iva?.length||0})
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {['Folio','Fecha','IVA MXN'].map(h=><th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(detalle.ingresos_con_iva||[]).map(i=>(
                      <tr key={i.folio_interno} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono text-blue-700">{i.folio_interno}</td>
                        <td className="px-3 py-1.5 text-gray-500">{fmtDate(i.fecha)}</td>
                        <td className="px-3 py-1.5 font-semibold text-orange-600">{fmtMXN(i.iva_mxn)}</td>
                      </tr>
                    ))}
                    {!detalle.ingresos_con_iva?.length && <tr><td colSpan="3" className="px-3 py-4 text-center text-gray-400">Sin ingresos con IVA</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Gastos con IVA acreditable */}
            <div>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Gastos Acreditables ({detalle.gastos_acreditables?.length||0})
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">
                    {['Folio','Proveedor','IVA Acred.'].map(h=><th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(detalle.gastos_acreditables||[]).map(g=>(
                      <tr key={g.folio_interno} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-mono text-blue-700">{g.folio_interno}</td>
                        <td className="px-3 py-1.5 text-gray-500 truncate max-w-24">{g.proveedor_nombre||'—'}</td>
                        <td className="px-3 py-1.5 font-semibold text-teal-700">{fmtMXN(g.iva_acreditable)}</td>
                      </tr>
                    ))}
                    {!detalle.gastos_acreditables?.length && <tr><td colSpan="3" className="px-3 py-4 text-center text-gray-400">Sin gastos con factura</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// NUEVO GASTO (formulario simplificado)
// ════════════════════════════════════════════════════════════
export function NuevoGasto() {
  const navigate = useNavigate();
  const [proyectos,  setProyectos]  = useState([]);
  const [proveedores,setProveedores]= useState([]);
  const [unidades,   setUnidades]   = useState([]);
  const [familias,   setFamilias]   = useState([]);
  const [guardando,  setGuardando]  = useState(false);
  const [error,      setError]      = useState('');
  const hoy = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    unidad_negocio_id:'', proyecto_id:'', proveedor_id:'', familia_presupuesto_id:'',
    fecha:hoy, concepto:'', categoria:'Operacion', moneda:'MXN', tipo_cambio:'1',
    comprobante_tipo:'Sin comprobante', comprobante_folio:'', notas:'',
  });
  const [partidas, setPartidas] = useState([{descripcion:'',cantidad:1,precio_unitario:'',aplica_iva:true,tasa_iva:16}]);

  useEffect(()=>{
    Promise.all([
      api.get('/proyectos?estado=Activo&limit=100'),
      api.get('/proveedores?activo=true&limit=200'),
      api.get('/unidades'),
      api.get('/familias-presupuesto'),
    ]).then(([pRes,pvRes,uRes,fRes])=>{
      setProyectos(pRes.data.datos); setProveedores(pvRes.data.datos);
      setUnidades(uRes.data.datos);  setFamilias(fRes.data.datos);
    });
  },[]);

  const setField = (k,v) => setForm(f=>({...f,[k]:v}));
  const setPField = (idx,k,v) => setPartidas(ps=>ps.map((p,i)=>i===idx?{...p,[k]:v}:p));
  const esFactura = form.comprobante_tipo === 'Factura';

  const totales = partidas.reduce((acc,p)=>{
    const sub = parseFloat(p.cantidad||1)*parseFloat(p.precio_unitario||0);
    const iva = (p.aplica_iva && esFactura) ? sub*(parseFloat(p.tasa_iva||16)/100) : 0;
    return { subtotal:acc.subtotal+sub, iva:acc.iva+iva, total:acc.total+sub+iva };
  },{ subtotal:0, iva:0, total:0 });

  const handleSubmit = async e => {
    e.preventDefault(); setError('');
    const pValidas = partidas.filter(p=>p.descripcion&&parseFloat(p.precio_unitario)>=0);
    if(!pValidas.length){ setError('Agrega al menos una partida'); return; }
    setGuardando(true);
    try {
      await api.post('/gastos',{...form,partidas:pValidas});
      navigate('/gastos');
    } catch(err){ setError(err.response?.data?.error||'Error al crear gasto'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={()=>navigate('/gastos')} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
        <h1 className="text-xl font-bold text-blue-900">Nuevo Gasto</h1>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Datos del Gasto</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              {k:'unidad_negocio_id',l:'Unidad *',type:'select',opts:unidades.map(u=>({v:u.id,l:`${u.codigo} — ${u.nombre}`})),req:true},
              {k:'proyecto_id',l:'Proyecto',type:'select',opts:[{v:'',l:'Sin proyecto'},...proyectos.map(p=>({v:p.id,l:`${p.folio} — ${p.nombre}`}))]},
              {k:'proveedor_id',l:'Proveedor',type:'select',opts:[{v:'',l:'Sin proveedor'},...proveedores.map(p=>({v:p.id,l:p.nombre}))]},
              {k:'familia_presupuesto_id',l:'Familia de Presupuesto',type:'select',opts:[{v:'',l:'Sin familia'},...familias.map(f=>({v:f.id,l:f.nombre}))]},
              {k:'fecha',l:'Fecha *',type:'date',req:true},
              {k:'categoria',l:'Categoría',type:'select',opts:CATEGORIAS.map(c=>({v:c,l:c}))},
              {k:'comprobante_tipo',l:'Tipo Comprobante',type:'select',opts:COMPROBANTES.map(c=>({v:c,l:c}))},
              {k:'comprobante_folio',l:'Folio Comprobante',type:'text'},
              {k:'moneda',l:'Moneda',type:'select',opts:MONEDAS.map(m=>({v:m,l:m}))},
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
          </div>
        </div>

        {/* Partidas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Partidas</h2>
            <button type="button" onClick={()=>setPartidas(ps=>[...ps,{descripcion:'',cantidad:1,precio_unitario:'',aplica_iva:true,tasa_iva:16}])}
              className="text-xs font-semibold px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">+ Partida</button>
          </div>
          <div className="space-y-3">
            {partidas.map((p,idx)=>{
              const sub = parseFloat(p.cantidad||1)*parseFloat(p.precio_unitario||0);
              const iva = (p.aplica_iva&&esFactura)?sub*(parseFloat(p.tasa_iva||16)/100):0;
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-4">
                  <div className="grid grid-cols-5 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-0.5">Descripción *</label>
                      <input value={p.descripcion} onChange={e=>setPField(idx,'descripcion',e.target.value)} required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-0.5">Cantidad</label>
                      <input type="number" step="0.01" value={p.cantidad} onChange={e=>setPField(idx,'cantidad',e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-0.5">Precio Unit.</label>
                      <input type="number" step="0.0001" value={p.precio_unitario} onChange={e=>setPField(idx,'precio_unitario',e.target.value)} required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    </div>
                    <div className="flex items-end gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-0.5">Total</label>
                        <div className="px-2 py-1.5 bg-gray-50 rounded text-xs font-semibold border border-gray-200">${(sub+iva).toLocaleString('es-MX',{minimumFractionDigits:2})}</div>
                      </div>
                      {partidas.length>1 && <button type="button" onClick={()=>setPartidas(ps=>ps.filter((_,i)=>i!==idx))} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>}
                    </div>
                  </div>
                  {esFactura && (
                    <div className="mt-2 flex items-center gap-2">
                      <input type="checkbox" checked={p.aplica_iva} onChange={e=>setPField(idx,'aplica_iva',e.target.checked)} className="rounded" />
                      <span className="text-xs text-gray-500">Aplica IVA 16% = {fmtMXN(iva)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-gray-100 mt-4 pt-4 flex justify-end">
            <div className="text-sm space-y-1 w-52">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmtMXN(totales.subtotal)}</span></div>
              {esFactura && <div className="flex justify-between text-teal-600"><span>IVA Acreditable</span><span>{fmtMXN(totales.iva)}</span></div>}
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-200 pt-1">
                <span>Total {form.moneda}</span><span>{fmtMXN(totales.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={()=>navigate('/gastos')} className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-5 py-2.5 text-sm font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50">
            {guardando?'Guardando...':'Registrar Gasto'}
          </button>
        </div>
      </form>
    </div>
  );
}
