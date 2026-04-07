import { useState, useEffect } from 'react';
import CatalogPage from '../components/CatalogPage';
import { useCatalog } from '../hooks/useCatalog';
import api from '../utils/api';

const monedaColor = {
  MXN:'bg-blue-100 text-blue-800',USD:'bg-green-100 text-green-800',
  USDT:'bg-purple-100 text-purple-800',USDC:'bg-purple-100 text-purple-800',
  BTC:'bg-amber-100 text-amber-800',ETH:'bg-indigo-100 text-indigo-800',
};
const Badge = ({ texto, color }) => (
  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{texto}</span>
);
const Inp = ({ label, value, onChange, type='text', required=false, placeholder='' }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}{required&&' *'}</label>
    <input type={type} value={value||''} onChange={onChange} placeholder={placeholder} required={required}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
  </div>
);
const Sel = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
    <select value={value||''} onChange={onChange}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
      <option value="">Seleccionar...</option>
      {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
    </select>
  </div>
);
const upd = (setForm, field) => e => setForm(p=>({...p,[field]:e.target.value}));

// ── CLIENTES ──────────────────────────────────────────────────
const defCliente = { nombre:'',rfc:'',tipo:'Empresa',sector:'',ciudad:'',estado:'',pais:'Mexico',
  telefono:'',email:'',contacto_nombre:'',contacto_email:'',contacto_tel:'',
  moneda_preferida:'MXN',credito_limite:0,credito_dias:30,unidad_negocio_id:'',notas:'' };

function FormCliente({ form, setForm }) {
  const [unis, setUnis] = useState([]);
  useEffect(()=>{ api.get('/unidades').then(r=>setUnis(r.data.datos)); },[]);
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><Inp label="Nombre / Razon Social" value={form.nombre} onChange={upd(setForm,'nombre')} required/></div>
      <Inp label="RFC" value={form.rfc} onChange={upd(setForm,'rfc')}/>
      <Sel label="Tipo" value={form.tipo} onChange={upd(setForm,'tipo')} options={['Empresa','Persona Fisica','Gobierno']}/>
      <Inp label="Sector" value={form.sector} onChange={upd(setForm,'sector')} placeholder="Manufactura..."/>
      <Sel label="Moneda Preferida" value={form.moneda_preferida} onChange={upd(setForm,'moneda_preferida')} options={['MXN','USD','USDT','USDC','BTC','ETH']}/>
      <Inp label="Ciudad" value={form.ciudad} onChange={upd(setForm,'ciudad')}/>
      <Inp label="Estado" value={form.estado} onChange={upd(setForm,'estado')}/>
      <Inp label="Telefono" value={form.telefono} onChange={upd(setForm,'telefono')}/>
      <Inp label="Email" value={form.email} onChange={upd(setForm,'email')} type="email"/>
      <Inp label="Contacto — Nombre" value={form.contacto_nombre} onChange={upd(setForm,'contacto_nombre')}/>
      <Inp label="Contacto — Email" value={form.contacto_email} onChange={upd(setForm,'contacto_email')} type="email"/>
      <Inp label="Credito Limite MXN" value={form.credito_limite} onChange={upd(setForm,'credito_limite')} type="number"/>
      <Inp label="Dias de Credito" value={form.credito_dias} onChange={upd(setForm,'credito_dias')} type="number"/>
      <Sel label="Unidad de Negocio" value={form.unidad_negocio_id} onChange={upd(setForm,'unidad_negocio_id')}
        options={unis.map(u=>({value:u.id,label:`${u.codigo} — ${u.nombre}`}))}/>
    </div>
  );
}
export function Clientes() {
  const hook = useCatalog('/clientes', defCliente);
  const cols = [
    {key:'codigo',label:'Codigo'},
    {key:'nombre',label:'Cliente',render:r=><span className="font-medium">{r.nombre}</span>},
    {key:'rfc',label:'RFC'},
    {key:'ciudad',label:'Ciudad'},
    {key:'moneda_preferida',label:'Moneda',render:r=><Badge texto={r.moneda_preferida} color={monedaColor[r.moneda_preferida]||'bg-gray-100 text-gray-600'}/>},
    {key:'credito_dias',label:'Dias Cred.'},
    {key:'unidad_codigo',label:'Unidad',render:r=>r.unidad_codigo?<Badge texto={r.unidad_codigo} color="bg-blue-50 text-blue-700"/>:<span className="text-gray-400 text-xs">Todas</span>},
    {key:'activo',label:'Estado',render:r=><Badge texto={r.activo?'Activo':'Inactivo'} color={r.activo?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}/>},
  ];
  return <CatalogPage titulo="Catalogo de Clientes" subtitulo="activos" hook={hook} columnas={cols} FormularioModal={FormCliente}/>;
}

// ── PROVEEDORES ───────────────────────────────────────────────
const defProv = { nombre:'',rfc:'',tipo:'Empresa',giro:'',ciudad:'',estado:'',pais:'Mexico',
  telefono:'',email:'',contacto_nombre:'',contacto_email:'',
  moneda_preferida:'MXN',dias_credito:30,banco:'',clabe_proveedor:'',wallet_cripto:'',notas:'' };

function FormProveedor({ form, setForm }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><Inp label="Nombre / Razon Social" value={form.nombre} onChange={upd(setForm,'nombre')} required/></div>
      <Inp label="RFC" value={form.rfc} onChange={upd(setForm,'rfc')}/>
      <Sel label="Tipo" value={form.tipo} onChange={upd(setForm,'tipo')} options={['Empresa','Persona Fisica']}/>
      <Inp label="Giro" value={form.giro} onChange={upd(setForm,'giro')} placeholder="Distribuidor electrico..."/>
      <Sel label="Moneda Preferida" value={form.moneda_preferida} onChange={upd(setForm,'moneda_preferida')} options={['MXN','USD','USDT','USDC','BTC','ETH']}/>
      <Inp label="Ciudad" value={form.ciudad} onChange={upd(setForm,'ciudad')}/>
      <Inp label="Estado" value={form.estado} onChange={upd(setForm,'estado')}/>
      <Inp label="Email (OC)" value={form.email} onChange={upd(setForm,'email')} type="email"/>
      <Inp label="Telefono" value={form.telefono} onChange={upd(setForm,'telefono')}/>
      <Inp label="Contacto" value={form.contacto_nombre} onChange={upd(setForm,'contacto_nombre')}/>
      <Inp label="Dias de Credito" value={form.dias_credito} onChange={upd(setForm,'dias_credito')} type="number"/>
      <Inp label="Banco" value={form.banco} onChange={upd(setForm,'banco')}/>
      <Inp label="CLABE" value={form.clabe_proveedor} onChange={upd(setForm,'clabe_proveedor')}/>
      <div className="col-span-2"><Inp label="Wallet Cripto (Binance)" value={form.wallet_cripto} onChange={upd(setForm,'wallet_cripto')} placeholder="Direccion de wallet..."/></div>
    </div>
  );
}
export function Proveedores() {
  const hook = useCatalog('/proveedores', defProv);
  const cols = [
    {key:'codigo',label:'Codigo'},
    {key:'nombre',label:'Proveedor',render:r=><span className="font-medium">{r.nombre}</span>},
    {key:'giro',label:'Giro'},
    {key:'ciudad',label:'Ciudad'},
    {key:'email',label:'Email OC'},
    {key:'moneda_preferida',label:'Moneda',render:r=><Badge texto={r.moneda_preferida} color={monedaColor[r.moneda_preferida]||'bg-gray-100 text-gray-600'}/>},
    {key:'dias_credito',label:'Dias Cred.'},
    {key:'activo',label:'Estado',render:r=><Badge texto={r.activo?'Activo':'Inactivo'} color={r.activo?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}/>},
  ];
  return <CatalogPage titulo="Catalogo de Proveedores" subtitulo="activos" hook={hook} columnas={cols} FormularioModal={FormProveedor}/>;
}

// ── PRODUCTOS ─────────────────────────────────────────────────
const defProd = { nombre:'',descripcion:'',tipo:'Suministro',categoria_id:'',unidad_medida:'Pieza',
  precio_venta_mxn:'',precio_venta_usd:'',costo_mxn:'',costo_usd:'',
  aplica_iva:true,tasa_iva:16,controla_inventario:false,stock_minimo:0,es_producto_rst:false };

function FormProducto({ form, setForm }) {
  const [cats, setCats] = useState([]);
  useEffect(()=>{ api.get('/categorias').then(r=>setCats(r.data.datos)); },[]);
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2"><Inp label="Nombre" value={form.nombre} onChange={upd(setForm,'nombre')} required/></div>
      <Sel label="Tipo" value={form.tipo} onChange={upd(setForm,'tipo')} options={['Servicio','Suministro','Equipo','Material','Herramienta']}/>
      <Sel label="Categoria" value={form.categoria_id} onChange={upd(setForm,'categoria_id')} options={cats.map(c=>({value:c.id,label:c.nombre}))}/>
      <Inp label="Unidad de Medida" value={form.unidad_medida} onChange={upd(setForm,'unidad_medida')} placeholder="Pieza, Metro, Hora..."/>
      <Sel label="Tasa IVA" value={form.tasa_iva} onChange={upd(setForm,'tasa_iva')} options={[{value:16,label:'16%'},{value:8,label:'8%'},{value:0,label:'0% Exento'}]}/>
      <Inp label="Precio Venta MXN" value={form.precio_venta_mxn} onChange={upd(setForm,'precio_venta_mxn')} type="number"/>
      <Inp label="Precio Venta USD" value={form.precio_venta_usd} onChange={upd(setForm,'precio_venta_usd')} type="number"/>
      <Inp label="Costo MXN" value={form.costo_mxn} onChange={upd(setForm,'costo_mxn')} type="number"/>
      <Inp label="Costo USD" value={form.costo_usd} onChange={upd(setForm,'costo_usd')} type="number"/>
      <div className="col-span-2 flex gap-6 mt-1">
        {[['aplica_iva','Aplica IVA'],['controla_inventario','Controla Inventario'],['es_producto_rst','Producto RST']].map(([k,l])=>(
          <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={!!form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.checked}))} className="w-4 h-4 rounded text-blue-600"/>
            {l}
          </label>
        ))}
      </div>
    </div>
  );
}
export function Productos() {
  const hook = useCatalog('/productos', defProd);
  const cols = [
    {key:'codigo',label:'Codigo'},
    {key:'nombre',label:'Nombre',render:r=><span className="font-medium">{r.nombre}</span>},
    {key:'tipo',label:'Tipo',render:r=><Badge texto={r.tipo} color={r.tipo==='Servicio'?'bg-purple-100 text-purple-800':'bg-blue-100 text-blue-800'}/>},
    {key:'unidad_medida',label:'Unidad'},
    {key:'precio_venta_mxn',label:'$ MXN',render:r=>r.precio_venta_mxn?`$${parseFloat(r.precio_venta_mxn).toLocaleString('es-MX')}`:'—'},
    {key:'precio_venta_usd',label:'$ USD',render:r=>r.precio_venta_usd?`$${parseFloat(r.precio_venta_usd).toLocaleString()}`:'—'},
    {key:'controla_inventario',label:'Inventario',render:r=><Badge texto={r.controla_inventario?'Si':'No'} color={r.controla_inventario?'bg-green-100 text-green-800':'bg-gray-100 text-gray-600'}/>},
    {key:'es_producto_rst',label:'RST',render:r=>r.es_producto_rst?<Badge texto="RST" color="bg-amber-100 text-amber-800"/>:'—'},
  ];
  return <CatalogPage titulo="Productos y Servicios" subtitulo="en catalogo" hook={hook} columnas={cols} FormularioModal={FormProducto}/>;
}

// ── TIPOS DE CAMBIO ───────────────────────────────────────────
export function TiposCambio() {
  const [tc,setTc]=useState([]); const [hist,setHist]=useState([]);
  const [form,setForm]=useState({fecha:new Date().toISOString().split('T')[0],moneda:'USD',a_mxn:'',a_usd:''});
  const [msg,setMsg]=useState(''); const [err,setErr]=useState('');
  const reload=()=>{ api.get('/tipos-cambio').then(r=>setTc(r.data.datos||[])); api.get('/tipos-cambio/historico').then(r=>setHist(r.data.datos||[])); };
  useEffect(reload,[]);
  const guardar=async()=>{ try{ await api.post('/tipos-cambio',form); setMsg('TC registrado'); reload(); }catch(e){setErr(e.response?.data?.error||'Error');} setTimeout(()=>{setMsg('');setErr('');},3000); };
  const MONEDAS=[{m:'USD',ic:'🇺🇸'},{m:'USDT',ic:'💵'},{m:'USDC',ic:'💵'},{m:'BTC',ic:'₿'},{m:'ETH',ic:'Ξ'}];
  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <h1 className="text-xl font-bold text-blue-900 mb-5">Tipos de Cambio</h1>
      {msg&&<div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{msg}</div>}
      {err&&<div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{err}</div>}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {MONEDAS.map(({m,ic})=>{ const r=tc.find(t=>t.moneda===m); return (
          <div key={m} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><span style={{fontSize:16}}>{ic}</span><Badge texto={m} color={monedaColor[m]||'bg-gray-100 text-gray-600'}/></div>
            {r?<><div className="text-lg font-bold text-gray-900">${parseFloat(r.a_mxn).toLocaleString('es-MX',{maximumFractionDigits:2})}</div><div className="text-xs text-gray-400">MXN por 1 {m}</div></>:<div className="text-sm text-gray-400">Sin registro</div>}
          </div>
        );})}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <h2 className="text-sm font-bold text-blue-900 mb-3">Registrar / Actualizar</h2>
        <div className="grid grid-cols-4 gap-4">
          <Inp label="Fecha" value={form.fecha} onChange={upd(setForm,'fecha')} type="date"/>
          <Sel label="Moneda" value={form.moneda} onChange={upd(setForm,'moneda')} options={['USD','USDT','USDC','BTC','ETH']}/>
          <Inp label="Precio en MXN" value={form.a_mxn} onChange={upd(setForm,'a_mxn')} type="number" placeholder="17.24"/>
          <Inp label="Precio en USD" value={form.a_usd} onChange={upd(setForm,'a_usd')} type="number" placeholder="1.00"/>
        </div>
        <button onClick={guardar} className="mt-4 bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg">Registrar TC</button>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50"><span className="text-sm font-semibold text-gray-700">Historico</span></div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100">{['Fecha','Moneda','A MXN','A USD','Fuente'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>{hist.slice(0,20).map((r,i)=>(
            <tr key={r.id} className={`border-b border-gray-50 ${i%2===1?'bg-gray-50/30':''}`}>
              <td className="px-4 py-3">{new Date(r.fecha).toLocaleDateString('es-MX')}</td>
              <td className="px-4 py-3"><Badge texto={r.moneda} color={monedaColor[r.moneda]||'bg-gray-100 text-gray-600'}/></td>
              <td className="px-4 py-3 font-medium">${parseFloat(r.a_mxn).toLocaleString('es-MX',{maximumFractionDigits:4})}</td>
              <td className="px-4 py-3">{r.a_usd?parseFloat(r.a_usd).toFixed(4):'—'}</td>
              <td className="px-4 py-3 text-gray-400">{r.fuente}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── CUENTAS Y CARTERAS ────────────────────────────────────────
export function CuentasYCarteras({ tab: externalTab }) {
  const [cuentas,setCuentas]=useState([]); const [carteras,setCarteras]=useState([]); const [resumen,setResumen]=useState(null); const [tab,setTab]=useState(externalTab || 'cuentas');
  useEffect(()=>{ api.get('/cuentas-bancarias').then(r=>setCuentas(r.data.datos||[])); api.get('/carteras-cripto').then(r=>setCarteras(r.data.datos||[])); api.get('/resumen-financiero').then(r=>setResumen(r.data)).catch(()=>{}); },[]);
  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <h1 className="text-xl font-bold text-blue-900 mb-5">Cuentas Bancarias y Carteras Cripto</h1>
      {resumen&&(
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Saldo Total Consolidado</p>
          <div className="text-3xl font-bold text-blue-900 mb-3">${resumen.totalMXN.toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})} MXN</div>
          <div className="flex flex-wrap gap-3">
            {resumen.desglose.map((d,i)=>(
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <Badge texto={d.tipo==='cripto'?'Cripto':'Banco'} color={d.tipo==='cripto'?'bg-purple-100 text-purple-800':'bg-blue-100 text-blue-800'}/>
                {' '}<Badge texto={d.moneda} color={monedaColor[d.moneda]||'bg-gray-100 text-gray-600'}/>
                <span className="ml-2 font-medium">{d.monto.toLocaleString('es-MX',{maximumFractionDigits:4})}</span>
                <span className="text-gray-400 ml-1 text-xs">(≈${Math.round(d.mxn).toLocaleString('es-MX')} MXN)</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-0 border-b border-gray-200 mb-4">
        {[['cuentas','Cuentas Bancarias'],['carteras','Carteras Cripto']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-5 py-2.5 text-sm border-b-2 transition ${tab===k?'border-blue-900 text-blue-900 font-semibold':'border-transparent text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>
      {tab==='cuentas'&&(
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">{['Banco','Cuenta','No. Cuenta','CLABE','Moneda','Saldo Actual','Unidad'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>{cuentas.map((c,i)=>(
              <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===1?'bg-gray-50/30':''}`}>
                <td className="px-4 py-3 font-medium">{c.banco}</td><td className="px-4 py-3">{c.nombre_cuenta}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.numero_cuenta||'—'}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.clabe||'—'}</td>
                <td className="px-4 py-3"><Badge texto={c.moneda} color={monedaColor[c.moneda]||'bg-gray-100 text-gray-600'}/></td>
                <td className="px-4 py-3 font-bold">${parseFloat(c.saldo_actual||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                <td className="px-4 py-3">{c.unidad_codigo?<Badge texto={c.unidad_codigo} color="bg-blue-50 text-blue-700"/>:<span className="text-gray-400 text-xs">General</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {tab==='carteras'&&(
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">{['Nombre','Moneda','Red','Wallet','Saldo','Unidad'].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
            <tbody>{carteras.map((c,i)=>(
              <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${i%2===1?'bg-gray-50/30':''}`}>
                <td className="px-4 py-3 font-medium">{c.nombre}</td>
                <td className="px-4 py-3"><Badge texto={c.moneda} color={monedaColor[c.moneda]||'bg-purple-100 text-purple-800'}/></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.red||'—'}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.direccion_wallet?`${c.direccion_wallet.substring(0,12)}...`:'—'}</td>
                <td className="px-4 py-3 font-bold">{parseFloat(c.saldo_actual||0).toLocaleString('es-MX',{maximumFractionDigits:6})} {c.moneda}</td>
                <td className="px-4 py-3">{c.unidad_codigo?<Badge texto={c.unidad_codigo} color="bg-blue-50 text-blue-700"/>:<span className="text-gray-400 text-xs">General</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const ClientesPage = Clientes;
export const ProveedoresPage = Proveedores;
export const ProductosPage = Productos;
export const TiposCambioPage = TiposCambio;
export const CuentasBancariasPage = () => <CuentasYCarteras tab="cuentas" />;
export const CarterasCriptoPage = () => <CuentasYCarteras tab="carteras" />;
