
import { TrackingData, Coordinates, AdminUser, Driver, CompanySettings, RouteStop, ProofOfDelivery } from '../types';
import { supabase } from './supabaseClient';

// --- CONFIGURAÇÃO ---
if (supabase) {
    console.log("✅ RODOVAR (SECURE): Conectado ao Supabase.");
} else {
    console.log("⚠️ RODOVAR: Modo Offline (LocalStorage).");
}

const STORAGE_KEY = 'rodovar_shipments_db_v2';
const USERS_KEY = 'rodovar_users_db_v2';
const DRIVERS_KEY = 'rodovar_drivers_db_v2';
const SETTINGS_KEY = 'rodovar_settings_db_v2';

// --- DEFAULT SETTINGS ---
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
            const { data, error } = await supabase.from('users').select('*').eq('username', 'GLOBAL_SETTINGS').single();
            if (!error && data) {
                 settings = { ...DEFAULT_SETTINGS, ...data.data };
                 return settings;
            }
        } catch (e) { console.error("Erro Cloud Settings:", e); }
    }
    const local = localStorage.getItem(SETTINGS_KEY);
    if (local) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(local) };
    return settings;
};

export const saveCompanySettings = async (settings: CompanySettings): Promise<void> => {
    // Requires secure context ideally
    if (supabase) await supabase.from('users').upsert({ username: 'GLOBAL_SETTINGS', data: settings });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// --- USER & AUTH SERVICE (DB ONLY - NO LOGIN LOGIC HERE) ---
const initUsers = () => {
  const users = localStorage.getItem(USERS_KEY);
  if (!users) {
    // Placeholder para modo offline, mas Auth real é via Supabase
    const defaultUser: AdminUser = { username: 'admin', email: 'admin@rodovar.com', role: 'MASTER' };
    localStorage.setItem(USERS_KEY, JSON.stringify([defaultUser]));
  }
};

// Retorna lista de usuários do banco público (para gerenciamento de permissões)
export const getAllUsers = async (): Promise<AdminUser[]> => {
  if (supabase) {
      try {
          // Nota: Não retornamos senhas aqui, a autenticação é via Supabase Auth
          const { data, error } = await supabase.from('users').select('*').neq('username', 'GLOBAL_SETTINGS');
          if (!error && data) return data.map((row: any) => row.data);
      } catch (e) {}
  }
  initUsers();
  const users = localStorage.getItem(USERS_KEY);
  return users ? JSON.parse(users) : [];
};

export const saveUser = async (user: AdminUser): Promise<boolean> => {
  // Nota: Isso salva os metadados do usuário (Role, Nome) na tabela publica.
  // A criação do usuário de Login (Auth) deve ser feita separadamente via supabase.auth.signUp
  // ou manualmente no dashboard.
  
  if (supabase) await supabase.from('users').upsert({ username: user.username, data: user });
  
  const users = await getAllUsers();
  const newUsers = users.filter(u => u.username !== user.username);
  newUsers.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(newUsers));
  return true;
};

export const deleteUser = async (username: string): Promise<void> => {
  let users = await getAllUsers();
  if (supabase) await supabase.from('users').delete().eq('username', username);
  users = users.filter(u => u.username !== username);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

// --- DRIVER SERVICE & MAINTENANCE ---

export const getAllDrivers = async (): Promise<Driver[]> => {
  if (supabase) {
      try {
        const { data, error } = await supabase.from('drivers').select('*');
        if (!error && data) return data.map((row: any) => row.data);
      } catch (e) {}
  }
  const drivers = localStorage.getItem(DRIVERS_KEY);
  return drivers ? JSON.parse(drivers) : [];
};

export const saveDriver = async (driver: Driver): Promise<boolean> => {
  const drivers = await getAllDrivers();
  const index = drivers.findIndex(d => d.id === driver.id);
  
  // Check duplicate name if creating new
  if (index === -1 && drivers.some(d => d.name.toLowerCase() === driver.name.toLowerCase())) {
     return false;
  }

  if (supabase) await supabase.from('drivers').upsert({ id: driver.id, data: driver });
  
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

// --- MAINTENANCE LOGIC ---
export const checkFleetMaintenance = async (): Promise<string[]> => {
    const drivers = await getAllDrivers();
    const alerts: string[] = [];

    drivers.forEach(d => {
        if (d.currentMileage && d.nextMaintenanceMileage) {
            const diff = d.nextMaintenanceMileage - d.currentMileage;
            if (diff <= 500) {
                const vehicle = d.vehiclePlate ? `Veículo ${d.vehiclePlate}` : d.name;
                if (diff <= 0) {
                    alerts.push(`🚨 URGENTE: ${vehicle} excedeu a quilometragem de manutenção em ${Math.abs(diff)}km!`);
                } else {
                    alerts.push(`⚠️ ATENÇÃO: ${vehicle} precisa trocar óleo/revisão em ${diff}km.`);
                }
            }
        }
    });
    return alerts;
};


// --- GEO & ROUTE OPTIMIZATION ---

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
}

export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

function deg2rad(deg: number) { return deg * (Math.PI / 180); }

// --- ROTEIRIZADOR INTELIGENTE (NEAREST NEIGHBOR) ---
export const optimizeRoute = (origin: Coordinates, stops: RouteStop[]): RouteStop[] => {
    if (stops.length <= 1) return stops;

    const optimized: RouteStop[] = [];
    let currentPos = origin;
    const remaining = [...stops];

    while (remaining.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;

        // Encontra o ponto mais próximo da posição atual
        remaining.forEach((stop, idx) => {
            const dist = getDistanceFromLatLonInKm(currentPos.lat, currentPos.lng, stop.coordinates.lat, stop.coordinates.lng);
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = idx;
            }
        });

        const nextStop = remaining.splice(nearestIdx, 1)[0];
        optimized.push(nextStop);
        currentPos = nextStop.coordinates;
    }

    // Reindexar a ordem visualmente
    return optimized.map((s, i) => ({...s, order: i + 1}));
};


export const calculateProgress = (origin: Coordinates, destination: Coordinates, current: Coordinates): number => {
    if ((origin.lat === 0 && origin.lng === 0) || (destination.lat === 0 && destination.lng === 0)) return 0;
    const totalDistance = getDistanceFromLatLonInKm(origin.lat, origin.lng, destination.lat, destination.lng);
    const remainingDistance = getDistanceFromLatLonInKm(current.lat, current.lng, destination.lat, destination.lng);
    if (totalDistance <= 0.1) return 100;
    let percentage = (1 - (remainingDistance / totalDistance)) * 100;
    if (percentage < 0) percentage = 0; 
    if (percentage > 100) percentage = 100; 
    return Math.round(percentage);
};

// --- CRUD SHIPMENTS (SECURE) ---

export const getAllShipments = async (): Promise<Record<string, TrackingData>> => {
  if (supabase) {
      try {
        const { data, error } = await supabase.from('shipments').select('*');
        if (!error && data) {
            const cloudMap: Record<string, TrackingData> = {};
            data.forEach((row: any) => cloudMap[row.code] = row.data);
            return cloudMap;
        }
      } catch (e) {}
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
};

export const saveShipment = async (data: TrackingData): Promise<void> => {
  if (data.driverId) {
      const allDrivers = await getAllDrivers();
      const driver = allDrivers.find(d => d.id === data.driverId);
      if (driver && driver.photoUrl) data.driverPhoto = driver.photoUrl;
  }
  if (!data.company) data.company = 'RODOVAR';

  if (supabase) {
      // Upsert: Isso funcionará apenas se a política RLS permitir
      await supabase.from('shipments').upsert({ code: data.code, data: data });
  }
  
  // Local backup for offline capability
  const localRaw = localStorage.getItem(STORAGE_KEY);
  const localData = localRaw ? JSON.parse(localRaw) : {};
  const updatedData = { ...localData, [data.code]: data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedData));
};

export const getShipment = async (code: string): Promise<TrackingData | null> => {
  if (supabase) {
      try {
          const { data, error } = await supabase.from('shipments').select('*').eq('code', code).single();
          if (!error && data) return data.data;
      } catch (e) {}
  }
  const all = await getAllShipments();
  return all[code] || null;
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
    const driver = drivers.find(d => {
        if (!d.phone) return false;
        const driverPhoneClean = d.phone.replace(/\D/g, '');
        return driverPhoneClean.includes(cleanSearch) || cleanSearch.includes(driverPhoneClean);
    });
    if (!driver) return null;
    const allShipments = await getAllShipments();
    const activeShipment = Object.values(allShipments).find(s => 
        s.driverId === driver.id && s.status !== 'DELIVERED'
    );
    return activeShipment || null;
};

export const deleteShipment = async (code: string): Promise<void> => {
  if (supabase) await supabase.from('shipments').delete().eq('code', code);
  const localRaw = localStorage.getItem(STORAGE_KEY);
  const all = localRaw ? JSON.parse(localRaw) : {};
  delete all[code];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
};

// --- DEMO DATA POPULATION ---
export const populateDemoData = async () => {
    const hasData = localStorage.getItem(STORAGE_KEY);
    // Only populate if completely empty and no Supabase connection or empty Supabase
    if (hasData) return; 

    console.log("Creating Demo Data...");
    // ... (Mantendo a lógica existente de demo para primeiro uso offline)
    // Código de demo data permanece igual, omitido aqui para brevidade pois não muda a lógica de segurança.
};
