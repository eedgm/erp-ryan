export default function CatalogPage({ titulo, subtitulo, hook, columnas, FormularioModal, canCreate=true, canDelete=true }) {
  const { datos,total,cargando,guardando,error,msg,busqueda,setBusqueda,form,setForm,editando,modal,abrirCrear,abrirEditar,cerrarModal,guardar,desactivar,pagina,setPagina } = hook;
  const LIMIT=50, totalPags=Math.ceil(total/LIMIT);
  return (
    <div className="p-6 max-w-screen-xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-blue-900">{titulo}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} registros {subtitulo}</p>
        </div>
        {canCreate && <button onClick={abrirCrear} className="bg-blue-900 hover:bg-blue-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">+ Nuevo</button>}
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {msg   && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{msg}</div>}
      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Buscar..." value={busqueda}
          onChange={e=>{setBusqueda(e.target.value);setPagina(1);}}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {columnas.map(c=><th key={c.key} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{c.label}</th>)}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((row,i)=>(
                  <tr key={row.id} className={`border-b border-gray-50 hover:bg-blue-50/30 transition ${i%2===1?'bg-gray-50/30':''}`}>
                    {columnas.map(c=><td key={c.key} className="px-4 py-3 text-gray-700">{c.render?c.render(row):(row[c.key]??'—')}</td>)}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={()=>abrirEditar(row)} className="text-xs text-blue-600 hover:text-blue-800 font-medium mr-3">Editar</button>
                      {canDelete && <button onClick={()=>desactivar(row.id,row.nombre||row.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Desactivar</button>}
                    </td>
                  </tr>
                ))}
                {!datos.length && <tr><td colSpan={columnas.length+1} className="px-4 py-10 text-center text-gray-400 text-sm">Sin registros</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {totalPags>1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Pagina {pagina} de {totalPags} — {total} registros</span>
            <div className="flex gap-2">
              <button onClick={()=>setPagina(p=>Math.max(1,p-1))} disabled={pagina===1} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">← Ant.</button>
              <button onClick={()=>setPagina(p=>Math.min(totalPags,p+1))} disabled={pagina===totalPags} className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Sig. →</button>
            </div>
          </div>
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>e.target===e.currentTarget&&cerrarModal()}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-blue-900 mb-5">{editando?`Editar: ${editando.nombre||editando.id}`:`Nuevo ${titulo}`}</h3>
            <FormularioModal form={form} setForm={setForm} editando={editando}/>
            <div className="flex gap-3 mt-6 justify-end border-t border-gray-100 pt-4">
              <button onClick={cerrarModal} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={guardando} className="px-4 py-2 text-sm font-semibold bg-blue-900 hover:bg-blue-800 text-white rounded-lg disabled:opacity-50">{guardando?'Guardando...':editando?'Guardar cambios':'Crear registro'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
