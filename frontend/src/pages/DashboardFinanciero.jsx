import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtPct = v => `${parseFloat(v||0).toFixed(1)}%`;

const UNIDAD_COLORS = {
  CI: { bg:'bg-blue-100',   text:'text-blue-800',   bar:'bg-blue-500'   },
  PY: { bg:'bg-green-100',  text:'text-green-800',  bar:'bg-green-500'  },
  OM: { bg:'bg-orange-100', text:'text-orange-800', bar:'bg-orange-500' },
};

const KPICard = ({ label, valor, sub, color='text-blue-900', bg='bg-white', onClick }) => (
  <div onClick={onClick}
    className={`${bg} rounded-xl border border-gray-200 p-5 ${onClick?'cursor-pointer hover:shadow-md transition':''}`}>
    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{valor}</div>
    {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
  </div>
);

export default function DashboardFinanciero() {
  const navigate = useNavigate();
  const [data,     setData]     = useState(null);
  const [cargando, setCargando] = useState(true);
  const [unidad,   setUnidad]   = useState('');
  const [periodo,  setPeriodo]  = useState('mes'); // mes | anio

  useEffect(() => { cargar(); }, [unidad]);

  const cargar = async () => {
    setCargando(true);
    try {
      const params = {};
      if (unidad) params.unidad_id = unidad;
      const r = await api.get('/reportes/dashboard-financiero', { params });
      setData(r.data);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
    } finally {
      setCargando(false);
    }
  };

  const d = data;
  const p = periodo === 'mes' ? d?.mes : d?.anio;

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Dashboard Financiero</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={unidad} onChange={e=>setUnidad(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Empresa completa</option>
            <option value="1">CI — Comercio e Industria</option>
            <option value="2">PY — Pymes</option>
            <option value="3">OM — Op. y Mantenimiento</option>
          </select>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {[['mes','Este mes'],['anio','Este año']].map(([k,l])=>(
              <button key={k} onClick={()=>setPeriodo(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${periodo===k?'bg-white text-blue-900 shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={cargar} className="text-gray-400 hover:text-gray-700 text-lg" title="Actualizar">↻</button>
        </div>
      </div>

      {cargando ? (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1,2,3,4].map(i=>(
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-8 bg-gray-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : d && (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <KPICard
              label={`Ingresos (${periodo==='mes'?'mes':'año'})`}
              valor={fmtMXN(p?.ingresos)}
              sub={periodo==='mes' ? `Cobrado: ${fmtMXN(p?.cobrado)}` : undefined}
              color="text-blue-900" bg="bg-blue-50"
              onClick={()=>navigate('/reportes')}
            />
            <KPICard
              label={`Gastos (${periodo==='mes'?'mes':'año'})`}
              valor={fmtMXN(p?.gastos)}
              sub={periodo==='mes' ? `Pagado: ${fmtMXN(p?.pagado)}` : undefined}
              color="text-red-700" bg="bg-red-50"
              onClick={()=>navigate('/gastos')}
            />
            <KPICard
              label="Utilidad"
              valor={fmtMXN(p?.utilidad)}
              sub={d?.anio?.margen ? `Margen: ${fmtPct(d.anio.margen)}` : undefined}
              color={parseFloat(p?.utilidad||0)>=0?'text-green-700':'text-red-700'}
              bg={parseFloat(p?.utilidad||0)>=0?'bg-green-50':'bg-red-50'}
            />
            <KPICard
              label="IVA Neto (mes)"
              valor={fmtMXN(Math.abs(d?.iva_mes?.iva_neto||0))}
              sub={parseFloat(d?.iva_mes?.iva_neto||0)>0 ? '⬆ A pagar' : parseFloat(d?.iva_mes?.iva_neto||0)<0 ? '⬇ A favor' : 'Sin movimiento'}
              color={parseFloat(d?.iva_mes?.iva_neto||0)>0?'text-orange-700':parseFloat(d?.iva_mes?.iva_neto||0)<0?'text-teal-700':'text-gray-500'}
              bg={parseFloat(d?.iva_mes?.iva_neto||0)>0?'bg-orange-50':parseFloat(d?.iva_mes?.iva_neto||0)<0?'bg-teal-50':'bg-gray-50'}
              onClick={()=>navigate('/iva')}
            />
          </div>

          <div className="grid grid-cols-3 gap-5 mb-5">

            {/* Top proyectos por utilidad */}
            <div className="col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-semibold text-sm text-gray-700">Top Proyectos — Utilidad</span>
                <button onClick={()=>navigate('/reportes')} className="text-xs text-blue-600 font-medium hover:text-blue-800">Ver todos →</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Folio','Nombre','Unidad','Ingresos','Gastos','Utilidad'].map(h=>(
                        <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(d.top_proyectos||[]).map((p,i)=>{
                      const uc = UNIDAD_COLORS[p.unidad] || UNIDAD_COLORS.CI;
                      const util = parseFloat(p.utilidad||0);
                      const ing  = parseFloat(p.ingresos||0);
                      const pct  = ing > 0 ? Math.round(util/ing*100) : 0;
                      return (
                        <tr key={p.folio} onClick={()=>navigate(`/proyectos`)}
                          className={`border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer ${i%2===0?'':'bg-gray-50/20'}`}>
                          <td className="px-4 py-3 font-mono text-xs font-bold text-blue-900">{p.folio}</td>
                          <td className="px-4 py-3 text-gray-700 max-w-36 truncate text-xs">{p.nombre}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${uc.bg} ${uc.text}`}>{p.unidad}</span>
                          </td>
                          <td className="px-4 py-3 text-green-700 font-medium">{fmtMXN(p.ingresos)}</td>
                          <td className="px-4 py-3 text-red-600">{fmtMXN(p.gastos)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold text-sm ${util>=0?'text-green-700':'text-red-600'}`}>{fmtMXN(util)}</span>
                              <span className={`text-xs ${util>=0?'text-green-600':'text-red-500'}`}>({pct}%)</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!d.top_proyectos?.length && (
                      <tr><td colSpan="6" className="px-4 py-6 text-center text-gray-400 text-xs">Sin proyectos activos con movimientos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Panel de IVA del mes */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <span className="font-semibold text-sm text-gray-700">IVA del Mes</span>
                <button onClick={()=>navigate('/iva')} className="text-xs text-blue-600 font-medium hover:text-blue-800">Ver →</button>
              </div>
              <div className="p-5 space-y-4">
                {[
                  { label:'IVA Trasladado',  val: d.iva_mes?.iva_trasladado||0, color:'text-orange-600', icon:'↑' },
                  { label:'IVA Acreditable', val: d.iva_mes?.iva_acreditable||0,color:'text-teal-600',   icon:'↓' },
                ].map(k=>(
                  <div key={k.label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{k.icon} {k.label}</span>
                      <span className={`font-semibold ${k.color}`}>{fmtMXN(k.val)}</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${k.color.replace('text','bg')}`}
                        style={{width:`${Math.min(
                          (parseFloat(k.val)/(Math.max(parseFloat(d.iva_mes?.iva_trasladado||1),1)))*100, 100
                        )}%`}} />
                    </div>
                  </div>
                ))}

                <div className="border-t border-gray-100 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-700">IVA Neto</span>
                    <span className={`text-lg font-bold ${parseFloat(d.iva_mes?.iva_neto||0)>0?'text-red-700':parseFloat(d.iva_mes?.iva_neto||0)<0?'text-teal-700':'text-gray-500'}`}>
                      {fmtMXN(d.iva_mes?.iva_neto||0)}
                    </span>
                  </div>
                  <div className={`text-xs mt-1 font-medium ${parseFloat(d.iva_mes?.iva_neto||0)>0?'text-red-600':parseFloat(d.iva_mes?.iva_neto||0)<0?'text-teal-600':'text-gray-400'}`}>
                    {parseFloat(d.iva_mes?.iva_neto||0)>0 ? '⬆ Saldo a pagar al SAT' : parseFloat(d.iva_mes?.iva_neto||0)<0 ? '⬇ Saldo a favor' : 'Sin movimiento este mes'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Accesos rápidos */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label:'Nuevo Ingreso',    icon:'💰', path:'/ingresos/nuevo',   color:'bg-green-50 border-green-200 text-green-800' },
              { label:'Nuevo Gasto',      icon:'📋', path:'/gastos/nuevo',     color:'bg-red-50 border-red-200 text-red-800' },
              { label:'Nueva OC',         icon:'🛒', path:'/ordenes-compra/nueva', color:'bg-blue-50 border-blue-200 text-blue-800' },
              { label:'Nuevo Folio',      icon:'📁', path:'/proyectos/nuevo',  color:'bg-purple-50 border-purple-200 text-purple-800' },
            ].map(a=>(
              <button key={a.label} onClick={()=>navigate(a.path)}
                className={`flex items-center gap-3 p-4 rounded-xl border text-left font-semibold text-sm transition hover:shadow-sm ${a.color}`}>
                <span className="text-xl">{a.icon}</span>
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
