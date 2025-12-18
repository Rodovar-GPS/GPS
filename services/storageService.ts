
import { TrackingData, Coordinates, AdminUser, Driver, TrackingStatus, CompanySettings, RouteStop, UserRole, ProofOfDelivery } from '../types';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO DO SUPABASE ---
const getEnv = () => {
    try {
        return (import.meta as any).env || {};
    } catch {
        return {};
    }
};

const env = getEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

const STORAGE_KEY = 'rodovar_shipments_db_v2';
const USERS_KEY = 'rodovar_users_db_v2';
const DRIVERS_KEY = 'rodovar_drivers_db_v2';
const SETTINGS_KEY = 'rodovar_settings_db_v2';

const DEFAULT_SETTINGS: CompanySettings = {
    name: 'RODOVAR',
    slogan: 'Logística Inteligente',
    logoUrl: '', 
    primaryColor: '#FFD700',
    backgroundColor: '#121212',
    cardColor: '#1E1E1E',
    textColor: '#F5F5F5'
};

// --- SETTINGS SERVICE ---
export const getCompanySettings = async (): Promise<CompanySettings> => {
    let settings = DEFAULT_SETTINGS;
    if (supabase) {
        try {
            const { data, error } = await supabase.from('users').select('data').eq('username', 'GLOBAL_SETTINGS').single();
            if (!error && data) {
                 return { ...DEFAULT_SETTINGS, ...data.data };
            }
        } catch (e) { console.error("Erro Cloud Settings:", e); }
    }
    const local = localStorage.getItem(SETTINGS_KEY);
    if (local) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(local) };
    return settings;
};

export const saveCompanySettings = async (settings: CompanySettings): Promise<void> => {
    if (supabase) {
        await supabase.from('users').upsert({ username: 'GLOBAL_SETTINGS', data: settings });
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// --- AUTH SERVICE (ADMIN) ---
export const getAllUsers = async (): Promise<AdminUser[]> => {
  if (supabase) {
      try {
          const { data, error } = await supabase.from('users').select('data').neq('username', 'GLOBAL_SETTINGS');
          if (!error && data) return data.map((row: any) => row.data);
      } catch (e) { console.error("Erro ao buscar usuários:", e); }
  }
  const users = localStorage.getItem(USERS_KEY);
  if (!users) {
    const defaultUser: AdminUser = { username: 'admin', password: 'Danone01#@', role: 'MASTER' };
    return [defaultUser];
  }
  return JSON.parse(users);
};

export const saveUser = async (user: AdminUser): Promise<boolean> => {
  if (supabase) {
      const { error } = await supabase.from('users').upsert({ username: user.username, data: user });
      if (error) console.error("Erro Supabase User:", error);
  }
  const users = await getAllUsers();
  const newUsers = users.filter(u => u.username !== user.username);
  newUsers.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(newUsers));
  return true;
};

export const deleteUser = async (username: string): Promise<void> => {
  if (supabase) await supabase.from('users').delete().eq('username', username);
  let users = await getAllUsers();
  users = users.filter(u => u.username !== username);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const validateLogin = async (user: Pick<AdminUser, 'username' | 'password'>): Promise<AdminUser | null> => {
  const users = await getAllUsers();
  const found = users.find(u => u.username === user.username && u.password === user.password);
  return found || null;
};

// --- DRIVER SERVICE ---
export const getAllDrivers = async (): Promise<Driver[]> => {
  if (supabase) {
      try {
        const { data, error } = await supabase.from('drivers').select('data');
        if (!error && data) return data.map((row: any) => row.data);
      } catch (e) { console.error("Erro ao buscar motoristas:", e); }
  }
  const drivers = localStorage.getItem(DRIVERS_KEY);
  return drivers ? JSON.parse(drivers) : [];
};

export const saveDriver = async (driver: Driver): Promise<boolean> => {
  if (supabase) {
      const { error } = await supabase.from('drivers').upsert({ id: driver.id, data: driver });
      if (error) {
          console.error("Erro Supabase Driver:", error);
          return false;
      }
  }
  const drivers = await getAllDrivers();
  const index = drivers.findIndex(d => d.id === driver.id);
  
  if (index >= 0) drivers[index] = driver;
  else drivers.push(driver);
  
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(drivers));
  return true;
};

export const deleteDriver = async (id: string): Promise<void> => {
  if (supabase) await supabase.from('drivers').delete().eq('id', id);
  let drivers = await getAllDrivers();
  drivers = drivers.filter(d => d.id !== id);
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(drivers));
};

// --- SHIPMENTS SERVICE ---
export const getAllShipments = async (): Promise<Record<string, TrackingData>> => {
  if (supabase) {
      try {
        const { data, error } = await supabase.from('shipments').select('data');
        if (!error && data) {
            const cloudMap: Record<string, TrackingData> = {};
            data.forEach((row: any) => cloudMap[row.data.code] = row.data);
            return cloudMap;
        }
      } catch (e) { console.error("Erro ao buscar cargas:", e); }
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
};

export const saveShipment = async (data: TrackingData): Promise<void> => {
  if (supabase) {
      const { error } = await supabase.from('shipments').upsert({ code: data.code, data: data });
      if (error) console.error("Erro Supabase Shipment:", error);
  }
  const all = await getAllShipments();
  const updatedData = { ...all, [data.code]: data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
};

export const getShipment = async (code: string): Promise<TrackingData | null> => {
  if (supabase) {
      const { data, error } = await supabase.from('shipments').select('data').eq('code', code).single();
      if (!error && data) return data.data;
  }
  const all = await getAllShipments();
  return all[code] || null;
};

export const deleteShipment = async (code: string): Promise<void> => {
  if (supabase) await supabase.from('shipments').delete().eq('code', code);
  const all = await getAllShipments();
  delete all[code];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

// --- AUXILIARY FUNCTIONS ---
export const getCoordinatesForCity = async (city: string, state: string): Promise<Coordinates> => {
  try {
    const query = `${city.trim()}, ${state.trim()}, Brazil`;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
    const data = await response.json();
    return data && data.length > 0 ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : { lat: -14.2350, lng: -51.9253 };
  } catch (error) { return { lat: -14.2350, lng: -51.9253 }; }
};

export const getCoordinatesForString = async (locationString: string, detailedAddress?: string): Promise<Coordinates> => {
    try {
        let query = `${locationString}, Brazil`;
        if (detailedAddress && detailedAddress.length > 3) query = `${detailedAddress}, ${locationString}, Brazil`;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
        const data = await response.json();
        if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        else if (detailedAddress) return getCoordinatesForString(locationString);
        return { lat: 0, lng: 0 }; 
    } catch (error) { return { lat: 0, lng: 0 }; }
};

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export const optimizeRoute = (origin: Coordinates, stops: RouteStop[]): RouteStop[] => {
    if (stops.length <= 1) return stops;
    const optimized: RouteStop[] = [];
    let currentPos = origin;
    const remaining = [...stops];
    while (remaining.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        remaining.forEach((stop, idx) => {
            const dist = getDistanceFromLatLonInKm(currentPos.lat, currentPos.lng, stop.coordinates.lat, stop.coordinates.lng);
            if (dist < minDist) { minDist = dist; nearestIdx = idx; }
        });
        const nextStop = remaining.splice(nearestIdx, 1)[0];
        optimized.push(nextStop);
        currentPos = nextStop.coordinates;
    }
    return optimized.map((s, i) => ({...s, order: i + 1}));
};

export const calculateProgress = (origin: Coordinates, destination: Coordinates, current: Coordinates): number => {
    if ((origin.lat === 0 && origin.lng === 0) || (destination.lat === 0 && destination.lng === 0)) return 0;
    const totalDistance = getDistanceFromLatLonInKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const remainingDistance = getDistanceFromLatLonInKm(current.lat, current.lng, destination.lat, destination.lng);
    if (totalDistance <= 0.1) return 100;
    let percentage = (1 - (remainingDistance / totalDistance)) * 100;
    return Math.min(100, Math.max(0, Math.round(percentage)));
};

export const generateUniqueCode = async (company: 'RODOVAR' | 'AXD'): Promise<string> => {
    const all = await getAllShipments();
    const existingCodes = new Set(Object.keys(all));
    let newCode = '';
    const prefix = company === 'RODOVAR' ? 'RODOVAR' : 'AXD';
    do {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        newCode = `${prefix}${randomNum}`;
    } while (existingCodes.has(newCode));
    return newCode;
};

export const getShipmentByDriverPhone = async (phone: string): Promise<TrackingData | null> => {
    const cleanSearch = phone.replace(/\D/g, '');
    const drivers = await getAllDrivers();
    const driver = drivers.find(d => d.phone?.replace(/\D/g, '').includes(cleanSearch));
    if (!driver) return null;
    const allShipments = await getAllShipments();
    return Object.values(allShipments).find(s => s.driverId === driver.id && s.status !== TrackingStatus.DELIVERED) || null;
};

export const checkFleetMaintenance = async (): Promise<string[]> => {
    const drivers = await getAllDrivers();
    const alerts: string[] = [];
    drivers.forEach(d => {
        if (d.currentMileage && d.nextMaintenanceMileage) {
            const diff = d.nextMaintenanceMileage - d.currentMileage;
            if (diff <= 500) {
                const vehicle = d.vehiclePlate || d.name;
                alerts.push(diff <= 0 ? `🚨 URGENTE: ${vehicle} excedeu manutenção!` : `⚠️ ATENÇÃO: ${vehicle} manutenção em ${diff}km.`);
            }
        }
    });
    return alerts;
};

export const populateDemoData = async () => {
    // Demo data logic remains similar if needed for first run
};
