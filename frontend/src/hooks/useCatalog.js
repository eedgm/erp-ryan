import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

/**
 * useCatalog — Hook genérico para cualquier catálogo del ERP.
 * Gestiona: lista paginada, búsqueda, crear, editar, desactivar.
 *
 * @param {string} endpoint  — ruta de la API, ej: '/clientes'
 * @param {object} defaults  — valores por defecto del formulario
 */
export const useCatalog = (endpoint, defaults = {}) => {
  const [datos, setDatos]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]       = useState('');
  const [msg, setMsg]           = useState('');
  const [pagina, setPagina]     = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros]   = useState({});
  const [form, setForm]         = useState(defaults);
  const [editando, setEditando] = useState(null);
  const [modal, setModal]       = useState(false);

  const LIMIT = 50;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: pagina, limit: LIMIT,
        ...(busqueda ? { search: busqueda } : {}),
        ...filtros
      });
      const res = await api.get(`${endpoint}?${params}`);
      setDatos(res.data.datos || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando datos');
    } finally {
      setCargando(false);
    }
  }, [endpoint, pagina, busqueda, filtros]);

  useEffect(() => { cargar(); }, [cargar]);

  const showMsg = (texto, esError = false) => {
    if (esError) setError(texto);
    else setMsg(texto);
    setTimeout(() => { setError(''); setMsg(''); }, 4000);
  };

  const abrirCrear = () => {
    setForm(defaults);
    setEditando(null);
    setModal(true);
  };

  const abrirEditar = (item) => {
    setForm({ ...defaults, ...item });
    setEditando(item);
    setModal(true);
  };

  const cerrarModal = () => {
    setModal(false);
    setEditando(null);
    setForm(defaults);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      if (editando) {
        await api.put(`${endpoint}/${editando.id}`, form);
        showMsg('Registro actualizado correctamente');
      } else {
        await api.post(endpoint, form);
        showMsg('Registro creado correctamente');
      }
      cerrarModal();
      cargar();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Error guardando', true);
    } finally {
      setGuardando(false);
    }
  };

  const desactivar = async (id, nombre) => {
    if (!confirm(`¿Desactivar "${nombre}"?`)) return;
    try {
      await api.delete(`${endpoint}/${id}`);
      showMsg('Registro desactivado');
      cargar();
    } catch (err) {
      showMsg(err.response?.data?.error || 'Error al desactivar', true);
    }
  };

  return {
    datos, total, cargando, guardando, error, msg,
    pagina, setPagina, busqueda, setBusqueda,
    filtros, setFiltros,
    form, setForm,
    editando, modal,
    abrirCrear, abrirEditar, cerrarModal, guardar,
    desactivar, cargar,
  };
};
