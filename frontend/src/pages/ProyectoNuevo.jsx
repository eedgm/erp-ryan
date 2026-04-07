import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const fmtNum = v => parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2});

export default function ProyectoNuevo() {
  const navigate = useNavigate();
  const [clientes,  setClientes]  = useState([]);
  const [unidades,  setUnidades]  = useState([]);
  const [familiasCatalogo, setFamiliasCatalogo] = useState([]);
  const [usuarios,  setUsuarios]  = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState('');

  const [form, setForm] = useState({
    nombre: '', descripcion: '', cliente_id: '',
    unidad_negocio_id: '', tipo: 'Proyecto', moneda: 'MXN',
    tipo_cambio_inicial: '1', presupuesto_global: '',
    fecha_inicio: '', fecha_fin_estimada: '',
    responsable_id: '', tiene_almacen: false, notas: '',
  });

  // Familias de presupuesto con monto editable
  const [familias, setFamilias] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/clientes?activo=true&limit=200'),
      api.get('/unidades'),
      api.get('/familias-presupuesto'),
      api.get('/usuarios?activo=true'),
    ]).then(([cRes, uRes, fRes, usRes]) => {
      setClientes(cRes.data.datos);
      setUnidades(uRes.data.datos);
      setUsuarios(usRes.data.datos);
      // Cargar todas las familias del catálogo como base
      setFamilias(fRes.data.datos.map(f => ({
        familia_id: f.id,
        nombre_familia: f.nombre,
        presupuesto: '',
      })));
    });
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setFamiliaVal = (idx, val) => {
    setFamilias(fs => fs.map((f, i) => i === idx ? { ...f, presupuesto: val } : f));
  };

  const addFamiliaCustom = () => {
    setFamilias(fs => [...fs, { familia_id: null, nombre_familia: 'Nueva familia', presupuesto: '' }]);
  };

  const removeFamilia = (idx) => {
    setFamilias(fs => fs.filter((_, i) => i !== idx));
  };

  const setFamiliaNombre = (idx, val) => {
    setFamilias(fs => fs.map((f, i) => i === idx ? { ...f, nombre_familia: val } : f));
  };

  // Cálculo en tiempo real
  const presupuestoGlobal = parseFloat(form.presupuesto_global || 0);
  const sumaFamilias = familias.reduce((a, f) => a + parseFloat(f.presupuesto || 0), 0);
  const diferencia = Math.abs(sumaFamilias - presupuestoGlobal);
  const familiasOk = presupuestoGlobal > 0 && diferencia < 0.01;
  const pctAsignado = presupuestoGlobal > 0 ? Math.min(sumaFamilias / presupuestoGlobal * 100, 100) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!familiasOk) {
      setError(`La suma de familias ($${fmtNum(sumaFamilias)}) debe ser igual al presupuesto global ($${fmtNum(presupuestoGlobal)})`);
      return;
    }

    const familiasConPresupuesto = familias.filter(f => parseFloat(f.presupuesto || 0) > 0);
    if (!familiasConPresupuesto.length) {
      setError('Debes asignar presupuesto a al menos una familia');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        ...form,
        presupuesto_global: presupuestoGlobal,
        tipo_cambio_inicial: parseFloat(form.tipo_cambio_inicial || 1),
        familias: familiasConPresupuesto,
      };
      const res = await api.post('/proyectos', payload);
      navigate(`/proyectos/${res.data.datos.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear el proyecto');
    } finally {
      setGuardando(false);
    }
  };

  const needsTC = ['USD','USDT','USDC','BTC','ETH'].includes(form.moneda);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/proyectos')} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
        <h1 className="text-xl font-bold text-blue-900">Nuevo Folio de Proyecto</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Datos Generales */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Datos Generales</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nombre del Proyecto *</label>
              <input value={form.nombre} onChange={e => setField('nombre', e.target.value)} required
                placeholder="Ej. Suministro e instalación tablero eléctrico Planta NL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</label>
              <select value={form.cliente_id} onChange={e => setField('cliente_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin cliente asignado</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Unidad de Negocio *</label>
              <select value={form.unidad_negocio_id} onChange={e => setField('unidad_negocio_id', e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar...</option>
                {unidades.map(u => <option key={u.id} value={u.id}>{u.codigo} — {u.nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setField('tipo', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['Proyecto','Contrato','Servicio','Orden de Trabajo','Mantenimiento'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Responsable</label>
              <select value={form.responsable_id} onChange={e => setField('responsable_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin asignar</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} {u.apellidos||''}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha Inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => setField('fecha_inicio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha Fin Estimada</label>
              <input type="date" value={form.fecha_fin_estimada} onChange={e => setField('fecha_fin_estimada', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descripción</label>
              <textarea value={form.descripcion} onChange={e => setField('descripcion', e.target.value)} rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            <div className="col-span-2 flex items-center gap-3 pt-1">
              <input type="checkbox" id="almacen" checked={form.tiene_almacen}
                onChange={e => setField('tiene_almacen', e.target.checked)} className="rounded w-4 h-4" />
              <label htmlFor="almacen" className="text-sm text-gray-700">
                Crear almacén propio para este proyecto <span className="text-gray-400 text-xs">(ALM-{form.unidad_negocio_id ? '[FOLIO]' : '...'})</span>
              </label>
            </div>
          </div>
        </div>

        {/* Presupuesto */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Presupuesto</h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Moneda *</label>
              <select value={form.moneda} onChange={e => setField('moneda', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['MXN','USD','USDT','USDC','BTC','ETH'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>

            {needsTC && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de Cambio a MXN</label>
                <input type="number" step="0.0001" value={form.tipo_cambio_inicial}
                  onChange={e => setField('tipo_cambio_inicial', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            <div className={needsTC ? '' : 'col-span-2'}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Presupuesto Global * ({form.moneda})</label>
              <input type="number" step="0.01" value={form.presupuesto_global} required
                onChange={e => setField('presupuesto_global', e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Familias de presupuesto */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-700">Desglose por Familias *</div>
                <div className="text-xs text-gray-400">La suma debe igualar el presupuesto global</div>
              </div>
              <button type="button" onClick={addFamiliaCustom}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-300 rounded-lg px-3 py-1">
                + Familia personalizada
              </button>
            </div>

            {/* Barra de progreso de asignación */}
            {presupuestoGlobal > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Asignado: ${fmtNum(sumaFamilias)} {form.moneda}</span>
                  <span className={familiasOk ? 'text-green-600 font-semibold' : diferencia > 0.01 ? 'text-red-600 font-semibold' : ''}>
                    {familiasOk ? '✓ Cuadrado' : `Diferencia: $${fmtNum(diferencia)}`}
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${familiasOk ? 'bg-green-500' : pctAsignado > 100 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(pctAsignado, 100)}%` }} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              {familias.map((f, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="flex-1">
                    <input value={f.nombre_familia}
                      onChange={e => setFamiliaNombre(idx, e.target.value)}
                      disabled={!!f.familia_id}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:text-gray-500" />
                  </div>
                  <div className="w-44">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" value={f.presupuesto}
                        onChange={e => setFamiliaVal(idx, e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div className="w-16 text-xs text-gray-400 text-right">
                    {presupuestoGlobal > 0 && f.presupuesto
                      ? `${Math.round(parseFloat(f.presupuesto) / presupuestoGlobal * 100)}%`
                      : '—'}
                  </div>
                  {!f.familia_id && (
                    <button type="button" onClick={() => removeFamilia(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between text-sm font-semibold">
              <span className="text-gray-600">Total asignado</span>
              <span className={familiasOk ? 'text-green-700' : 'text-blue-900'}>${fmtNum(sumaFamilias)} {form.moneda}</span>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/proyectos')}
            className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !familiasOk}
            className="px-5 py-2.5 text-sm font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-lg disabled:opacity-50 transition">
            {guardando ? 'Creando folio...' : 'Crear Folio de Proyecto'}
          </button>
        </div>
      </form>
    </div>
  );
}
