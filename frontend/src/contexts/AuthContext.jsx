import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al montar, verificar si hay sesion activa
  useEffect(() => {
    const token = localStorage.getItem('erp_token');
    if (token) {
      verificarSesion();
    } else {
      setCargando(false);
    }
  }, []);

  const verificarSesion = async () => {
    try {
      const res = await api.get('/auth/me');
      setUsuario(res.data.usuario);
    } catch {
      limpiarSesion();
    } finally {
      setCargando(false);
    }
  };

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { accessToken, refreshToken, primerLogin, usuario: u } = res.data;
    const usuarioConFlags = { ...u, primerLogin };
    localStorage.setItem('erp_token', accessToken);
    localStorage.setItem('erp_refresh', refreshToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    setUsuario(usuarioConFlags);
    return usuarioConFlags;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    limpiarSesion();
  };

  const limpiarSesion = () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_refresh');
    delete api.defaults.headers.common['Authorization'];
    setUsuario(null);
  };

  // Verificar si el usuario tiene permiso en un módulo
  const puedo = useCallback((modulo, accion = 'ver') => {
    if (!usuario) return false;
    if (usuario.rol?.nivel === 1) return true; // Admin siempre puede
    const p = usuario.permisos?.[modulo];
    if (!p) return false;
    return p[`puede_${accion}`] === true;
  }, [usuario]);

  // Verificar nivel de rol
  const esAdmin    = usuario?.rol?.nivel === 1;
  const esCoord    = usuario?.rol?.nivel <= 2;
  const esCaptura  = usuario?.rol?.nivel === 3;

  return (
    <AuthContext.Provider value={{
      usuario, cargando, login, logout,
      puedo, esAdmin, esCoord, esCaptura,
      verificarSesion
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
