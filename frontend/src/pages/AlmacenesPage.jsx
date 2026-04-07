import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN = v => `$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtNum = (v,d=4) => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:d,maximumFractionDigits:d});

const TIPO_LABELS = {
  general_mxn: { label:'General MXN', color:'bg-blue-100 text-blue-800' },
  general_usd: { label:'General USD', color:'bg-green-100 text-green-800' },
  general_rst: { label:'RST (USD)',    color:'bg-purple-100 text-purple-800' },
  folio:       { label:'Folio',        color:'bg-orange-100 text-orange-800' },
};

const ALERTA_STYLES = {
  sin_stock:   { label:'Sin stock',   badge:'bg-red-100 text-red-700',    dot:'bg-red-500' },
  stock_bajo:  { label:'Stock bajo',  badge:'bg-amber-100 text-amber-700', dot:'bg-amber-500' },
  stock_alerta:{ label:'Alerta',      badge:'bg-orange-100 text-orange-700',dot:'bg-orange-500' },
  ok:          { label:'OK',          badge:'bg-green-100 text-green-700', dot:'bg-green-500' },
};

// ── Componente: Importar CSV ──────────────────────────────────
function ImportarCSV({ almacenId, onDone }) {
  const [paso, setPaso] = useState(1);   // 1=subir, 2=mapear, 3=confirmar, 4=resultado
  const [filas, setFilas] = useState([]);
  const [cabeceras, setCabeceras] = useState([]);
  const [mapeo, setMapeo] = useState({ codigo:'', nombre:'', cantidad:'', costo:'', unidad_medida:'' });
  const [modo, setModo] = useState('agregar');
  const [preview, setPreview] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const fileRef = useRef();

  const parsearCSV = (texto) => {
    const lineas = texto.split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) return { cabeceras: [], filas: [] };
    const sep = lineas[0].includes('\t') ? '\t' : ',';
    const cabs = lineas[0].split(sep).map(c => c.trim().replace(/"/g,''));
    const fs = lineas.slice(1).map(l => {
      const cols = l.split(sep).map(c => c.trim().replace(/"/g,''));
      const obj = {};
      cabs.forEach((c, i) => { obj[c] = cols[i] || ''; });
      return obj;
    });
    return { cabeceras: cabs, filas: fs };
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { cabeceras: cabs, filas: fs } = parsearCSV(ev.target.result);
      setCabeceras(cabs);
      setFilas(fs);
      // Auto-detectar columnas comunes
      const autoMap = {};
      const buscar = (opciones) => cabs.find(c => opciones.some(o => c.toLowerCase().includes(o))) || '';
      autoMap.codigo       = buscar(['codigo','code','sku','clave']);
      autoMap.nombre       = buscar(['nombre','name','descripcion','description','producto']);
      autoMap.cantidad     = buscar(['cantidad','qty','stock','existencia','exist']);
      autoMap.costo        = buscar(['costo','cost','precio','price','unit']);
      autoMap.unidad_medida= buscar(['unidad','unit','um','medida']);
      setMapeo(autoMap);
      setPaso(2);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const generarPreview = () => {
    return filas.slice(0,5).map(f => ({
      codigo:        f[mapeo.codigo] || '',
      nombre:        f[mapeo.nombre] || '',
      cantidad:      f[mapeo.cantidad] || '',
      costo:         f[mapeo.costo] || '',
      unidad_medida: f[mapeo.unidad_medida] || '',
    }));
  };

  const importar = async () => {
    setCargando(true);
    try {
      const filasMap = filas.map(f => ({
        codigo:        f[mapeo.codigo] || null,
        nombre:        f[mapeo.nombre] || null,
        cantidad:      parseFloat(f[mapeo.cantidad]) || 0,
        costo:         parseFloat(f[mapeo.costo]) || 0,
        unidad_medida: f[mapeo.unidad_medida] || null,
      })).filter(f => f.cantidad > 0);

      const res = await api.post(`/almacenes/${almacenId}/importar-csv`, { modo, filas: filasMap, mapeo });
      setResultado(res.data);
      setPaso(4);
    } catch (err) {
      alert(err.response?.data?.error || 'Error importando CSV');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div>
      {/* Paso 1: Seleccionar archivo */}
      {paso === 1 && (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📄</div>
          <div className="text-sm font-medium text-gray-700 mb-1">Seleccionar archivo CSV</div>
          <div className="text-xs text-gray-400 mb-4">Formato CSV o TSV. Primera fila debe ser encabezados.</div>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} />
          <button onClick={() => fileRef.current.click()}
            className="bg-blue-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-800">
            Elegir archivo
          </button>
        </div>
      )}

      {/* Paso 2: Mapear columnas */}
      {paso === 2 && (
        <div>
          <div className="text-xs text-gray-400 mb-3">{filas.length} filas detectadas · {cabeceras.length} columnas</div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              ['codigo',       'Código del Producto'],
              ['nombre',       'Nombre / Descripción *'],
              ['cantidad',     'Cantidad / Stock *'],
              ['costo',        'Costo Unitario'],
              ['unidad_medida','Unidad de Medida'],
            ].map(([campo, label]) => (
              <div key={campo}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
                <select value={mapeo[campo]} onChange={e => setMapeo(m => ({...m, [campo]: e.target.value}))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— No usar —</option>
                  {cabeceras.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Modo de Importación</label>
              <select value={modo} onChange={e => setModo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="agregar">Agregar a existencias actuales</option>
                <option value="reemplazar">Reemplazar todo el inventario</option>
              </select>
            </div>
          </div>
          {modo === 'reemplazar' && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-3 mb-3">
              ⚠ Modo REEMPLAZAR: se ajustará a cero el stock de todos los productos actuales del almacén y se cargarán los del CSV.
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setPaso(1)} className="text-sm text-gray-500 hover:text-gray-700">← Volver</button>
            <button onClick={() => { setPreview(generarPreview()); setPaso(3); }}
              className="bg-blue-900 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-800">
              Vista previa →
            </button>
          </div>
        </div>
      )}

      {/* Paso 3: Vista previa */}
      {paso === 3 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Vista previa (primeras 5 filas de {filas.length})
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  {['Código','Nombre','Cantidad','Costo','Unidad'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((f, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono">{f.codigo||'—'}</td>
                    <td className="px-3 py-2">{f.nombre||'—'}</td>
                    <td className="px-3 py-2 text-right">{f.cantidad}</td>
                    <td className="px-3 py-2 text-right">{f.costo}</td>
                    <td className="px-3 py-2">{f.unidad_medida||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setPaso(2)} className="text-sm text-gray-500 hover:text-gray-700">← Ajustar mapeo</button>
            <button onClick={importar} disabled={cargando}
              className="bg-green-700 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50">
              {cargando ? 'Importando...' : `Confirmar importación (${filas.length} filas)`}
            </button>
          </div>
        </div>
      )}

      {/* Paso 4: Resultado */}
      {paso === 4 && resultado && (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">{resultado.datos.errores?.length ? '⚠' : '✅'}</div>
          <div className="text-base font-bold text-gray-800 mb-1">{resultado.message}</div>
          {resultado.datos.errores?.length > 0 && (
            <div className="mt-3 text-left text-xs bg-red-50 border border-red-200 rounded-lg p-3 max-h-32 overflow-y-auto">
              {resultado.datos.errores.map((e, i) => <div key={i}>Fila {e.fila}: {e.error}</div>)}
            </div>
          )}
          <button onClick={onDone}
            className="mt-4 bg-blue-900 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-800">
            Cerrar y actualizar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Componente: Traspaso ──────────────────────────────────────
function Traspaso({ almacenes, onDone }) {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [invOrigen, setInvOrigen] = useState([]);
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [notas, setNotas] = useState('');

  const cargarInventario = async (almId) => {
    if (!almId) return setInvOrigen([]);
    const res = await api.get(`/almacenes/${almId}/inventario?limit=200`);
    setInvOrigen(res.data.datos.filter(i => i.stock_actual > 0));
  };

  const agregarItem = (inv) => {
    if (items.find(i => i.producto_id === inv.id)) return;
    setItems(is => [...is, {
      producto_id: inv.id,
      nombre: inv.producto_nombre,
      unidad: inv.unidad_medida,
      stock_disponible: parseFloat(inv.stock_actual),
      costo_unitario: parseFloat(inv.costo_promedio || 0),
      costo_moneda: inv.costo_moneda || 'MXN',
      cantidad: '',
    }]);
  };

  const setItemCantidad = (idx, val) => {
    setItems(is => is.map((it, i) => i === idx ? {...it, cantidad: val} : it));
  };

  const removeItem = (idx) => setItems(is => is.filter((_,i) => i !== idx));

  const ejecutar = async () => {
    const itemsVal = items.filter(i => parseFloat(i.cantidad) > 0);
    if (!itemsVal.length) return alert('Agrega al menos un producto con cantidad');
    setGuardando(true);
    try {
      await api.post('/almacenes/traspaso', {
        almacen_origen_id: parseInt(origen),
        almacen_destino_id: parseInt(destino),
        items: itemsVal.map(i => ({
          producto_id: i.producto_id,
          cantidad: parseFloat(i.cantidad),
          costo_unitario: i.costo_unitario,
          costo_moneda: i.costo_moneda,
        })),
        notas,
        fecha: new Date().toISOString().split('T')[0],
      });
      onDone();
    } catch (err) {
      alert(err.response?.data?.error || 'Error en traspaso');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Almacén Origen *</label>
          <select value={origen} onChange={e => { setOrigen(e.target.value); setItems([]); cargarInventario(e.target.value); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Seleccionar...</option>
            {almacenes.map(a => <option key={a.id} value={a.id}>{a.clave} — {a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Almacén Destino *</label>
          <select value={destino} onChange={e => setDestino(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Seleccionar...</option>
            {almacenes.filter(a => String(a.id) !== String(origen)).map(a => (
              <option key={a.id} value={a.id}>{a.clave} — {a.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Selector de productos del almacén origen */}
      {invOrigen.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Productos disponibles en origen ({invOrigen.length})
          </label>
          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
            {invOrigen.map(inv => (
              <div key={inv.id} onClick={() => agregarItem(inv)}
                className="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-800">{inv.producto_nombre}</span>
                  <span className="text-xs text-gray-400 ml-2">{inv.producto_codigo}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-green-700">{fmtNum(inv.stock_actual,2)} {inv.unidad_medida}</span>
                  <span className="text-xs text-gray-400 ml-2">+ Agregar</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Items seleccionados */}
      {items.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Productos a traspasar</label>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-blue-50 rounded-lg px-3 py-2">
                <div className="flex-1 text-sm font-medium text-gray-800">{it.nombre}</div>
                <div className="text-xs text-gray-400">Disp: {it.stock_disponible} {it.unidad}</div>
                <input type="number" step="0.01" placeholder="Cantidad" value={it.cantidad}
                  max={it.stock_disponible}
                  onChange={e => setItemCantidad(idx, e.target.value)}
                  className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-xs text-gray-400">{it.unidad}</span>
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notas</label>
        <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Razón del traspaso..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onDone} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
        <button onClick={ejecutar} disabled={guardando || !origen || !destino || !items.length}
          className="px-5 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
          {guardando ? 'Procesando...' : 'Ejecutar Traspaso'}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════
export default function AlmacenesPage() {
  const navigate = useNavigate();
  const [resumen, setResumen] = useState(null);
  const [almacenes, setAlmacenes] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [inventario, setInventario] = useState([]);
  const [invTotal, setInvTotal] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modal, setModal] = useState(null); // 'importar'|'traspaso'|'movimiento'
  const [msg, setMsg] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => { cargarDatos(); }, []);
  useEffect(() => { if (seleccionado) cargarInventario(); }, [seleccionado, busqueda]);

  const cargarDatos = async () => {
    const [resRes, almRes] = await Promise.all([
      api.get('/almacenes/resumen'),
      api.get('/almacenes?activo=true'),
    ]);
    setResumen(resRes.data);
    setAlmacenes(almRes.data.datos);
    if (!seleccionado && almRes.data.datos.length) {
      setSeleccionado(almRes.data.datos[0]);
    }
  };

  const cargarInventario = async () => {
    if (!seleccionado) return;
    setCargando(true);
    const res = await api.get(`/almacenes/${seleccionado.id}/inventario`, { params: { search: busqueda, limit: 100 } });
    setInventario(res.data.datos);
    setInvTotal(res.data.total);
    setCargando(false);
  };

  const exportarExcel = async () => {
    if (!seleccionado) return;
    setExportando(true);
    try {
      const res = await api.get(`/almacenes/${seleccionado.id}/exportar`);
      const { datos, almacen } = res.data;

      // Crear CSV simple para descarga
      const cols = Object.keys(datos[0] || {});
      const csv = [
        cols.join(','),
        ...datos.map(r => cols.map(c => `"${r[c]??''}"`).join(','))
      ].join('\n');

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${almacen.clave}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Error exportando'); }
    finally { setExportando(false); }
  };

  const showMsg = (txt) => { setMsg(txt); setTimeout(() => setMsg(''), 4000); };

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-blue-900">Almacenes e Inventario</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal('traspaso')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
            ⇄ Traspaso
          </button>
          <button onClick={() => navigate('/almacenes/movimiento')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
            + Movimiento
          </button>
        </div>
      </div>

      {msg && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{msg}</div>}

      {/* Cards de almacenes generales */}
      {resumen && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {resumen.generales.map(a => (
            <div key={a.clave}
              onClick={() => setSeleccionado(almacenes.find(al => al.clave === a.clave))}
              className={`bg-white rounded-xl border-2 cursor-pointer transition p-5 ${
                seleccionado?.clave === a.clave ? 'border-blue-900 shadow-md' : 'border-gray-200 hover:border-gray-300'
              }`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TIPO_LABELS[a.tipo]?.color}`}>
                  {TIPO_LABELS[a.tipo]?.label}
                </span>
                <span className="text-xs text-gray-400">{a.total_productos} productos</span>
              </div>
              <div className="font-bold text-gray-900 mb-1">{a.nombre}</div>
              <div className="text-2xl font-bold text-blue-900">{fmtMXN(a.valor_mxn)}</div>
              <div className="text-xs text-gray-400 mt-1">Valor total MXN</div>
              {(parseInt(a.sin_stock) > 0 || parseInt(a.stock_bajo) > 0) && (
                <div className="flex gap-2 mt-2">
                  {parseInt(a.sin_stock)>0  && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">⚠ {a.sin_stock} sin stock</span>}
                  {parseInt(a.stock_bajo)>0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">↓ {a.stock_bajo} stock bajo</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Panel de inventario del almacen seleccionado */}
      {seleccionado && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <div className="font-bold text-gray-900">{seleccionado.nombre}</div>
              <div className="text-xs text-gray-400">{invTotal} productos · Clave: {seleccionado.clave}</div>
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="Buscar producto..."
                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
              <button onClick={() => setModal('importar')}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
                📥 Importar CSV
              </button>
              <button onClick={exportarExcel} disabled={exportando}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50">
                {exportando ? '...' : '📤 Exportar CSV'}
              </button>
            </div>
          </div>

          {cargando ? (
            <div className="p-10 text-center text-gray-400 text-sm">Cargando inventario...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Código','Producto','Categoría','Unidad','Stock Actual','Stock Mín.','Costo Prom.','Valor MXN','Estado'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inventario.map((item, i) => {
                    const alerta = ALERTA_STYLES[item.alerta_stock] || ALERTA_STYLES.ok;
                    return (
                      <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                        <td className="px-4 py-3 font-mono text-xs text-blue-700 font-semibold">{item.producto_codigo||'—'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.producto_nombre}</div>
                          {item.es_producto_rst && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 rounded">RST</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{item.categoria_nombre||'—'}</td>
                        <td className="px-4 py-3 text-gray-500">{item.unidad_medida||'—'}</td>
                        <td className="px-4 py-3 font-bold">
                          <span className={parseFloat(item.stock_actual)<=0?'text-red-600':parseFloat(item.stock_actual)<=parseFloat(item.stock_minimo)?'text-amber-600':'text-gray-900'}>
                            {fmtNum(item.stock_actual,2)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{fmtNum(item.stock_minimo,2)}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtNum(item.costo_promedio,4)} <span className="text-xs text-gray-400">{item.costo_moneda}</span>
                        </td>
                        <td className="px-4 py-3 font-medium">{fmtMXN(item.valor_total_mxn)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${alerta.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${alerta.dot}`} />
                            {alerta.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!inventario.length && (
                    <tr><td colSpan="9" className="px-4 py-10 text-center text-gray-400 text-sm">
                      {busqueda ? 'No se encontraron productos con esa búsqueda' : 'Almacén vacío — importa un CSV para comenzar'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Importar CSV */}
      {modal === 'importar' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-4">
              Importar CSV — {seleccionado?.nombre}
            </h3>
            <ImportarCSV almacenId={seleccionado?.id} onDone={() => { setModal(null); cargarDatos(); cargarInventario(); showMsg('Importación completada'); }} />
          </div>
        </div>
      )}

      {/* Modal Traspaso */}
      {modal === 'traspaso' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-4">Traspaso entre Almacenes</h3>
            <Traspaso almacenes={almacenes} onDone={() => { setModal(null); cargarDatos(); cargarInventario(); showMsg('Traspaso registrado correctamente'); }} />
          </div>
        </div>
      )}
    </div>
  );
}
