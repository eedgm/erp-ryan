import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';

// ── Helpers ───────────────────────────────────────────────────
const fmtMXN  = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtNum  = (v,d=1) => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtDate = v => v ? new Date(v+'T12:00:00').toLocaleDateString('es-MX') : '—';
const fmtPct  = v => `${fmtNum(v,1)}%`;
const anioActual = new Date().getFullYear();
const mesActual  = new Date().getMonth()+1;

const UNIDAD_COLORS = { CI:'bg-blue-100 text-blue-800', PY:'bg-green-100 text-green-800', OM:'bg-orange-100 text-orange-800' };
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const Badge = ({texto,color}) => <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color||'bg-gray-100 text-gray-600'}`}>{texto}</span>;

// ── Export CSV helper ─────────────────────────────────────────
const exportCSV = (datos, nombre) => {
  if (!datos?.length) return;
  const cols = Object.keys(datos[0]);
  const csv  = [cols.join(','), ...datos.map(r => cols.map(c=>`"${r[c]??''}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${nombre}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
};

// ── Barra de progreso ─────────────────────────────────────────
const Bar = ({pct, color='bg-blue-500', height='h-1.5'}) => (
  <div className={`bg-gray-100 rounded-full ${height} overflow-hidden`}>
    <div className={`h-full rounded-full ${color}`} style={{width:`${Math.min(Math.max(parseFloat(pct||0),0),100)}%`}} />
  </div>
);

// ════════════════════════════════════════════════════════════
// SELECTOR DE FILTROS
// ════════════════════════════════════════════════════════════
function FiltrosPanel({ filtros, onChange, mostrarUnidad=true }) {
  return (
    <div className="flex gap-3 flex-wrap mb-5">
      <input type="date" value={filtros.desde} onChange={e=>onChange({...filtros,desde:e.target.value})}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="date" value={filtros.hasta} onChange={e=>onChange({...filtros,hasta:e.target.value})}
        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {mostrarUnidad && (
        <select value={filtros.unidad_id} onChange={e=>onChange({...filtros,unidad_id:e.target.value})}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las unidades</option>
          <option value="1">CI — Comercio e Industria</option>
          <option value="2">PY — Pymes</option>
          <option value="3">OM — Op. y Mantenimiento</option>
        </select>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 1. ESTADO DE RESULTADOS
// ════════════════════════════════════════════════════════════
function EstadoResultados() {
  const hoy = new Date();
  const [filtros, setFiltros] = useState({
    desde:`${hoy.getFullYear()}-01-01`, hasta:hoy.toISOString().split('T')[0], unidad_id:''
  });
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = Object.fromEntries(Object.entries(filtros).filter(([,v])=>v));
      const r = await api.get('/reportes/estado-resultados', { params });
      setData(r.data);
    } finally { setCargando(false); }
  },[filtros]);

  useEffect(()=>{ cargar(); },[cargar]);

  if (cargando) return <div className="p-10 text-center text-gray-400">Calculando...</div>;
  if (!data)    return null;

  const c = data.consolidado;
  const util = parseFloat(c.utilidad_operacion||0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-gray-700">Estado de Resultados</div>
        <button onClick={()=>exportCSV(data.ingresos_por_tipo,'estado_resultados')}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
          📤 Exportar CSV
        </button>
      </div>
      <FiltrosPanel filtros={filtros} onChange={setFiltros} />

      {/* KPIs principales */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Ingresos Totales',   val:fmtMXN(c.total_ingresos),    color:'text-blue-900',  bg:'bg-blue-50' },
          { label:'Costos Directos',    val:fmtMXN(parseFloat(c.costos_directos||0)+parseFloat(c.costo_mano_obra||0)), color:'text-red-700', bg:'bg-red-50' },
          { label:'Utilidad Bruta',     val:fmtMXN(c.utilidad_bruta),    color:'text-green-700', bg:'bg-green-50' },
          { label:'Utilidad Operación', val:fmtMXN(c.utilidad_operacion),color:util>=0?'text-green-700':'text-red-700', bg:util>=0?'bg-green-50':'bg-red-50' },
        ].map(k=>(
          <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla P&L */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Concepto</th>
            <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Importe MXN</th>
            <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">% Ingreso</th>
          </tr></thead>
          <tbody>
            {[
              { label:'INGRESOS TOTALES', val:c.total_ingresos, pct:100, bold:true, bg:'bg-blue-50' },
              { label:'  · Servicios',   val:c.ingresos_servicios, pct:c.total_ingresos>0?parseFloat(c.ingresos_servicios)/parseFloat(c.total_ingresos)*100:0 },
              { label:'  · Suministros', val:c.ingresos_suministros, pct:c.total_ingresos>0?parseFloat(c.ingresos_suministros)/parseFloat(c.total_ingresos)*100:0 },
              { label:'  · Otros',       val:c.ingresos_otros, pct:c.total_ingresos>0?parseFloat(c.ingresos_otros)/parseFloat(c.total_ingresos)*100:0 },
              { label:'COSTOS DIRECTOS', val:-(parseFloat(c.costos_directos||0)+parseFloat(c.costo_mano_obra||0)), pct:c.total_ingresos>0?-(parseFloat(c.costos_directos||0)+parseFloat(c.costo_mano_obra||0))/parseFloat(c.total_ingresos)*100:0, bold:true, bg:'bg-red-50/50' },
              { label:'  · Materiales y Sub.', val:-c.costos_directos, pct:c.total_ingresos>0?-parseFloat(c.costos_directos)/parseFloat(c.total_ingresos)*100:0 },
              { label:'  · Mano de Obra',      val:-c.costo_mano_obra, pct:c.total_ingresos>0?-parseFloat(c.costo_mano_obra)/parseFloat(c.total_ingresos)*100:0 },
              { label:'UTILIDAD BRUTA',  val:c.utilidad_bruta, pct:c.margen_bruto, bold:true, bg:'bg-green-50' },
              { label:'GASTOS OPERACIÓN',val:-c.gastos_operacion, pct:c.total_ingresos>0?-parseFloat(c.gastos_operacion)/parseFloat(c.total_ingresos)*100:0, bold:true, bg:'bg-amber-50/50' },
              { label:'UTILIDAD OPERACIÓN',val:c.utilidad_operacion, pct:c.margen_operacion, bold:true, bg: util>=0?'bg-green-100':'bg-red-100' },
            ].map((row,i)=>(
              <tr key={i} className={`border-b border-gray-50 ${row.bg||''}`}>
                <td className={`px-5 py-2.5 ${row.bold?'font-bold text-gray-900':'text-gray-600'}`}>{row.label}</td>
                <td className={`px-5 py-2.5 text-right font-semibold ${parseFloat(row.val||0)<0?'text-red-600':'text-gray-900'}`}>{fmtMXN(row.val)}</td>
                <td className="px-5 py-2.5 text-right text-gray-500 text-xs">{fmtPct(row.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Por unidad de negocio */}
      {data.por_unidad?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Por Unidad de Negocio</div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['Unidad','Ingresos','Gastos','Utilidad','Margen'].map(h=>(
                <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.por_unidad.map(u=>{
                const margen = parseFloat(u.ingresos)>0?(parseFloat(u.utilidad)/parseFloat(u.ingresos)*100).toFixed(1):0;
                return (
                  <tr key={u.codigo} className="border-b border-gray-50">
                    <td className="px-4 py-3"><Badge texto={u.codigo} color={UNIDAD_COLORS[u.codigo]||'bg-gray-100 text-gray-600'} /></td>
                    <td className="px-4 py-3 font-semibold">{fmtMXN(u.ingresos)}</td>
                    <td className="px-4 py-3 text-red-600">{fmtMXN(u.gastos)}</td>
                    <td className="px-4 py-3"><span className={`font-semibold ${parseFloat(u.utilidad)>=0?'text-green-700':'text-red-600'}`}>{fmtMXN(u.utilidad)}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Bar pct={Math.abs(margen)} color={parseFloat(margen)>=0?'bg-green-500':'bg-red-500'} />
                        <span className={`text-xs font-semibold w-12 ${parseFloat(margen)>=0?'text-green-700':'text-red-600'}`}>{margen}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tendencia mensual */}
      {data.tendencia_mensual?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm font-semibold text-gray-700 mb-3">Tendencia Mensual</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['Periodo','Ingresos','Gastos','Utilidad'].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.tendencia_mensual.map(t=>(
                  <tr key={t.periodo} className="border-b border-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-700">{t.periodo_label||t.periodo}</td>
                    <td className="px-3 py-2 text-blue-700">{fmtMXN(t.ingresos)}</td>
                    <td className="px-3 py-2 text-red-600">{fmtMXN(t.gastos)}</td>
                    <td className="px-3 py-2"><span className={`font-semibold ${parseFloat(t.utilidad)>=0?'text-green-700':'text-red-600'}`}>{fmtMXN(t.utilidad)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 2. RENTABILIDAD POR PROYECTO
// ════════════════════════════════════════════════════════════
function RentabilidadProyectos() {
  const [filtros, setFiltros] = useState({ unidad_id:'', estado:'Activo' });
  const [data, setData]       = useState({ datos:[], totales:{} });
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = Object.fromEntries(Object.entries(filtros).filter(([,v])=>v));
      const r = await api.get('/reportes/rentabilidad-proyectos', { params });
      setData(r.data);
    } finally { setCargando(false); }
  },[filtros]);

  useEffect(()=>{ cargar(); },[cargar]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-gray-700">Rentabilidad por Folio</div>
        <button onClick={()=>exportCSV(data.datos,'rentabilidad_proyectos')}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">📤 CSV</button>
      </div>
      <div className="flex gap-3 mb-5">
        <select value={filtros.estado} onChange={e=>setFiltros(f=>({...f,estado:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          <option value="Activo">Activos</option>
          <option value="Cerrado">Cerrados</option>
          <option value="Cancelado">Cancelados</option>
        </select>
        <select value={filtros.unidad_id} onChange={e=>setFiltros(f=>({...f,unidad_id:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las unidades</option>
          <option value="1">CI</option><option value="2">PY</option><option value="3">OM</option>
        </select>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label:'Ingresos Total', val:fmtMXN(data.totales?.ingresos_total), color:'text-blue-900', bg:'bg-blue-50' },
          { label:'Gastos Total',   val:fmtMXN(data.totales?.gastos_total),   color:'text-red-700',  bg:'bg-red-50'  },
          { label:'Utilidad Total', val:fmtMXN(data.totales?.utilidad_total), color:parseFloat(data.totales?.utilidad_total||0)>=0?'text-green-700':'text-red-700', bg:parseFloat(data.totales?.utilidad_total||0)>=0?'bg-green-50':'bg-red-50' },
        ].map(k=>(
          <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label} ({data.total||0} proyectos)</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-10 text-center text-gray-400 text-sm">Calculando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Folio','Nombre','Unidad','Cliente','Estado','Ingresos','Gastos','Utilidad','Margen %','Ppto Consumido'].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.datos?.map((p,i)=>{
                  const util = parseFloat(p.utilidad_mxn||0);
                  const pct  = parseFloat(p.pct_presupuesto_consumido||0);
                  return (
                    <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/20'}`}>
                      <td className="px-3 py-3 font-mono text-xs font-bold text-blue-900">{p.folio}</td>
                      <td className="px-3 py-3 text-gray-700 max-w-40 truncate">{p.nombre}</td>
                      <td className="px-3 py-3"><Badge texto={p.unidad_codigo} color={UNIDAD_COLORS[p.unidad_codigo]} /></td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-28 truncate">{p.cliente_nombre||'—'}</td>
                      <td className="px-3 py-3">
                        <Badge texto={p.estado} color={p.estado==='Activo'?'bg-green-100 text-green-700':p.estado==='Cerrado'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-600'} />
                      </td>
                      <td className="px-3 py-3 text-green-700 font-semibold">{fmtMXN(p.ingresos_mxn)}</td>
                      <td className="px-3 py-3 text-red-600">{fmtMXN(p.gastos_mxn)}</td>
                      <td className="px-3 py-3"><span className={`font-bold ${util>=0?'text-green-700':'text-red-600'}`}>{fmtMXN(util)}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Bar pct={Math.abs(p.margen_pct)} color={parseFloat(p.margen_pct)>=0?'bg-green-500':'bg-red-500'} />
                          <span className={`text-xs font-semibold w-10 ${parseFloat(p.margen_pct)>=0?'text-green-700':'text-red-600'}`}>{p.margen_pct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Bar pct={pct} color={pct>=100?'bg-red-500':pct>=90?'bg-orange-500':pct>=75?'bg-amber-500':'bg-blue-500'} />
                          <span className={`text-xs font-semibold w-10 ${pct>=100?'text-red-600':pct>=75?'text-amber-600':'text-gray-600'}`}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!data.datos?.length && <tr><td colSpan="10" className="px-4 py-8 text-center text-gray-400 text-sm">Sin proyectos con los filtros seleccionados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 3. FLUJO DE EFECTIVO
// ════════════════════════════════════════════════════════════
function FlujoEfectivo() {
  const hoy = new Date();
  const [filtros, setFiltros] = useState({
    desde:`${hoy.getFullYear()}-01-01`, hasta:hoy.toISOString().split('T')[0], unidad_id:''
  });
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [tab, setTab]  = useState('resumen');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = Object.fromEntries(Object.entries(filtros).filter(([,v])=>v));
      const r = await api.get('/reportes/flujo-efectivo', { params });
      setData(r.data);
    } finally { setCargando(false); }
  },[filtros]);

  useEffect(()=>{ cargar(); },[cargar]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-gray-700">Flujo de Efectivo</div>
        {data && <button onClick={()=>exportCSV([...data.cobros.map(c=>({...c,tipo:'Entrada'})),...data.pagos.map(p=>({...p,tipo:'Salida'}))], 'flujo_efectivo')}
          className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">📤 CSV</button>}
      </div>
      <FiltrosPanel filtros={filtros} onChange={setFiltros} />

      {cargando ? <div className="p-10 text-center text-gray-400">Calculando...</div> : data && (
        <>
          {/* Totales */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            {[
              { label:'Entradas (Cobros)',  val:fmtMXN(data.resumen_totales.entradas_mxn), color:'text-green-700',bg:'bg-green-50' },
              { label:'Salidas (Pagos)',    val:fmtMXN(data.resumen_totales.salidas_mxn),  color:'text-red-700',  bg:'bg-red-50'   },
              { label:'Flujo Neto',         val:fmtMXN(data.resumen_totales.neto_mxn),
                color:parseFloat(data.resumen_totales.neto_mxn)>=0?'text-blue-900':'text-red-700',
                bg:parseFloat(data.resumen_totales.neto_mxn)>=0?'bg-blue-50':'bg-red-50' },
            ].map(k=>(
              <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
                <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              </div>
            ))}
          </div>

          {/* Por moneda */}
          {data.por_moneda?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Por Moneda</div>
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Moneda','Entradas','Salidas','Flujo Neto'].map(h=>(
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.por_moneda.map(m=>(
                    <tr key={m.moneda} className="border-b border-gray-50">
                      <td className="px-4 py-3"><Badge texto={m.moneda} color={m.moneda==='MXN'?'bg-blue-50 text-blue-700':'bg-purple-50 text-purple-700'} /></td>
                      <td className="px-4 py-3 text-green-700 font-semibold">{fmtMXN(m.entradas)}</td>
                      <td className="px-4 py-3 text-red-600">{fmtMXN(m.salidas)}</td>
                      <td className="px-4 py-3"><span className={`font-semibold ${parseFloat(m.neto)>=0?'text-green-700':'text-red-600'}`}>{fmtMXN(m.neto)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Flujo mensual */}
          {data.flujo_mensual?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">Flujo Mensual MXN</div>
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {['Mes','Entradas','Salidas','Neto'].map(h=>(
                    <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {data.flujo_mensual.map(m=>(
                    <tr key={m.periodo} className="border-b border-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-700">{m.periodo}</td>
                      <td className="px-4 py-2 text-green-700">{fmtMXN(m.entradas_mxn)}</td>
                      <td className="px-4 py-2 text-red-600">{fmtMXN(m.salidas_mxn)}</td>
                      <td className="px-4 py-2"><span className={`font-semibold ${parseFloat(m.neto_mxn)>=0?'text-green-700':'text-red-600'}`}>{fmtMXN(m.neto_mxn)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tabs cobros / pagos */}
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            {[['resumen','Cobros'],['pagos','Pagos']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab===k?'border-blue-900 text-blue-900':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {l} ({(k==='resumen'?data.cobros:data.pagos)?.length||0})
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  {tab==='resumen'
                    ? ['Fecha','Folio Ingreso','Concepto','Cliente','Forma Pago','Moneda','Monto','Equiv. MXN','Banco/Cartera'].map(h=>(<th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>))
                    : ['Fecha','Folio Gasto','Concepto','Proveedor','Forma Pago','Moneda','Monto','Equiv. MXN','Banco/Cartera'].map(h=>(<th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>))
                  }
                </tr></thead>
                <tbody>
                  {(tab==='resumen'?data.cobros:data.pagos)?.map((r,i)=>(
                    <tr key={i} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/20'}`}>
                      <td className="px-3 py-2 text-xs text-gray-500">{fmtDate(r.fecha)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.folio_interno}</td>
                      <td className="px-3 py-2 text-xs text-gray-700 max-w-32 truncate">{r.concepto}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.cliente_nombre||r.proveedor_nombre||'—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.forma_pago||'—'}</td>
                      <td className="px-3 py-2"><Badge texto={r.moneda} color={r.moneda==='MXN'?'bg-blue-50 text-blue-700':'bg-purple-50 text-purple-700'} /></td>
                      <td className="px-3 py-2 font-semibold">{fmtMXN(r.monto)}</td>
                      <td className="px-3 py-2 font-semibold">{fmtMXN(r.monto_mxn)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.nombre_cuenta||r.cartera_nombre||'—'}</td>
                    </tr>
                  ))}
                  {!(tab==='resumen'?data.cobros:data.pagos)?.length && (
                    <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400 text-sm">Sin registros en el periodo</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 4. CUENTAS POR COBRAR Y PAGAR
// ════════════════════════════════════════════════════════════
function CuentasCobrarPagar() {
  const [data,  setData]  = useState({ cobrar:null, pagar:null });
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState('cobrar');

  useEffect(()=>{
    Promise.all([
      api.get('/reportes/cuentas-por-cobrar'),
      api.get('/reportes/cuentas-por-pagar'),
    ]).then(([cRes, pRes])=>{
      setData({ cobrar: cRes.data, pagar: pRes.data });
    }).finally(()=>setCargando(false));
  },[]);

  if (cargando) return <div className="p-10 text-center text-gray-400">Calculando...</div>;

  const { cobrar, pagar } = data;
  const antRes = cobrar?.antigüedad_resumen;

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        <button onClick={()=>setTab('cobrar')} className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab==='cobrar'?'border-blue-900 text-blue-900':'border-transparent text-gray-500'}`}>
          Por Cobrar {cobrar?.datos?.length?`(${cobrar.datos.length})`:''}
        </button>
        <button onClick={()=>setTab('pagar')} className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab==='pagar'?'border-blue-900 text-blue-900':'border-transparent text-gray-500'}`}>
          Por Pagar {pagar?.datos?.length?`(${pagar.datos.length})`:''}
        </button>
      </div>

      {tab==='cobrar' && cobrar && (
        <>
          {/* Antigüedad */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label:'Corriente (≤30d)',  val:antRes?.corriente,   color:'text-green-700', bg:'bg-green-50' },
              { label:'31-60 días',        val:antRes?.dias_31_60,  color:'text-amber-700', bg:'bg-amber-50' },
              { label:'61-90 días',        val:antRes?.dias_61_90,  color:'text-orange-700',bg:'bg-orange-50'},
              { label:'Más de 90 días',    val:antRes?.mas_90,      color:'text-red-700',   bg:'bg-red-50'   },
            ].map(k=>(
              <div key={k.label} className={`${k.bg} rounded-xl p-3`}>
                <div className={`text-lg font-bold ${k.color}`}>{fmtMXN(k.val?.monto)}</div>
                <div className="text-xs text-gray-500">{k.label}</div>
                <div className="text-xs text-gray-400">{k.val?.count} documentos</div>
              </div>
            ))}
          </div>
          <div className="mb-3 text-sm font-semibold text-blue-900">Total por cobrar: {fmtMXN(cobrar.total_pendiente_mxn)}</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Folio','Fecha','Concepto','Cliente','Proyecto','Total','Cobrado','Pendiente','Días','Estado'].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {cobrar.datos?.map((r,i)=>(
                  <tr key={r.id} className={`border-b border-gray-50 ${r['dias_antigüedad']>90?'bg-red-50/20':r['dias_antigüedad']>60?'bg-orange-50/20':''}`}>
                    <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.folio_interno}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(r.fecha)}</td>
                    <td className="px-3 py-2 text-xs text-gray-700 max-w-32 truncate">{r.concepto}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-28 truncate">{r.cliente_nombre||'—'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-blue-700">{r.proyecto_folio||'—'}</td>
                    <td className="px-3 py-2">{fmtMXN(r.total_mxn)}</td>
                    <td className="px-3 py-2 text-green-700">{fmtMXN(parseFloat(r.total_mxn)-parseFloat(r.pendiente_mxn))}</td>
                    <td className="px-3 py-2 font-semibold text-amber-600">{fmtMXN(r.pendiente_mxn)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-semibold ${r['dias_antigüedad']>90?'text-red-600':r['dias_antigüedad']>60?'text-orange-600':r['dias_antigüedad']>30?'text-amber-600':'text-gray-500'}`}>
                        {r['dias_antigüedad']}d
                      </span>
                    </td>
                    <td className="px-3 py-2"><Badge texto={r.estado_cobro} color={r.estado_cobro==='Cobro Parcial'?'bg-blue-100 text-blue-700':'bg-amber-100 text-amber-700'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab==='pagar' && pagar && (
        <>
          <div className="mb-3 text-sm font-semibold text-red-700">Total por pagar: {fmtMXN(pagar.total_pendiente_mxn)}</div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Folio','Fecha','Concepto','Proveedor','Categoría','Comprobante','Total','Pendiente','Días'].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {pagar.datos?.map((r,i)=>(
                  <tr key={r.id} className={`border-b border-gray-50 ${r['dias_antigüedad']>90?'bg-red-50/20':''}`}>
                    <td className="px-3 py-2 font-mono text-xs text-blue-700">{r.folio_interno}</td>
                    <td className="px-3 py-2 text-xs">{fmtDate(r.fecha)}</td>
                    <td className="px-3 py-2 text-xs text-gray-700 max-w-32 truncate">{r.concepto}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 max-w-28 truncate">{r.proveedor_nombre||'—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.categoria}</td>
                    <td className="px-3 py-2"><Badge texto={r.comprobante_tipo} color={r.comprobante_tipo==='Factura'?'bg-green-100 text-green-700':'bg-gray-100 text-gray-600'} /></td>
                    <td className="px-3 py-2">{fmtMXN(r.total_mxn)}</td>
                    <td className="px-3 py-2 font-semibold text-red-600">{fmtMXN(r.pendiente_mxn)}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-semibold ${r['dias_antigüedad']>90?'text-red-600':r['dias_antigüedad']>30?'text-amber-600':'text-gray-500'}`}>{r['dias_antigüedad']}d</span></td>
                  </tr>
                ))}
                {!pagar.datos?.length && <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-400 text-sm">Sin cuentas pendientes de pago</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// HUB PRINCIPAL DE REPORTES
// ════════════════════════════════════════════════════════════
const REPORTES = [
  { key:'er',    label:'Estado de Resultados',    icon:'📊', desc:'Ingresos, costos y utilidades por periodo' },
  { key:'proy',  label:'Rentabilidad Proyectos',  icon:'📁', desc:'Utilidad y margen por folio de proyecto' },
  { key:'flujo', label:'Flujo de Efectivo',       icon:'💧', desc:'Cobros y pagos reales por periodo y moneda' },
  { key:'cxc',   label:'Cuentas por Cobrar/Pagar',icon:'⚖️', desc:'Antigüedad de cartera y proveedores pendientes' },
];

export default function ReportesHub() {
  const [activo, setActivo] = useState('er');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-blue-900">Reportes Financieros</h1>
      </div>

      {/* Selector de reporte */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {REPORTES.map(r=>(
          <div key={r.key} onClick={()=>setActivo(r.key)}
            className={`rounded-xl p-4 cursor-pointer border-2 transition ${activo===r.key?'border-blue-900 bg-blue-50':'border-gray-200 bg-white hover:border-gray-300'}`}>
            <div className="text-2xl mb-2">{r.icon}</div>
            <div className={`text-sm font-semibold ${activo===r.key?'text-blue-900':'text-gray-700'}`}>{r.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Contenido del reporte seleccionado */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activo==='er'    && <EstadoResultados />}
        {activo==='proy'  && <RentabilidadProyectos />}
        {activo==='flujo' && <FlujoEfectivo />}
        {activo==='cxc'   && <CuentasCobrarPagar />}
      </div>
    </div>
  );
}
