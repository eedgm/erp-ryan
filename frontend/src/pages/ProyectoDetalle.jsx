import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtPct = v => `${parseFloat(v||0).toFixed(1)}%`;

const SEMAFORO_COLORS = {
  ok:              { bar:'bg-blue-500',   badge:'bg-blue-100 text-blue-800',   label:'En control' },
  alerta:          { bar:'bg-amber-500',  badge:'bg-amber-100 text-amber-800',  label:'En alerta (75%+)' },
  critico:         { bar:'bg-orange-500', badge:'bg-orange-100 text-orange-800',label:'Crítico (90%+)' },
  excedido:        { bar:'bg-red-600',    badge:'bg-red-100 text-red-700',      label:'Excedido' },
  sin_presupuesto: { bar:'bg-gray-300',   badge:'bg-gray-100 text-gray-500',    label:'Sin presupuesto' },
};

const ESTADO_COLORS = {
  Activo:    'bg-green-100 text-green-800',
  Pausado:   'bg-amber-100 text-amber-800',
  Cerrado:   'bg-purple-100 text-purple-800',
  Cancelado: 'bg-red-100 text-red-700',
};

export default function ProyectoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modalEstado, setModalEstado] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [motivoEstado, setMotivoEstado] = useState('');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [tab, setTab] = useState('resumen');

  useEffect(() => { cargar(); }, [id]);

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await api.get(`/proyectos/${id}`);
      setProyecto(res.data.datos);
    } catch { navigate('/proyectos'); }
    finally { setCargando(false); }
  };

  const cambiarEstado = async () => {
    setCambiandoEstado(true);
    try {
      await api.patch(`/proyectos/${id}/estado`, { estado: nuevoEstado, motivo: motivoEstado });
      setModalEstado(false);
      setMotivoEstado('');
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'Error cambiando estado');
    } finally { setCambiandoEstado(false); }
  };

  if (cargando) return <div className="p-12 text-center text-gray-400">Cargando proyecto...</div>;
  if (!proyecto) return null;

  const { familias = [], ultimos_movimientos = [], estados_log = [] } = proyecto;
  const margen = parseFloat(proyecto.total_ingresos_mxn||0) - parseFloat(proyecto.total_gastos_mxn||0);
  const margenPct = parseFloat(proyecto.total_ingresos_mxn||0) > 0
    ? (margen / parseFloat(proyecto.total_ingresos_mxn) * 100).toFixed(1)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => navigate('/proyectos')} className="text-gray-400 hover:text-gray-700 text-sm">← Proyectos</button>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm font-bold text-blue-900">{proyecto.folio}</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{proyecto.nombre}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLORS[proyecto.estado]}`}>{proyecto.estado}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              proyecto.unidad_codigo==='CI'?'bg-blue-100 text-blue-800':
              proyecto.unidad_codigo==='PY'?'bg-green-100 text-green-800':'bg-orange-100 text-orange-800'
            }`}>{proyecto.unidad_codigo}</span>
            <span className="text-xs text-gray-400">{proyecto.tipo}</span>
            {proyecto.cliente_nombre && <span className="text-xs text-gray-500">· {proyecto.cliente_nombre}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setNuevoEstado(proyecto.estado); setModalEstado(true); }}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cambiar Estado
          </button>
          <button onClick={() => navigate(`/proyectos/${id}/editar`)}
            className="px-3 py-2 text-sm bg-blue-900 text-white rounded-lg hover:bg-blue-800">
            Editar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label:'Presupuesto Global', val: fmtMXN(proyecto.presupuesto_global_mxn), sub: `${proyecto.moneda} · TC ${proyecto.tipo_cambio_inicial}` },
          { label:'Ingresos Totales',   val: fmtMXN(proyecto.total_ingresos_mxn), sub: `Por cobrar: ${fmtMXN(proyecto.por_cobrar_mxn)}`, color:'text-green-700' },
          { label:'Gastos Totales',     val: fmtMXN(proyecto.total_gastos_mxn), sub: `Pendiente pago: ${fmtMXN(proyecto.gastos_pendientes_mxn)}`, color:'text-red-600' },
          { label:'Margen',             val: fmtMXN(margen), sub: `${margenPct}% del ingreso`, color: margen>=0?'text-green-700':'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">{k.label}</div>
            <div className={`text-lg font-bold ${k.color||'text-gray-900'}`}>{k.val}</div>
            <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[['resumen','Presupuesto'],['movimientos','Movimientos'],['log','Historial']].map(([key,lbl]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab===key ? 'border-blue-900 text-blue-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{lbl}</button>
        ))}
      </div>

      {/* Tab: Presupuesto por familias */}
      {tab === 'resumen' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Presupuesto por Familias</h2>
            <div className="text-xs text-gray-500">Avance de obra: <strong>{proyecto.avance_porcentaje}%</strong></div>
          </div>

          {/* Barra global */}
          <div className="mb-6 bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Consumido global</span>
              <span className="font-semibold">{fmtMXN(proyecto.presupuesto_consumido)} / {fmtMXN(proyecto.presupuesto_global_mxn)}</span>
            </div>
            <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${
                parseFloat(proyecto.pct_presupuesto_consumido)>=100?'bg-red-500':
                parseFloat(proyecto.pct_presupuesto_consumido)>=90?'bg-orange-500':
                parseFloat(proyecto.pct_presupuesto_consumido)>=75?'bg-amber-500':'bg-blue-500'
              }`} style={{ width:`${Math.min(parseFloat(proyecto.pct_presupuesto_consumido||0),100)}%` }} />
            </div>
            <div className="text-right text-xs font-bold mt-1 text-gray-600">{fmtPct(proyecto.pct_presupuesto_consumido)}</div>
          </div>

          {/* Familias individuales */}
          <div className="space-y-4">
            {familias.map(f => {
              const s = SEMAFORO_COLORS[f.semaforo] || SEMAFORO_COLORS.ok;
              return (
                <div key={f.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{f.nombre_familia}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>{s.label}</span>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div className="font-semibold text-sm text-gray-900">{fmtMXN(f.consumido)} <span className="font-normal text-gray-400">/ {fmtMXN(f.presupuesto)}</span></div>
                      <div>Disponible: <span className={parseFloat(f.disponible)<0?'text-red-600 font-bold':'text-green-600'}>{fmtMXN(f.disponible)}</span></div>
                    </div>
                  </div>
                  <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className={`h-full rounded-full ${s.bar}`}
                      style={{ width:`${Math.min(parseFloat(f.pct_consumido||0),100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Consumido: {fmtPct(f.pct_consumido)}</span>
                    {parseFloat(f.reservado)>0 && <span>Reservado (OC): {fmtMXN(f.reservado)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Últimos movimientos */}
      {tab === 'movimientos' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Tipo','Fecha','Folio','Concepto','Monto MXN','Estado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ultimos_movimientos.map((m, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${m.tipo==='ingreso'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                      {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Gasto'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{m.fecha}</td>
                  <td className="px-4 py-3 font-mono text-xs text-blue-700">{m.folio}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{m.concepto}</td>
                  <td className="px-4 py-3 font-semibold">{fmtMXN(m.monto_mxn)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">{m.estado}</span>
                  </td>
                </tr>
              ))}
              {!ultimos_movimientos.length && (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-400 text-sm">Sin movimientos registrados</td></tr>
              )}
            </tbody>
          </table>
          <div className="p-4 flex gap-3">
            <button className="text-sm text-blue-600 font-medium hover:text-blue-800">+ Registrar Ingreso</button>
            <span className="text-gray-300">|</span>
            <button className="text-sm text-blue-600 font-medium hover:text-blue-800">+ Registrar Gasto</button>
          </div>
        </div>
      )}

      {/* Tab: Historial de estados */}
      {tab === 'log' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="space-y-3">
            {estados_log.map((log, i) => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                <div>
                  <div className="text-sm">
                    <span className="font-medium text-gray-800">{log.estado_nuevo}</span>
                    {log.estado_antes && <span className="text-gray-400"> ← {log.estado_antes}</span>}
                    <span className="text-gray-400 text-xs ml-2">· {log.usuario_nombre}</span>
                  </div>
                  {log.motivo && <div className="text-xs text-gray-500 mt-0.5">{log.motivo}</div>}
                  <div className="text-xs text-gray-400">{new Date(log.creado_en).toLocaleString('es-MX')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal cambiar estado */}
      {modalEstado && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target===e.currentTarget && setModalEstado(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-4">Cambiar Estado del Proyecto</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nuevo Estado</label>
                <select value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {['Activo','Pausado','Cerrado','Cancelado'].map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motivo (opcional)</label>
                <textarea value={motivoEstado} onChange={e => setMotivoEstado(e.target.value)} rows={2}
                  placeholder="Razón del cambio de estado..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setModalEstado(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={cambiarEstado} disabled={cambiandoEstado || nuevoEstado === proyecto.estado}
                className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
                {cambiandoEstado ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
