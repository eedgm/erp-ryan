import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const ESTADO_STYLES = {
  Activo:    { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  Pausado:   { bg: 'bg-amber-100',  text: 'text-amber-800',  dot: 'bg-amber-500' },
  Cerrado:   { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500' },
  Cancelado: { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
};
const UNIDAD_STYLES = {
  CI: 'bg-blue-100 text-blue-800',
  PY: 'bg-green-100 text-green-800',
  OM: 'bg-orange-100 text-orange-800',
};
const MONEDA_ICONS = { MXN:'$', USD:'$', USDT:'₮', USDC:'$c', BTC:'₿', ETH:'Ξ' };

const fmtNum = (v, dec=2) => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:dec,maximumFractionDigits:dec});
const fmtMXN = v => `$${fmtNum(v)}`;

const Badge = ({ texto, style }) => (
  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${style?.bg} ${style?.text}`}>
    {style?.dot && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
    {texto}
  </span>
);

const PctBar = ({ pct, semaforo }) => {
  const colors = {
    ok:              'bg-blue-500',
    alerta:          'bg-amber-500',
    critico:         'bg-orange-500',
    excedido:        'bg-red-600',
    sin_presupuesto: 'bg-gray-300',
  };
  const pctClamped = Math.min(parseFloat(pct||0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colors[semaforo] || 'bg-blue-500'}`}
          style={{ width: `${pctClamped}%` }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right ${
        semaforo === 'excedido' ? 'text-red-600' :
        semaforo === 'critico'  ? 'text-orange-500' :
        semaforo === 'alerta'   ? 'text-amber-600' : 'text-gray-600'
      }`}>{pct}%</span>
    </div>
  );
};

export default function ProyectosLista() {
  const navigate = useNavigate();
  const [proyectos, setProyectos] = useState([]);
  const [total, setTotal] = useState(0);
  const [dashboard, setDashboard] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ search:'', estado:'', unidad_id:'', page:1 });
  const [unidades, setUnidades] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = { ...filtros, limit: 25 };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const [proyRes, dashRes, unRes] = await Promise.all([
        api.get('/proyectos', { params }),
        api.get('/proyectos/dashboard'),
        api.get('/unidades'),
      ]);
      setProyectos(proyRes.data.datos);
      setTotal(proyRes.data.total);
      setDashboard(dashRes.data);
      setUnidades(unRes.data.datos);
    } catch (err) {
      console.error('Error cargando proyectos:', err);
    } finally {
      setCargando(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const setFiltro = (k, v) => setFiltros(f => ({ ...f, [k]: v, page: 1 }));

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Folios de Proyectos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} proyectos registrados</p>
        </div>
        <button
          onClick={() => navigate('/proyectos/nuevo')}
          className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
          + Nuevo Folio
        </button>
      </div>

      {/* KPI Cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label:'Activos',   val: dashboard.kpis?.activos   || 0, color:'text-green-700',  bg:'bg-green-50'  },
            { label:'Pausados',  val: dashboard.kpis?.pausados  || 0, color:'text-amber-700',  bg:'bg-amber-50'  },
            { label:'Cerrados',  val: dashboard.kpis?.cerrados  || 0, color:'text-purple-700', bg:'bg-purple-50' },
            { label:'Cancelados',val: dashboard.kpis?.cancelados|| 0, color:'text-red-700',    bg:'bg-red-50'    },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl p-4 border border-white`}>
              <div className={`text-2xl font-bold ${k.color}`}>{k.val}</div>
              <div className="text-xs font-medium text-gray-500 mt-1">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Alertas de presupuesto */}
      {dashboard?.alertas_presupuesto?.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
            ⚠ Proyectos con presupuesto al 75% o más
          </div>
          <div className="flex flex-wrap gap-2">
            {dashboard.alertas_presupuesto.map(a => (
              <button key={a.id} onClick={() => navigate(`/proyectos/${a.id}`)}
                className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs hover:bg-amber-50 transition">
                <span className="font-bold text-blue-900">{a.folio}</span>
                <span className="text-gray-500">{a.nombre?.substring(0,24)}</span>
                <span className={`font-bold ${parseFloat(a.pct)>=100?'text-red-600':'text-orange-600'}`}>{a.pct}%</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text" placeholder="Buscar folio, nombre o cliente..."
          value={filtros.search}
          onChange={e => setFiltro('search', e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={filtros.estado} onChange={e => setFiltro('estado', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          {['Activo','Pausado','Cerrado','Cancelado'].map(e => <option key={e}>{e}</option>)}
        </select>
        <select value={filtros.unidad_id} onChange={e => setFiltro('unidad_id', e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las unidades</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando proyectos...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Folio','Proyecto / Cliente','Unidad','Moneda','Presupuesto Global',
                    'Consumido','Margen','Estado','Avance'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proyectos.map((p, i) => {
                  const pctConsumo = parseFloat(p.pct_presupuesto_consumido || 0);
                  const semaforo = pctConsumo >= 100 ? 'excedido' : pctConsumo >= 90 ? 'critico' : pctConsumo >= 75 ? 'alerta' : 'ok';
                  const margenMxn = parseFloat(p.total_ingresos_mxn||0) - parseFloat(p.total_gastos_mxn||0);

                  return (
                    <tr key={p.id}
                      onClick={() => navigate(`/proyectos/${p.id}`)}
                      className={`border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold text-blue-900">{p.folio}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 max-w-44 truncate">{p.nombre}</div>
                        {p.cliente_nombre && <div className="text-xs text-gray-400 truncate max-w-44">{p.cliente_nombre}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${UNIDAD_STYLES[p.unidad_codigo]||'bg-gray-100 text-gray-600'}`}>
                          {p.unidad_codigo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm">{MONEDA_ICONS[p.moneda] || ''} {p.moneda}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{fmtMXN(p.presupuesto_global_mxn)}</td>
                      <td className="px-4 py-3 w-40">
                        <PctBar pct={pctConsumo} semaforo={semaforo} />
                        <div className="text-xs text-gray-400 mt-0.5">{fmtMXN(p.presupuesto_consumido)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold text-sm ${margenMxn >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {margenMxn >= 0 ? '+' : ''}{fmtMXN(margenMxn)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge texto={p.estado} style={ESTADO_STYLES[p.estado]} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-16 overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${p.avance_porcentaje||0}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{p.avance_porcentaje||0}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!proyectos.length && (
                  <tr><td colSpan="9" className="px-4 py-10 text-center text-gray-400 text-sm">
                    No se encontraron proyectos
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
