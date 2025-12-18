
import { TrackingData, Coordinates, AdminUser, Driver, TrackingStatus, CompanySettings, RouteStop, UserRole, ProofOfDelivery } from '../types';
import { createClient } from '@supabase/supabase-js';

const getEnv = () => {
    try { return (import.meta as any).env || {}; } catch { return {}; }
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

export const getCompanySettings = async (): Promise<CompanySettings> => {
    let settings = DEFAULT_SETTINGS;
    if (supabase) {
        try {
            const { data, error } = await supabase.from('users').select('data').eq('username', 'GLOBAL_SETTINGS').single();
            if (!error && data) return { ...DEFAULT_SETTINGS, ...data.data };
        } catch (e) { console.error("Erro Cloud Settings:", e); }
    }
    const local = localStorage.getItem(SETTINGS_KEY);
    if (local) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(local) };
    return settings;
};

export const saveCompanySettings = async (settings: CompanySettings): Promise<void> => {
    if (supabase) await supabase.from('users').upsert({ username: 'GLOBAL_SETTINGS', data: settings });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const getAllUsers = async (): Promise<AdminUser[]> => {
  if (supabase) {
      try {
          const { data, error } = await supabase.from('users').select('data').neq('username', 'GLOBAL_SETTINGS');
          if (!error && data) return data.map((row: any) => row.data);
      } catch (e) { console.error("Erro usuários:", e); }
  }
  const users = localStorage.getItem(USERS_KEY);
  if (!users) return [{ username: 'admin', password: 'admin', role: 'MASTER' }];
  return JSON.parse(users);
};

export const saveUser = async (user: AdminUser): Promise<boolean> => {
  if (supabase) await supabase.from('users').upsert({ username: user.username, data: user });
  const users = await getAllUsers();
  const newUsers = users.filter(u => u.username !== user.username);
  newUsers.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(newUsers));
  return true;
};

export const deleteUser = async (username: string): Promise<void> => {
  if (supabase) await supabase.from('users').delete().eq('username', username);
  const users = await getAllUsers();
  const newUsers = users.filter(u => u.username !== username);
  localStorage.setItem(USERS_KEY, JSON.stringify(newUsers));
};

export const validateLogin = async (user: Pick<AdminUser, 'username' | 'password'>): Promise<AdminUser | null> => {
  const users = await getAllUsers();
  return users.find(u => u.username === user.username && u.password === user.password) || null;
};

export const getAllDrivers = async (): Promise<Driver[]> => {
  if (supabase) {
      try {
        const { data, error } = await supabase.from('drivers').select('data');
        if (!error && data) return data.map((row: any) => row.data);
      } catch (e) { console.error("Erro motoristas:", e); }
  }
  const drivers = localStorage.getItem(DRIVERS_KEY);
  return drivers ? JSON.parse(drivers) : [];
};

export const saveDriver = async (driver: Driver): Promise<boolean> => {
  if (supabase) await supabase.from('drivers').upsert({ id: driver.id, data: driver });
  const drivers = await getAllDrivers();
  const index = drivers.findIndex(d => d.id === driver.id);
  if (index >= 0) drivers[index] = driver; else drivers.push(driver);
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(drivers));
  return true;
};

export const deleteDriver = async (id: string): Promise<void> => {
  if (supabase) await supabase.from('drivers').delete().eq('id', id);
  const drivers = await getAllDrivers();
  const newDrivers = drivers.filter(d => d.id !== id);
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(newDrivers));
};

export const getAllShipments = async (): Promise<Record<string, TrackingData>> => {
  if (supabase) {
      try {
        const { data, error } = await supabase.from('shipments').select('data');
        if (!error && data) {
            const cloudMap: Record<string, TrackingData> = {};
            data.forEach((row: any) => cloudMap[row.data.code] = row.data);
            return cloudMap;
        }
      } catch (e) { console.error("Erro cargas:", e); }
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
};

export const saveShipment = async (data: TrackingData): Promise<void> => {
  if (supabase) await supabase.from('shipments').upsert({ code: data.code, data: data });
  const all = await getAllShipments();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...all, [data.code]: data }));
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

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

export const getCoordinatesForCity = async (city: string, state: string): Promise<Coordinates> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city + ', ' + state + ', Brazil')}&limit=1`);
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
        return data && data.length > 0 ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : { lat: 0, lng: 0 }; 
    } catch (error) { return { lat: 0, lng: 0 }; }
};

export const calculateProgress = (origin: Coordinates, destination: Coordinates, current: Coordinates): number => {
    if (origin.lat === 0 || destination.lat === 0) return 0;
    const total = getDistanceFromLatLonInKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const rem = getDistanceFromLatLonInKm(current.lat, current.lng, destination.lat, destination.lng);
    return Math.min(100, Math.max(0, Math.round((1 - (rem / total)) * 100)));
};

export const generateUniqueCode = async (company: 'RODOVAR' | 'AXD'): Promise<string> => {
    const prefix = company === 'RODOVAR' ? 'RODOVAR' : 'AXD';
    return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
};

export const getShipmentByDriverPhone = async (phone: string): Promise<TrackingData | null> => {
    const cleanSearch = phone.replace(/\D/g, '');
    const drivers = await getAllDrivers();
    const driver = drivers.find(d => d.phone?.replace(/\D/g, '').includes(cleanSearch));
    if (!driver) return null;
    const all = await getAllShipments();
    return Object.values(all).find(s => s.driverId === driver.id && s.status !== TrackingStatus.DELIVERED) || null;
};

export const checkFleetMaintenance = async (): Promise<string[]> => {
    const drivers = await getAllDrivers();
    return drivers.filter(d => d.currentMileage && d.nextMaintenanceMileage && (d.nextMaintenanceMileage - d.currentMileage <= 500))
                  .map(d => `⚠️ ${d.vehiclePlate || d.name}: Revisão em ${d.nextMaintenanceMileage! - d.currentMileage!}km.`);
};

export const optimizeRoute = (origin: Coordinates, stops: RouteStop[]): RouteStop[] => {
    return stops.map((s, i) => ({...s, order: i + 1}));
};

export const populateDemoData = async () => {
    const existing = await getAllShipments();
    if (Object.keys(existing).length > 0) return;

    const demoDrivers: Driver[] = [
        { id: 'd1', name: 'Carlos Santos', phone: '11911112222', vehiclePlate: 'BRA-1A23', currentMileage: 15000, nextMaintenanceMileage: 15100, photoUrl: 'https://i.pravatar.cc/150?u=carlos' },
        { id: 'd2', name: 'Juliana Lima', phone: '21922223333', vehiclePlate: 'RIO-2B34', currentMileage: 8000, nextMaintenanceMileage: 10000, photoUrl: 'https://i.pravatar.cc/150?u=juliana' },
        { id: 'd3', name: 'Ricardo Alemão', phone: '31933334444', vehiclePlate: 'BHZ-3C45', currentMileage: 45000, nextMaintenanceMileage: 45200, photoUrl: 'https://i.pravatar.cc/150?u=ricardo' },
        { id: 'd4', name: 'Fernanda Rocha', phone: '41944445555', vehiclePlate: 'CTB-4D56', currentMileage: 2000, nextMaintenanceMileage: 5000, photoUrl: 'https://i.pravatar.cc/150?u=fernanda' },
        { id: 'd5', name: 'Marcos Oliveira', phone: '51955556666', vehiclePlate: 'POA-5E67', currentMileage: 12000, nextMaintenanceMileage: 12100, photoUrl: 'https://i.pravatar.cc/150?u=marcos' }
    ];
    for (const d of demoDrivers) await saveDriver(d);

    const demoShipments: TrackingData[] = [
        {
            code: 'RODOVAR1001', company: 'RODOVAR', status: TrackingStatus.IN_TRANSIT, isLive: true, loadType: 'CARGAS PERIGOSAS',
            origin: 'São Paulo, SP', destination: 'Salvador, BA', destinationCoordinates: { lat: -12.9714, lng: -38.5014 },
            currentLocation: { city: 'Belo Horizonte', state: 'MG', coordinates: { lat: -19.9167, lng: -43.9345 } },
            lastUpdate: 'Agora', estimatedDelivery: '20/12/2024', message: 'Carga em deslocamento pela BR-116.', progress: 45, driverId: 'd1', driverName: 'Carlos Santos', driverPhoto: 'https://i.pravatar.cc/150?u=carlos'
        },
        {
            code: 'AXD2002', company: 'AXD', status: TrackingStatus.DELIVERED, loadType: 'CARGAS GERAIS',
            origin: 'Rio de Janeiro, RJ', destination: 'Curitiba, PR', destinationCoordinates: { lat: -25.4290, lng: -49.2671 },
            currentLocation: { city: 'Curitiba', state: 'PR', coordinates: { lat: -25.4290, lng: -49.2671 } },
            lastUpdate: 'Há 2 horas', estimatedDelivery: '18/12/2024', message: 'Entrega finalizada no CD Curitiba.', progress: 100, driverId: 'd2', driverName: 'Juliana Lima', driverPhoto: 'https://i.pravatar.cc/150?u=juliana',
            proof: { 
                receiverName: 'Carlos CD Silva', receiverDoc: '123.456.789-00', timestamp: new Date().toISOString(), 
                location: { lat: -25.4290, lng: -49.2671 }, signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                photoBase64: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=300' 
            }
        },
        {
            code: 'RODOVAR3003', company: 'RODOVAR', status: TrackingStatus.STOPPED, loadType: 'CARGAS REFRIGERADAS',
            origin: 'Porto Alegre, RS', destination: 'Goiânia, GO', destinationCoordinates: { lat: -16.6869, lng: -49.2648 },
            currentLocation: { city: 'Londrina', state: 'PR', coordinates: { lat: -23.3103, lng: -51.1628 } },
            lastUpdate: 'Há 15 min', estimatedDelivery: '22/12/2024', message: 'Veículo em parada técnica para descanso.', progress: 30, driverId: 'd3', driverName: 'Ricardo Alemão', driverPhoto: 'https://i.pravatar.cc/150?u=ricardo'
        }
    ];
    for (const s of demoShipments) await saveShipment(s);
};
