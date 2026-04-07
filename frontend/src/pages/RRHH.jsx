import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN  = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtDate = v => v ? new Date(v+'T12:00:00').toLocaleDateString('es-MX') : '—';
const UNIDAD_COLORS = { CI:'bg-blue-100 text-blue-800', PY:'bg-green-100 text-green-800', OM:'bg-orange-100 text-orange-800' };
const ESTADO_NOMINA = {
  Borrador:   'bg-gray-100 text-gray-600',
  Calculada:  'bg-blue-100 text-blue-700',
  Autorizada: 'bg-green-100 text-green-700',
  Pagada:     'bg-purple-100 text-purple-700',
  Cancelada:  'bg-red-100 text-red-700',
};
const FORMAS_PAGO = ['Transferencia','Efectivo','Cheque','USDT','USDC','BTC','ETH'];

const Badge = ({texto,color}) => <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color||'bg-gray-100 text-gray-600'}`}>{texto}</span>;

// ════════════════════════════════════════════════════════════
// EMPLEADOS — LISTA
// ════════════════════════════════════════════════════════════
export function EmpleadosLista() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [cargando,  setCargando]  = useState(true);
  const [filtros,   setFiltros]   = useState({ search:'', unidad_id:'', activo:'true' });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = {...filtros, limit:50};
      Object.keys(params).forEach(k=>!params[k]&&delete params[k]);
      const r = await api.get('/rrhh/empleados', {params});
      setEmpleados(r.data.datos); setTotal(r.data.total);
    } finally { setCargando(false); }
  },[filtros]);

  useEffect(()=>{ cargar(); },[cargar]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Empleados</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} registros</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>navigate('/rrhh/asistencias')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">📥 Asistencias</button>
          <button onClick={()=>navigate('/rrhh/nomina')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">💰 Nómina</button>
          <button onClick={()=>navigate('/rrhh/empleados/nuevo')}
            className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Empleado</button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Buscar nombre, puesto, número..."
          value={filtros.search} onChange={e=>setFiltros(f=>({...f,search:e.target.value}))}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={filtros.unidad_id} onChange={e=>setFiltros(f=>({...f,unidad_id:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las unidades</option>
          <option value="1">CI</option><option value="2">PY</option><option value="3">OM</option>
        </select>
        <select value={filtros.activo} onChange={e=>setFiltros(f=>({...f,activo:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="true">Activos</option>
          <option value="false">Bajas</option>
          <option value="">Todos</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-10 text-center text-gray-400 text-sm">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['#','Nombre','Puesto','Unidad','Tipo Jornada','Salario','Bono','Periodicidad','Estado'].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {empleados.map((e,i)=>(
                  <tr key={e.id} onClick={()=>navigate(`/rrhh/empleados/${e.id}`)}
                    className={`border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer ${i%2===0?'':'bg-gray-50/20'}`}>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{e.numero_empleado}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{e.nombre} {e.apellidos||''}</div>
                      {e.usuario_email && <div className="text-xs text-gray-400">{e.usuario_email}</div>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600">{e.puesto||'—'}</td>
                    <td className="px-3 py-3"><Badge texto={e.unidad_codigo||'—'} color={UNIDAD_COLORS[e.unidad_codigo]} /></td>
                    <td className="px-3 py-3 text-xs text-gray-500">{e.tipo_jornada}</td>
                    <td className="px-3 py-3 font-semibold">{e.salario_base ? fmtMXN(e.salario_base) : '—'}</td>
                    <td className="px-3 py-3 text-green-700">{e.bono_puntualidad ? fmtMXN(e.bono_puntualidad) : '—'}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{e.periodicidad||'—'}</td>
                    <td className="px-3 py-3">
                      <Badge texto={e.activo?'Activo':'Baja'} color={e.activo?'bg-green-100 text-green-700':'bg-red-100 text-red-700'} />
                    </td>
                  </tr>
                ))}
                {!empleados.length && <tr><td colSpan="9" className="px-4 py-10 text-center text-gray-400 text-sm">Sin empleados registrados</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ASISTENCIAS — IMPORTAR CSV
// ════════════════════════════════════════════════════════════
export function AsistenciasPage() {
  const [asistencias, setAsistencias] = useState([]);
  const [total,       setTotal]       = useState(0);
  const [filtros,     setFiltros]     = useState({ desde:'', hasta:'' });
  const [cargando,    setCargando]    = useState(false);
  const [modal,       setModal]       = useState(false);
  const [fuente,      setFuente]      = useState('ZKTeco');
  const [filas,       setFilas]       = useState([]);
  const [paso,        setPaso]        = useState(1);
  const [importando,  setImportando]  = useState(false);
  const [resultado,   setResultado]   = useState(null);
  const [msg,         setMsg]         = useState('');
  const fileRef = useRef();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = {};
      if (filtros.desde) params.desde = filtros.desde;
      if (filtros.hasta) params.hasta = filtros.hasta;
      const r = await api.get('/rrhh/asistencias', {params});
      setAsistencias(r.data.datos); setTotal(r.data.total);
    } finally { setCargando(false); }
  },[filtros]);

  useEffect(()=>{ cargar(); },[cargar]);
  const showMsg = txt => { setMsg(txt); setTimeout(()=>setMsg(''),4000); };

  // Parsear CSV del ZKTeco (formato: ID_Usuario\tFecha\tHora\tTipo)
  // o CSV genérico: id_biometrico,fecha,hora_entrada,hora_salida
  const parsearCSV = (texto) => {
    const lineas = texto.split(/\r?\n/).filter(l=>l.trim());
    const sep = lineas[0].includes('\t') ? '\t' : ',';
    const cabs = lineas[0].split(sep).map(c=>c.trim().toLowerCase().replace(/\s/g,'_'));

    // Detectar formato ZKTeco (tiene columna de tipo E/S)
    const esZKTeco = cabs.some(c=>c.includes('tipo')||c==='t'||c==='type');

    if (esZKTeco) {
      // Agrupar por empleado+fecha para obtener primera entrada y última salida
      const grupos = {};
      lineas.slice(1).forEach(l => {
        const cols = l.split(sep).map(c=>c.trim());
        const id   = cols[0];
        const fecha = cols[1]?.split(' ')[0] || cols[1];
        const hora  = cols[1]?.split(' ')[1] || cols[2];
        const tipo  = (cols[3]||cols[2]||'').toUpperCase();
        const key   = `${id}_${fecha}`;
        if (!grupos[key]) grupos[key] = { id_biometrico:id, fecha, entradas:[], salidas:[] };
        if (tipo.includes('E')||tipo==='0'||tipo.includes('CHECK-IN'))  grupos[key].entradas.push(hora);
        if (tipo.includes('S')||tipo==='1'||tipo.includes('CHECK-OUT')) grupos[key].salidas.push(hora);
      });
      return Object.values(grupos).map(g=>({
        id_biometrico: g.id_biometrico,
        fecha:         g.fecha,
        hora_entrada:  g.entradas.sort()[0] || null,
        hora_salida:   g.salidas.sort().reverse()[0] || null,
      }));
    }

    // Formato genérico
    return lineas.slice(1).map(l=>{
      const cols = l.split(sep);
      const obj  = {};
      cabs.forEach((c,i)=>{ obj[c]=cols[i]?.trim()||null; });
      return {
        id_biometrico: obj.id_biometrico || obj.id || obj.numero,
        fecha:         obj.fecha || obj.date,
        hora_entrada:  obj.hora_entrada || obj.entrada || obj.check_in,
        hora_salida:   obj.hora_salida  || obj.salida  || obj.check_out,
      };
    }).filter(r=>r.id_biometrico&&r.fecha);
  };

  const onFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parsearCSV(ev.target.result);
      setFilas(rows);
      setPaso(2);
    };
    reader.readAsText(file,'UTF-8');
  };

  const importar = async () => {
    setImportando(true);
    try {
      const r = await api.post('/rrhh/asistencias/importar', { fuente, filas });
      setResultado(r.data); setPaso(3);
      showMsg(r.data.message);
      cargar();
    } catch(err) { alert(err.response?.data?.error||'Error'); }
    finally { setImportando(false); }
  };

  // Agrupar asistencias por empleado para mostrar resumen
  const porEmpleado = asistencias.reduce((acc, a) => {
    const k = a.numero_empleado;
    if (!acc[k]) acc[k] = { nombre: a.empleado_nombre, numero: k, unidad: a.unidad_codigo, dias:[], tarde:0, faltas:0 };
    acc[k].dias.push(a);
    if (a.minutos_tarde > 10) acc[k].tarde++;
    if (a.tipo_dia === 'Falta') acc[k].faltas++;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Asistencias</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} registros</p>
        </div>
        <button onClick={()=>{setModal(true);setPaso(1);setFilas([]);setResultado(null);}}
          className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          📥 Importar del Checador
        </button>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* Filtros */}
      <div className="flex gap-3 mb-4">
        <input type="date" value={filtros.desde} onChange={e=>setFiltros(f=>({...f,desde:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input type="date" value={filtros.hasta} onChange={e=>setFiltros(f=>({...f,hasta:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {/* Resumen por empleado */}
      {Object.keys(porEmpleado).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
          <div className="px-5 py-3 border-b border-gray-100 text-sm font-semibold text-gray-700">
            Resumen por Empleado ({Object.keys(porEmpleado).length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['#','Empleado','Unidad','Días Reg.','Faltas','Tardanzas','Califica Bono'].map(h=>(
                  <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {Object.values(porEmpleado).map((e,i)=>(
                  <tr key={e.numero} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/20'}`}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{e.numero}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{e.nombre}</td>
                    <td className="px-4 py-2"><Badge texto={e.unidad||'—'} color={UNIDAD_COLORS[e.unidad]} /></td>
                    <td className="px-4 py-2 font-semibold text-center">{e.dias.filter(d=>d.tipo_dia==='Laboral').length}</td>
                    <td className="px-4 py-2 text-center"><span className={`font-semibold ${e.faltas>0?'text-red-600':'text-gray-400'}`}>{e.faltas}</span></td>
                    <td className="px-4 py-2 text-center"><span className={`font-semibold ${e.tarde>0?'text-amber-600':'text-gray-400'}`}>{e.tarde}</span></td>
                    <td className="px-4 py-2">
                      {e.faltas===0&&e.tarde===0
                        ? <Badge texto="✓ Sí" color="bg-green-100 text-green-700" />
                        : <Badge texto="✗ No" color="bg-red-100 text-red-700" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-4">Importar Asistencias del Checador</h3>

            {paso===1 && (
              <div>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Fuente</label>
                  <div className="flex gap-2">
                    {['ZKTeco','App Movil','Manual'].map(f=>(
                      <button key={f} onClick={()=>setFuente(f)}
                        className={`px-4 py-2 text-sm rounded-lg border-2 font-medium transition ${fuente===f?'border-blue-900 bg-blue-50 text-blue-900':'border-gray-200 hover:border-gray-300'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-6 text-center border-2 border-dashed border-gray-300">
                  <div className="text-3xl mb-2">📄</div>
                  <div className="text-sm font-medium text-gray-700 mb-1">Seleccionar archivo CSV o TXT</div>
                  <div className="text-xs text-gray-400 mb-4">
                    {fuente==='ZKTeco' ? 'Formato ZKTeco: ID\tFecha Hora\tTipo' : 'Columnas: id_biometrico, fecha, hora_entrada, hora_salida'}
                  </div>
                  <input ref={fileRef} type="file" accept=".csv,.txt,.dat" className="hidden" onChange={onFile} />
                  <button onClick={()=>fileRef.current.click()} className="bg-blue-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-800">
                    Elegir Archivo
                  </button>
                </div>
                <div className="mt-4 text-xs text-gray-500 bg-blue-50 rounded-lg p-3">
                  <strong>Tip:</strong> Los registros se emparejan con empleados vía el campo <code>id_biometrico</code> del catálogo de empleados. Asegúrate de haberlo configurado antes de importar.
                </div>
              </div>
            )}

            {paso===2 && (
              <div>
                <div className="bg-blue-50 rounded-lg p-3 mb-4 text-sm">
                  <strong>{filas.length} registros</strong> detectados desde {fuente}.
                  Vista previa de los primeros 5:
                </div>
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                    <thead><tr className="bg-gray-50">
                      {['ID Biométrico','Fecha','Entrada','Salida'].map(h=>(
                        <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {filas.slice(0,5).map((f,i)=>(
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 font-mono">{f.id_biometrico}</td>
                          <td className="px-3 py-1.5">{f.fecha}</td>
                          <td className="px-3 py-1.5">{f.hora_entrada||'—'}</td>
                          <td className="px-3 py-1.5">{f.hora_salida||'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between">
                  <button onClick={()=>setPaso(1)} className="text-sm text-gray-500 hover:text-gray-700">← Cambiar archivo</button>
                  <button onClick={importar} disabled={importando}
                    className="bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50">
                    {importando?'Importando...':'Confirmar importación'}
                  </button>
                </div>
              </div>
            )}

            {paso===3 && resultado && (
              <div className="text-center py-4">
                <div className="text-4xl mb-3">{resultado.datos.errores>0?'⚠':'✅'}</div>
                <div className="text-base font-bold text-gray-800 mb-2">{resultado.message}</div>
                {resultado.datos.detalles_error?.length>0 && (
                  <div className="text-left text-xs bg-red-50 border border-red-200 rounded-lg p-3 max-h-28 overflow-y-auto">
                    {resultado.datos.detalles_error.map((e,i)=><div key={i}>ID {e.fila}: {e.error}</div>)}
                  </div>
                )}
                <button onClick={()=>setModal(false)} className="mt-4 bg-blue-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-800">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// NÓMINA — LISTA Y DETALLE
// ════════════════════════════════════════════════════════════
export function NominaLista() {
  const navigate = useNavigate();
  const [periodos,  setPeriodos]  = useState([]);
  const [total,     setTotal]     = useState(0);
  const [cargando,  setCargando]  = useState(true);
  const [modalNuevo,setModalNuevo]= useState(false);
  const [form, setForm] = useState({
    nombre:'', periodicidad:'Quincenal', fecha_inicio:'', fecha_fin:'', fecha_pago:'', unidad_negocio_id:'', notas:''
  });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await api.get('/rrhh/nomina'); setPeriodos(r.data.datos); setTotal(r.data.total); }
    finally { setCargando(false); }
  },[]);

  useEffect(()=>{ cargar(); },[cargar]);

  const crear = async () => {
    setGuardando(true);
    try {
      await api.post('/rrhh/nomina', form);
      setModalNuevo(false); cargar();
    } catch(err){ alert(err.response?.data?.error||'Error'); }
    finally { setGuardando(false); }
  };

  const calcular = async (id) => {
    if (!confirm('¿Calcular nómina? Esto procesará asistencias del periodo.')) return;
    try { await api.post(`/rrhh/nomina/${id}/calcular`); cargar(); alert('Nómina calculada'); }
    catch(err){ alert(err.response?.data?.error||'Error'); }
  };

  const autorizar = async (id) => {
    if (!confirm('¿Autorizar la nómina? Se habilitarán los pagos.')) return;
    try { await api.patch(`/rrhh/nomina/${id}/autorizar`); cargar(); }
    catch(err){ alert(err.response?.data?.error||'Error'); }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Nómina</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} periodos registrados</p>
        </div>
        <button onClick={()=>setModalNuevo(true)} className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">
          + Nuevo Periodo
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-10 text-center text-gray-400 text-sm">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                {['Nombre','Periodicidad','Periodo','F. Pago','Empleados','Percepciones','Deducciones','Neto','Estado','Acciones'].map(h=>(
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {periodos.map((p,i)=>(
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/20'}`}>
                    <td className="px-3 py-3 font-medium text-gray-900">{p.nombre}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{p.periodicidad}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(p.fecha_inicio)} — {fmtDate(p.fecha_fin)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">{fmtDate(p.fecha_pago)}</td>
                    <td className="px-3 py-3 text-center font-semibold">{p.total_empleados||0}</td>
                    <td className="px-3 py-3 text-green-700">{fmtMXN(p.total_percepciones)}</td>
                    <td className="px-3 py-3 text-red-600">{fmtMXN(p.total_deducciones)}</td>
                    <td className="px-3 py-3 font-bold">{fmtMXN(p.total_neto)}</td>
                    <td className="px-3 py-3"><Badge texto={p.estado} color={ESTADO_NOMINA[p.estado]} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>navigate(`/rrhh/nomina/${p.id}`)}
                          className="text-xs text-blue-600 font-medium hover:text-blue-800">Ver</button>
                        {p.estado==='Borrador' && (
                          <button onClick={()=>calcular(p.id)}
                            className="text-xs text-amber-600 font-medium hover:text-amber-800 ml-2">Calcular</button>
                        )}
                        {p.estado==='Calculada' && (
                          <button onClick={()=>autorizar(p.id)}
                            className="text-xs text-green-600 font-medium hover:text-green-800 ml-2">Autorizar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!periodos.length && <tr><td colSpan="10" className="px-4 py-10 text-center text-gray-400 text-sm">Sin periodos de nómina</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nuevo periodo */}
      {modalNuevo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModalNuevo(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-4">Nuevo Periodo de Nómina</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre *</label>
                <input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} required
                  placeholder="Ej. Quincena 1 Abril 2026"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Periodicidad</label>
                <select value={form.periodicidad} onChange={e=>setForm(f=>({...f,periodicidad:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>Quincenal</option><option>Mensual</option><option>Semanal</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unidad</label>
                <select value={form.unidad_negocio_id} onChange={e=>setForm(f=>({...f,unidad_negocio_id:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Todas</option>
                  <option value="1">CI</option><option value="2">PY</option><option value="3">OM</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha Inicio *</label>
                <input type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha Fin *</label>
                <input type="date" value={form.fecha_fin} onChange={e=>setForm(f=>({...f,fecha_fin:e.target.value}))} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha de Pago</label>
                <input type="date" value={form.fecha_pago} onChange={e=>setForm(f=>({...f,fecha_pago:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={()=>setModalNuevo(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={crear} disabled={guardando||!form.nombre||!form.fecha_inicio||!form.fecha_fin}
                className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
                {guardando?'Creando...':'Crear Periodo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// NÓMINA — DETALLE CON LÍNEAS Y PAGO
// ════════════════════════════════════════════════════════════
export function NominaDetalle() {
  const { id } = useParams();
  const [nomina,    setNomina]    = useState(null);
  const [cargando,  setCargando]  = useState(true);
  const [modalPago, setModalPago] = useState(null);
  const [formPago,  setFormPago]  = useState({ fecha:'', forma_pago:'Transferencia', referencia:'', hash_cripto:'', tipo_cambio:'1' });
  const [guardando, setGuardando] = useState(false);
  const [msg,       setMsg]       = useState('');
  const [exportando,setExportando]= useState(false);

  useEffect(()=>{ cargar(); },[id]);
  const cargar = async () => {
    setCargando(true);
    try { const r = await api.get(`/rrhh/nomina/${id}`); setNomina(r.data.datos); }
    finally { setCargando(false); }
  };

  const showMsg = txt => { setMsg(txt); setTimeout(()=>setMsg(''),4000); };

  const pagar = async () => {
    setGuardando(true);
    try {
      await api.patch(`/rrhh/nomina/${id}/pagar-linea/${modalPago.id}`, formPago);
      setModalPago(null); showMsg('Pago registrado'); cargar();
    } catch(err){ alert(err.response?.data?.error||'Error'); }
    finally { setGuardando(false); }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const r = await api.get(`/rrhh/nomina/${id}/exportar`);
      const { datos } = r.data;
      const cols = Object.keys(datos[0]||{});
      const csv  = [cols.join(','),...datos.map(row=>cols.map(c=>`"${row[c]??''}"`).join(','))].join('\n');
      const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href=url; a.download=`nomina_${nomina?.nombre||id}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally { setExportando(false); }
  };

  if (cargando) return <div className="p-12 text-center text-gray-400">Cargando...</div>;
  if (!nomina)  return null;

  const lineas = nomina.lineas || [];
  const esAutorizada = nomina.estado === 'Autorizada';
  const hoy = new Date().toISOString().split('T')[0];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">{nomina.nombre}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge texto={nomina.estado} color={ESTADO_NOMINA[nomina.estado]} />
            <span className="text-xs text-gray-500">{fmtDate(nomina.fecha_inicio)} — {fmtDate(nomina.fecha_fin)}</span>
            {nomina.unidad_codigo && <Badge texto={nomina.unidad_codigo} color={UNIDAD_COLORS[nomina.unidad_codigo]} />}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} disabled={exportando}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50">
            {exportando?'...':'📤 Exportar CSV'}
          </button>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label:'Total Percepciones', val:fmtMXN(nomina.total_percepciones), color:'text-blue-900',  bg:'bg-blue-50'  },
          { label:'Total Deducciones',  val:fmtMXN(nomina.total_deducciones),  color:'text-red-700',   bg:'bg-red-50'   },
          { label:'Total Neto',         val:fmtMXN(nomina.total_neto),         color:'text-green-700', bg:'bg-green-50' },
          { label:'Empleados',          val:`${lineas.length}`,                 color:'text-gray-700',  bg:'bg-gray-50'  },
        ].map(k=>(
          <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
            <div className={`text-xl font-bold ${k.color}`}>{k.val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla de líneas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 border-b border-gray-100">
              {['#','Empleado','Unidad','Días Trab.','Faltas','Salario','Bono','Total Perc.','Deducciones','Neto','Forma Pago','Estado',''].map(h=>(
                <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lineas.map((l,i)=>(
                <tr key={l.id} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/20'}`}>
                  <td className="px-3 py-3 font-mono text-xs text-gray-400">{l.numero_empleado}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">{l.empleado_nombre}</td>
                  <td className="px-3 py-3"><Badge texto={l.unidad_codigo||'—'} color={UNIDAD_COLORS[l.unidad_codigo]} /></td>
                  <td className="px-3 py-3 text-center">{l.dias_trabajados}</td>
                  <td className="px-3 py-3 text-center"><span className={l.dias_falta>0?'text-red-600 font-semibold':'text-gray-400'}>{l.dias_falta}</span></td>
                  <td className="px-3 py-3">{fmtMXN(l.salario_base)}</td>
                  <td className="px-3 py-3 text-green-700">{l.bono_puntualidad>0?fmtMXN(l.bono_puntualidad):'—'}</td>
                  <td className="px-3 py-3 font-semibold">{fmtMXN(l.total_percepciones)}</td>
                  <td className="px-3 py-3 text-red-600">{l.total_deducciones>0?fmtMXN(l.total_deducciones):'—'}</td>
                  <td className="px-3 py-3 font-bold text-blue-900">{fmtMXN(l.neto_pagar)}</td>
                  <td className="px-3 py-3 text-xs text-gray-500">{l.forma_pago||'Pendiente'}</td>
                  <td className="px-3 py-3">
                    <Badge texto={l.estado}
                      color={l.estado==='Pagado'?'bg-green-100 text-green-700':l.estado==='Cancelado'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'} />
                  </td>
                  <td className="px-3 py-3">
                    {esAutorizada && l.estado==='Pendiente' && (
                      <button
                        onClick={()=>{ setModalPago(l); setFormPago({fecha:hoy,forma_pago:'Transferencia',referencia:'',hash_cripto:'',tipo_cambio:'1'}); }}
                        className="text-xs text-blue-600 font-medium hover:text-blue-800 whitespace-nowrap">
                        Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal pago */}
      {modalPago && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&setModalPago(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-1">Registrar Pago de Nómina</h3>
            <p className="text-sm text-gray-500 mb-4">
              {modalPago.empleado_nombre} · Neto: <strong>{fmtMXN(modalPago.neto_pagar)} MXN</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha *</label>
                <input type="date" value={formPago.fecha} onChange={e=>setFormPago(f=>({...f,fecha:e.target.value}))} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Forma de Pago *</label>
                <select value={formPago.forma_pago} onChange={e=>setFormPago(f=>({...f,forma_pago:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {FORMAS_PAGO.map(fp=><option key={fp}>{fp}</option>)}
                </select></div>
              {['USDT','USDC','BTC','ETH'].includes(formPago.forma_pago) && (
                <>
                  <div><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de Cambio (a MXN)</label>
                    <input type="number" step="0.0001" value={formPago.tipo_cambio} onChange={e=>setFormPago(f=>({...f,tipo_cambio:e.target.value}))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                  <div className="flex items-end pb-2">
                    <div className="text-sm text-purple-700 font-semibold">
                      ≈ {(parseFloat(modalPago.neto_pagar)/parseFloat(formPago.tipo_cambio||1)).toFixed(8)} {formPago.forma_pago}
                    </div>
                  </div>
                  <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Hash de Transacción</label>
                    <input value={formPago.hash_cripto} onChange={e=>setFormPago(f=>({...f,hash_cripto:e.target.value}))}
                      placeholder="0x... o TxHash de Binance"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
                </>
              )}
              <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Referencia / No. Transferencia</label>
                <input value={formPago.referencia} onChange={e=>setFormPago(f=>({...f,referencia:e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={()=>setModalPago(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={pagar} disabled={guardando||!formPago.fecha||!formPago.forma_pago}
                className="px-4 py-2 text-sm font-semibold bg-green-700 text-white rounded-lg disabled:opacity-50">
                {guardando?'Registrando...':'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
