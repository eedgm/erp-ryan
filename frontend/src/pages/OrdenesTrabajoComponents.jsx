import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';

const fmtMXN  = v=>`$${parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:2})}`;
const fmtNum  = (v,d=2)=>parseFloat(v||0).toLocaleString('es-MX',{minimumFractionDigits:d});

const ESTADO_STYLE={
  borrador:               {label:'Borrador',           color:'bg-gray-100 text-gray-600',  dot:'bg-gray-400'},
  pendiente_autorizacion: {label:'Pend. Autorización', color:'bg-amber-100 text-amber-700',dot:'bg-amber-500'},
  autorizada:             {label:'Autorizada',          color:'bg-blue-100 text-blue-700',  dot:'bg-blue-500'},
  ejecutada:              {label:'Ejecutada',           color:'bg-green-100 text-green-700',dot:'bg-green-500'},
  cancelada:              {label:'Cancelada',           color:'bg-red-100 text-red-700',    dot:'bg-red-500'},
};
const TIPO_LABEL={
  traspaso_a_folio:   'Traspaso a Folio',
  consumo_directo:    'Consumo Directo',
  devolucion_almacen: 'Devolución a Almacén',
  ajuste_inventario:  'Ajuste de Inventario',
};
const Badge=({texto,color,dot})=>(
  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
    {dot&&<span className={`w-1.5 h-1.5 rounded-full ${dot}`}/>}{texto}
  </span>
);

// ── Lista ─────────────────────────────────────────────────────
export function OrdenesTrabajoLista(){
  const navigate=useNavigate();
  const [ots,setOts]=useState([]);
  const [total,setTotal]=useState(0);
  const [dash,setDash]=useState(null);
  const [cargando,setCargando]=useState(true);
  const [filtros,setFiltros]=useState({estado:'',tipo:'',search:''});
  const [msg,setMsg]=useState({tipo:'',texto:''});

  const cargar=useCallback(async()=>{
    setCargando(true);
    try{
      const p={...filtros,limit:30};
      Object.keys(p).forEach(k=>!p[k]&&delete p[k]);
      const [r,d]=await Promise.all([api.get('/ordenes-trabajo',{params:p}),api.get('/ordenes-trabajo/dashboard')]);
      setOts(r.data.datos);setTotal(r.data.total);setDash(d.data);
    }finally{setCargando(false);}
  },[filtros]);
  useEffect(()=>{cargar();},[cargar]);

  const showMsg=(tipo,texto)=>{setMsg({tipo,texto});setTimeout(()=>setMsg({tipo:'',texto:''}),4000);};

  const accionRapida=async(id,accion,payload={})=>{
    try{
      if(accion==='solicitar')await api.patch(`/ordenes-trabajo/${id}/solicitar`);
      if(accion==='autorizar')await api.patch(`/ordenes-trabajo/${id}/autorizar`,payload);
      if(accion==='ejecutar') await api.post(`/ordenes-trabajo/${id}/ejecutar`);
      if(accion==='cancelar') await api.patch(`/ordenes-trabajo/${id}/cancelar`,payload);
      showMsg('ok',`OT ${accion} correctamente`);cargar();
    }catch(err){showMsg('error',err.response?.data?.error||`Error: ${accion}`);}
  };

  return(
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-blue-900">Órdenes de Trabajo</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} órdenes registradas</p>
        </div>
        <button onClick={()=>navigate('/ordenes-trabajo/nueva')}
          className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Nueva OT</button>
      </div>

      {msg.texto&&(
        <div className={`mb-4 p-3 rounded-lg text-sm border ${msg.tipo==='ok'?'bg-green-50 border-green-200 text-green-700':'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {dash&&(
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
          {[
            {key:'borrador',     label:'Borrador',     val:dash.kpis?.borrador},
            {key:'pendiente_autorizacion',label:'Pend. Auth', val:dash.kpis?.pendiente_auth,hl:parseInt(dash.kpis?.pendiente_auth)>0},
            {key:'autorizada',   label:'Autorizadas',  val:dash.kpis?.autorizada},
            {key:'ejecutada',    label:'Ejecutadas',   val:dash.kpis?.ejecutada},
            {key:'cancelada',    label:'Canceladas',   val:dash.kpis?.cancelada},
            {label:'Costo Mes',  val:fmtMXN(dash.kpis?.costo_mes_mxn),isAmt:true},
          ].map((k,i)=>(
            <div key={i} className={`rounded-xl p-3 border-2 ${filtros.estado===k.key?'border-blue-900 bg-blue-50':k.hl?'border-amber-300 bg-amber-50':'border-gray-200 bg-white'} ${k.key?'cursor-pointer':''}`}
              onClick={()=>k.key&&setFiltros(f=>({...f,estado:f.estado===k.key?'':k.key}))}>
              <div className={`font-bold ${k.isAmt?'text-sm text-blue-900':'text-2xl text-gray-900'}`}>{k.val}</div>
              <div className="text-xs text-gray-400 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {dash?.pendientes_auth?.length>0&&(
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">⏳ Pendientes de autorización</div>
          <div className="flex flex-wrap gap-2">
            {dash.pendientes_auth.map(ot=>(
              <div key={ot.id} className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                <span className="font-mono font-bold text-blue-900">{ot.folio}</span>
                <span className="text-gray-500">{ot.proyecto_folio||'—'}</span>
                <span className="text-amber-600 font-semibold">{ot.dias_espera}d</span>
                <button onClick={()=>accionRapida(ot.id,'autorizar')}
                  className="text-xs bg-green-600 text-white px-2 py-0.5 rounded font-semibold hover:bg-green-700">Autorizar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Buscar folio o proyecto..."
          value={filtros.search} onChange={e=>setFiltros(f=>({...f,search:e.target.value}))}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        <select value={filtros.estado} onChange={e=>setFiltros(f=>({...f,estado:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_STYLE).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtros.tipo} onChange={e=>setFiltros(f=>({...f,tipo:e.target.value}))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando?<div className="p-10 text-center text-gray-400 text-sm">Cargando...</div>:(
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Folio OT','Tipo','Proyecto','Almacenes','Partidas','Costo MXN','Estado','Acciones'].map(h=>(
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ots.map((ot,i)=>{
                  const es=ESTADO_STYLE[ot.estado]||ESTADO_STYLE.borrador;
                  const pct=parseInt(ot.total_partidas)>0?Math.round(parseInt(ot.partidas_ejecutadas)/parseInt(ot.total_partidas)*100):0;
                  return(
                    <tr key={ot.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                      <td className="px-3 py-3">
                        <button onClick={()=>navigate(`/ordenes-trabajo/${ot.id}`)}
                          className="font-mono text-xs font-bold text-blue-900 hover:underline">{ot.folio}</button>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">{TIPO_LABEL[ot.tipo]||ot.tipo}</td>
                      <td className="px-3 py-3">
                        {ot.proyecto_folio
                          ?<><div className="font-mono text-xs text-blue-700">{ot.proyecto_folio}</div>
                             <div className="text-xs text-gray-400 truncate max-w-28">{ot.proyecto_nombre}</div></>
                          :<span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-blue-700 font-semibold">{ot.almacen_origen_clave}</span>
                          {ot.almacen_destino_clave&&<><span className="text-gray-300">→</span>
                          <span className="font-mono text-green-700 font-semibold">{ot.almacen_destino_clave}</span></>}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{width:`${pct}%`}}/>
                          </div>
                          <span className="text-xs text-gray-500">{ot.partidas_ejecutadas}/{ot.total_partidas}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-xs">
                        {parseFloat(ot.costo_total_mxn)>0?fmtMXN(ot.costo_total_mxn):'—'}
                      </td>
                      <td className="px-3 py-3"><Badge texto={es.label} color={es.color} dot={es.dot}/></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {ot.estado==='borrador'&&
                            <button onClick={()=>accionRapida(ot.id,'solicitar')}
                              className="text-xs text-amber-600 font-semibold hover:text-amber-800 whitespace-nowrap">Solicitar</button>}
                          {ot.estado==='pendiente_autorizacion'&&
                            <button onClick={()=>accionRapida(ot.id,'autorizar')}
                              className="text-xs text-green-600 font-semibold hover:text-green-800">Autorizar</button>}
                          {ot.estado==='autorizada'&&
                            <button onClick={()=>{if(confirm('¿Ejecutar OT? Moverá el inventario.'))accionRapida(ot.id,'ejecutar');}}
                              className="text-xs bg-blue-900 text-white px-2 py-0.5 rounded font-semibold">Ejecutar</button>}
                          {!['ejecutada','cancelada'].includes(ot.estado)&&
                            <button onClick={()=>{const m=prompt('Motivo:');if(m)accionRapida(ot.id,'cancelar',{motivo:m});}}
                              className="text-xs text-red-500 hover:text-red-700">Cancelar</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!ots.length&&<tr><td colSpan="8" className="px-4 py-10 text-center text-gray-400 text-sm">No se encontraron órdenes de trabajo</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Nueva OT ──────────────────────────────────────────────────
export function NuevaOrdenTrabajo(){
  const navigate=useNavigate();
  const [proyectos,setProyectos]=useState([]);
  const [unidades,setUnidades]=useState([]);
  const [almacenes,setAlmacenes]=useState([]);
  const [familias,setFamilias]=useState([]);
  const [productos,setProductos]=useState([]);
  const [guardando,setGuardando]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState({tipo:'traspaso_a_folio',proyecto_id:'',unidad_negocio_id:'',
    almacen_origen_id:'',almacen_destino_id:'',familia_presupuesto_id:'',
    fecha_necesidad:'',motivo:'',notas:''});
  const [partidas,setPartidas]=useState([{producto_id:'',cantidad_solicitada:'',stock_actual:null}]);

  useEffect(()=>{
    Promise.all([
      api.get('/proyectos?estado=Activo&limit=100'),
      api.get('/unidades'),
      api.get('/almacenes?activo=true'),
      api.get('/familias-presupuesto'),
      api.get('/productos?activo=true&limit=500'),
    ]).then(([p,u,a,f,pr])=>{
      setProyectos(p.data.datos);setUnidades(u.data.datos);
      setAlmacenes(a.data.datos);setFamilias(f.data.datos);setProductos(pr.data.datos);
    });
  },[]);

  const sf=(k,v)=>setForm(f=>({...f,[k]:v}));

  const setPartidaField=async(idx,k,v)=>{
    setPartidas(ps=>ps.map((p,i)=>i===idx?{...p,[k]:v}:p));
    if(k==='producto_id'&&v&&form.almacen_origen_id){
      try{
        const r=await api.get('/inventario/stock',{params:{producto_id:v}});
        const almItem=r.data.por_almacen.find(a=>String(a.almacen_id)===String(form.almacen_origen_id));
        setPartidas(ps=>ps.map((p,i)=>i===idx?{...p,producto_id:v,stock_actual:almItem?parseFloat(almItem.stock_actual):0}:p));
      }catch{}
    }
  };

  const addPartida=()=>setPartidas(ps=>[...ps,{producto_id:'',cantidad_solicitada:'',stock_actual:null}]);
  const removePartida=idx=>setPartidas(ps=>ps.filter((_,i)=>i!==idx));

  const handleSubmit=async(e)=>{
    e.preventDefault();setError('');
    const pv=partidas.filter(p=>p.producto_id&&parseFloat(p.cantidad_solicitada)>0);
    if(!pv.length){setError('Agrega al menos una partida válida');return;}
    setGuardando(true);
    try{
      const r=await api.post('/ordenes-trabajo',{...form,partidas:pv});
      navigate(`/ordenes-trabajo/${r.data.datos.id}`);
    }catch(err){setError(err.response?.data?.error||'Error creando la OT');}
    finally{setGuardando(false);}
  };

  const needsDest=['traspaso_a_folio','devolucion_almacen'].includes(form.tipo);
  const needsFam=form.tipo==='consumo_directo';

  return(
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={()=>navigate('/ordenes-trabajo')} className="text-gray-400 hover:text-gray-700 text-sm">← Volver</button>
        <h1 className="text-xl font-bold text-blue-900">Nueva Orden de Trabajo</h1>
      </div>
      {error&&<div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-5 text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide mb-4">Datos Generales</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de OT *</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TIPO_LABEL).map(([k,v])=>(
                  <label key={k} className={`flex items-center gap-2 p-3 border-2 rounded-lg cursor-pointer ${form.tipo===k?'border-blue-900 bg-blue-50':'border-gray-200'}`}>
                    <input type="radio" name="tipo" value={k} checked={form.tipo===k} onChange={()=>sf('tipo',k)} className="hidden"/>
                    <span className="text-xs font-semibold text-gray-700">{v}</span>
                  </label>
                ))}
              </div>
            </div>
            {[
              ['unidad_negocio_id','Unidad de Negocio *',unidades,'codigo'],
              ['proyecto_id','Proyecto',proyectos,'folio'],
              ['almacen_origen_id','Almacén Origen *',almacenes.filter(a=>String(a.id)!==String(form.almacen_destino_id)),'clave'],
              ...(needsDest?[['almacen_destino_id','Almacén Destino *',almacenes.filter(a=>String(a.id)!==String(form.almacen_origen_id)),'clave']]:[]),
              ...(needsFam?[['familia_presupuesto_id','Familia Presupuesto',familias,'nombre']]:[]),
            ].map(([field,label,opts,labelKey])=>(
              <div key={field}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
                <select value={form[field]} onChange={e=>sf(field,e.target.value)}
                  required={label.includes('*')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Seleccionar...</option>
                  {opts.map(o=><option key={o.id} value={o.id}>{o[labelKey]}{o.nombre&&o[labelKey]!==o.nombre?` — ${o.nombre}`:''}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha Requerida</label>
              <input type="date" value={form.fecha_necesidad} onChange={e=>sf('fecha_necesidad',e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Motivo</label>
              <input value={form.motivo} onChange={e=>sf('motivo',e.target.value)} placeholder="Razón de la solicitud..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wide">Productos a Mover</h2>
            <button type="button" onClick={addPartida}
              className="text-xs font-semibold px-3 py-1.5 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg">+ Agregar</button>
          </div>
          <div className="space-y-3">
            {partidas.map((p,idx)=>{
              const insuf=p.stock_actual!==null&&p.cantidad_solicitada&&parseFloat(p.stock_actual)<parseFloat(p.cantidad_solicitada);
              return(
                <div key={idx} className={`border rounded-xl p-4 ${insuf?'border-red-300 bg-red-50/20':'border-gray-200'}`}>
                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-6">
                      <label className="block text-xs text-gray-400 mb-0.5">Producto *</label>
                      <select value={p.producto_id} onChange={e=>setPartidaField(idx,'producto_id',e.target.value)} required
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
                        <option value="">Seleccionar...</option>
                        {productos.map(pr=><option key={pr.id} value={pr.id}>{pr.codigo?`[${pr.codigo}] `:''}{pr.nombre}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-400 mb-0.5">Cantidad *</label>
                      <input type="number" step="0.01" value={p.cantidad_solicitada}
                        onChange={e=>setPartidaField(idx,'cantidad_solicitada',e.target.value)} required
                        className={`w-full px-2 py-1.5 border rounded text-xs ${insuf?'border-red-400':'border-gray-300'} focus:outline-none focus:ring-1 focus:ring-blue-500`}/>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-0.5">Stock Disp.</label>
                      <div className={`px-2 py-1.5 rounded text-xs font-semibold border ${
                        p.stock_actual===null?'text-gray-300 border-gray-200 bg-gray-50':
                        insuf?'text-red-700 bg-red-100 border-red-300':'text-green-700 bg-green-100 border-green-300'}`}>
                        {p.stock_actual===null?'—':fmtNum(p.stock_actual)}
                      </div>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button type="button" onClick={()=>removePartida(idx)} className="text-red-400 hover:text-red-600 text-xl leading-none">×</button>
                    </div>
                  </div>
                  {insuf&&<div className="mt-2 text-xs text-red-600 font-medium">⚠ Stock insuficiente: disponible {fmtNum(p.stock_actual)} / requerido {fmtNum(p.cantidad_solicitada)}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={()=>navigate('/ordenes-trabajo')}
            className="px-5 py-2.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button type="submit" disabled={guardando}
            className="px-5 py-2.5 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">
            {guardando?'Creando OT...':'Crear Orden de Trabajo'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Detalle OT ────────────────────────────────────────────────
export function OrdenTrabajoDetalle(){
  const {id}=useParams();const navigate=useNavigate();
  const [ot,setOt]=useState(null);const [cargando,setCargando]=useState(true);
  const [procesando,setProcesando]=useState(false);
  const [msg,setMsg]=useState({tipo:'',texto:''});

  useEffect(()=>{cargar();},[id]);
  const cargar=async()=>{
    setCargando(true);
    try{const r=await api.get(`/ordenes-trabajo/${id}`);setOt(r.data.datos);}
    catch{navigate('/ordenes-trabajo');}
    finally{setCargando(false);}
  };
  const showMsg=(tipo,texto)=>{setMsg({tipo,texto});setTimeout(()=>setMsg({tipo:'',texto:''}),4000);};
  const accion=async(tipo,payload={})=>{
    setProcesando(true);
    try{
      if(tipo==='solicitar')await api.patch(`/ordenes-trabajo/${id}/solicitar`);
      if(tipo==='autorizar')await api.patch(`/ordenes-trabajo/${id}/autorizar`,payload);
      if(tipo==='ejecutar') await api.post(`/ordenes-trabajo/${id}/ejecutar`);
      if(tipo==='cancelar') await api.patch(`/ordenes-trabajo/${id}/cancelar`,payload);
      showMsg('ok',`OT ${tipo} correctamente`);cargar();
    }catch(err){
      const msg=err.response?.data?.error||`Error: ${tipo}`;
      const prods=err.response?.data?.productos;
      showMsg('error',prods?prods.map(p=>`${p.producto}: ${p.disponible}/${p.requerido}`).join(' | '):msg);
    }finally{setProcesando(false);}
  };

  if(cargando)return<div className="p-12 text-center text-gray-400">Cargando...</div>;
  if(!ot)return null;
  const es=ESTADO_STYLE[ot.estado]||ESTADO_STYLE.borrador;

  return(
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button onClick={()=>navigate('/ordenes-trabajo')} className="text-gray-400 hover:text-gray-700 text-sm">← OTs</button>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm font-bold text-blue-900">{ot.folio}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge texto={es.label} color={es.color} dot={es.dot}/>
            <span className="text-xs text-gray-500">{TIPO_LABEL[ot.tipo]}</span>
            {ot.proyecto_folio&&<span className="text-xs font-mono text-blue-700">· {ot.proyecto_folio}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {ot.estado==='borrador'&&<button onClick={()=>accion('solicitar')} disabled={procesando} className="px-3 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg disabled:opacity-50">Solicitar Auth.</button>}
          {['borrador','pendiente_autorizacion'].includes(ot.estado)&&<button onClick={()=>accion('autorizar')} disabled={procesando} className="px-3 py-2 text-sm font-semibold bg-green-700 text-white rounded-lg disabled:opacity-50">Autorizar</button>}
          {ot.estado==='autorizada'&&<button onClick={()=>{if(confirm('¿Ejecutar? Moverá el inventario definitivamente.'))accion('ejecutar');}} disabled={procesando} className="px-3 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg disabled:opacity-50">⚡ Ejecutar OT</button>}
          {!['ejecutada','cancelada'].includes(ot.estado)&&<button onClick={()=>{const m=prompt('Motivo:');if(m)accion('cancelar',{motivo:m});}} disabled={procesando} className="px-3 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg">Cancelar</button>}
        </div>
      </div>

      {msg.texto&&<div className={`mb-4 p-3 rounded-lg text-sm border ${msg.tipo==='ok'?'bg-green-50 border-green-200 text-green-700':'bg-red-50 border-red-200 text-red-700'}`}>{msg.texto}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          {label:'Almacén Origen', val:ot.almacen_origen_clave},
          {label:'Almacén Destino',val:ot.almacen_destino_clave||'—'},
          {label:'Familia Ppto',   val:ot.familia_nombre||'—'},
          {label:'Costo Total MXN',val:parseFloat(ot.costo_total_mxn)>0?fmtMXN(ot.costo_total_mxn):'Pendiente ejecución'},
        ].map(k=>(
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-400 mb-1">{k.label}</div>
            <div className="font-bold text-gray-900 text-sm">{k.val}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-gray-100 flex justify-between">
          <span className="font-semibold text-sm text-gray-700">Partidas</span>
          <span className="text-xs text-gray-400">{ot.partidas?.filter(p=>p.estado_partida==='ejecutada').length||0}/{ot.partidas?.length||0} ejecutadas</span>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 border-b border-gray-100">
            {['#','Producto','Solicitado','Stock Disp.','Ejecutado','Costo U. MXN','Costo Total MXN','Estado'].map(h=>(
              <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(ot.partidas||[]).map((p,i)=>(
              <tr key={p.id} className={`border-b border-gray-50 ${i%2===0?'':'bg-gray-50/30'}`}>
                <td className="px-4 py-3 text-gray-400 text-xs">{p.numero_partida}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{p.descripcion}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.producto_codigo}</div>
                </td>
                <td className="px-4 py-3 font-semibold">{fmtNum(p.cantidad_solicitada)}</td>
                <td className="px-4 py-3">
                  <span className={`font-semibold ${parseFloat(p.stock_disponible)<parseFloat(p.cantidad_solicitada)?'text-red-600':'text-green-700'}`}>
                    {fmtNum(p.stock_disponible)}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-green-700">{fmtNum(p.cantidad_ejecutada)}</td>
                <td className="px-4 py-3 text-xs">{parseFloat(p.costo_unitario_mxn)>0?fmtMXN(p.costo_unitario_mxn):'—'}</td>
                <td className="px-4 py-3 font-semibold">{parseFloat(p.costo_total_mxn)>0?fmtMXN(p.costo_total_mxn):'—'}</td>
                <td className="px-4 py-3">
                  <Badge texto={p.estado_partida}
                    color={p.estado_partida==='ejecutada'?'bg-green-100 text-green-700':p.estado_partida==='cancelada'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-500'}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="font-semibold text-sm text-gray-700 mb-3">Historial de cambios</div>
        <div className="space-y-2">
          {(ot.log||[]).map(l=>(
            <div key={l.id} className="flex items-start gap-3 text-sm">
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ESTADO_STYLE[l.estado_nuevo]?.dot||'bg-gray-300'}`}/>
              <div>
                <span className="font-medium text-gray-800">{ESTADO_STYLE[l.estado_nuevo]?.label||l.estado_nuevo}</span>
                {l.estado_antes&&<span className="text-gray-400"> ← {ESTADO_STYLE[l.estado_antes]?.label||l.estado_antes}</span>}
                <span className="text-gray-400 text-xs ml-2">· {l.usuario_nombre}</span>
                {l.comentario&&<div className="text-xs text-gray-500 mt-0.5">{l.comentario}</div>}
                <div className="text-xs text-gray-400">{new Date(l.creado_en).toLocaleString('es-MX')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
