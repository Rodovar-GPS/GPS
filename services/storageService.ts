
import { TrackingData, Coordinates, AdminUser, Driver, TrackingStatus, CompanySettings, RouteStop, UserRole, ProofOfDelivery } from '../types';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO DO SUPABASE (BANCO NA NUVEM) ---
const getEnv = () => {
    try {
        return (import.meta as any).env || {};
    } catch {
        return {};
    }
};

const env = getEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
  : null;

if (supabase) {
    console.log("✅ RODOVAR: Conectado ao Supabase.");
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
    if (supabase) await supabase.from('users').upsert({ username: 'GLOBAL_SETTINGS', data: settings });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// --- AUTH SERVICE (ADMIN) ---
const initUsers = () => {
  const users = localStorage.getItem(USERS_KEY);
  if (!users) {
    // Default Admin is Master - SENHA ATUALIZADA
    const defaultUser: AdminUser = { username: 'admin', password: 'Danone01#@', role: 'MASTER' };
    localStorage.setItem(USERS_KEY, JSON.stringify([defaultUser]));
  }
};

export const getAllUsers = async (): Promise<AdminUser[]> => {
  if (supabase) {
      try {
          const { data, error } = await supabase.from('users').select('*').neq('username', 'GLOBAL_SETTINGS');
          if (!error && data) return data.map((row: any) => row.data);
      } catch (e) {}
  }
  initUsers();
  const users = localStorage.getItem(USERS_KEY);
  return users ? JSON.parse(users) : [];
};

export const saveUser = async (user: AdminUser): Promise<boolean> => {
  const users = await getAllUsers();
  // Se for atualização de senha do próprio admin ou outro usuário existente
  if (users.some(u => u.username === user.username)) {
    // Permite atualização (password change)
  }
  
  if (supabase) await supabase.from('users').upsert({ username: user.username, data: user });
  
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

export const validateLogin = async (user: Pick<AdminUser, 'username' | 'password'>): Promise<AdminUser | null> => {
  const users = await getAllUsers();
  const found = users.find(u => u.username === user.username && u.password === user.password);
  return found || null;
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

// --- CRUD SHIPMENTS ---

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
      
      // Update Driver Mileage if GPS update occurred (Simulated)
      if (driver && driver.currentMileage && data.currentLocation.coordinates) {
          // Logic to update driver mileage would go here
      }
  }
  if (!data.company) data.company = 'RODOVAR';

  if (supabase) await supabase.from('shipments').upsert({ code: data.code, data: data });
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

// --- DEMO DATA POPULATION (10 VARIED EXAMPLES) ---
export const populateDemoData = async () => {
    const hasData = localStorage.getItem(STORAGE_KEY);
    if (hasData) return; // Prevent overwriting if data exists

    console.log("Creating Demo Data...");

    // 1. Drivers with Maintenance Data
    const drivers: Driver[] = [
        { 
            id: 'd1', name: 'Carlos Silva', phone: '71999998888', vehiclePlate: 'RDO-1001', 
            currentMileage: 49600, nextMaintenanceMileage: 50000, // OK
            photoUrl: 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400&auto=format&fit=crop&q=60' 
        },
        { 
            id: 'd2', name: 'Pedro Santos', phone: '11988887777', vehiclePlate: 'AXD-2022', 
            currentMileage: 100100, nextMaintenanceMileage: 100000, // 🚨 URGENT: -100km
            photoUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=60' 
        },
        { 
            id: 'd3', name: 'Marcos Souza', phone: '21977776666', vehiclePlate: 'RDO-3003', 
            currentMileage: 74800, nextMaintenanceMileage: 75000, // ⚠️ WARNING: 200km left
            photoUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400&auto=format&fit=crop&q=60' 
        },
        { 
            id: 'd4', name: 'Fernanda Lima', phone: '41966665555', vehiclePlate: 'AXD-4004', 
            currentMileage: 32000, nextMaintenanceMileage: 40000, // OK
            photoUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&auto=format&fit=crop&q=60' 
        },
        { 
            id: 'd5', name: 'Roberto Almeida', phone: '62955554444', vehiclePlate: 'RDO-5005', 
            currentMileage: 15000, nextMaintenanceMileage: 20000, // OK
            photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=60' 
        }
    ];

    for (const d of drivers) { await saveDriver(d); }

    // 2. Shipments (10 Examples)
    const shipments: TrackingData[] = [
        // 1. RODOVAR: Salvador -> Feira (Curta, Em Trânsito)
        {
            code: 'RODOVAR1001', company: 'RODOVAR', status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Simões Filho', state: 'BA', address: 'BR-324, km 22', coordinates: { lat: -12.7937, lng: -38.4042 } },
            origin: 'Salvador', destination: 'Feira de Santana', destinationAddress: 'CIS, Tomba', destinationCoordinates: { lat: -12.2733, lng: -38.9556 },
            lastUpdate: '10:30 - 25/10', estimatedDelivery: '25/10/2024', message: 'Tráfego intenso na saída de Salvador.',
            driverId: 'd1', driverName: 'Carlos Silva', driverPhoto: drivers[0].photoUrl, progress: 30
        },
        // 2. AXD: SP -> RJ (Interestadual, Entregue com Canhoto)
        {
            code: 'AXD2002', company: 'AXD', status: TrackingStatus.DELIVERED,
            currentLocation: { city: 'Rio de Janeiro', state: 'RJ', address: 'Av. Brasil', coordinates: { lat: -22.9068, lng: -43.1729 } },
            origin: 'São Paulo', destination: 'Rio de Janeiro', destinationAddress: 'Centro de Distribuição Pavuna', destinationCoordinates: { lat: -22.9068, lng: -43.1729 },
            lastUpdate: '14:00 - 24/10', estimatedDelivery: '24/10/2024', message: 'Entrega finalizada com sucesso.',
            driverId: 'd2', driverName: 'Pedro Santos', driverPhoto: drivers[1].photoUrl, progress: 100,
            proof: {
                receiverName: 'João Ferreira', receiverDoc: '123.456.789-00', timestamp: new Date().toISOString(),
                location: { lat: -22.9068, lng: -43.1729 },
                signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', // Placeholder
                photoBase64: 'https://placehold.co/600x400/png?text=Entrega+Recebida'
            }
        },
        // 3. RODOVAR: Recife -> Salvador (Longa, Parado)
        {
            code: 'RODOVAR1003', company: 'RODOVAR', status: TrackingStatus.STOPPED,
            currentLocation: { city: 'Maceió', state: 'AL', address: 'Posto de Combustível BR', coordinates: { lat: -9.6662, lng: -35.7351 } },
            origin: 'Recife', destination: 'Salvador', destinationCoordinates: { lat: -12.9777, lng: -38.5016 },
            lastUpdate: '12:15 - 25/10', estimatedDelivery: '26/10/2024', message: 'Motorista em horário de almoço.',
            driverId: 'd3', driverName: 'Marcos Souza', driverPhoto: drivers[2].photoUrl, progress: 45
        },
        // 4. AXD: Curitiba -> Florianópolis (Sul, Multiparada, Em Trânsito)
        {
            code: 'AXD2004', company: 'AXD', status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Joinville', state: 'SC', address: 'BR-101 Sul', coordinates: { lat: -26.3045, lng: -48.8487 } },
            origin: 'Curitiba', destination: 'Florianópolis', destinationCoordinates: { lat: -27.5954, lng: -48.5480 },
            stops: [{ id: 's1', city: 'Joinville', address: 'Distrito Industrial', coordinates: { lat: -26.3045, lng: -48.8487 }, completed: true, order: 1 }],
            lastUpdate: '09:45 - 25/10', estimatedDelivery: '25/10/2024', message: 'Saiu de Joinville, indo para capital.',
            driverId: 'd4', driverName: 'Fernanda Lima', driverPhoto: drivers[3].photoUrl, progress: 60
        },
        // 5. RODOVAR: BH -> Brasília (Centro-Oeste, Em Trânsito)
        {
            code: 'RODOVAR1005', company: 'RODOVAR', status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Paracatu', state: 'MG', address: 'BR-040', coordinates: { lat: -17.2222, lng: -46.8742 } },
            origin: 'Belo Horizonte', destination: 'Brasília', destinationCoordinates: { lat: -15.7975, lng: -47.8919 },
            lastUpdate: '11:00 - 25/10', estimatedDelivery: '26/10/2024', message: 'Previsão de chegada amanhã cedo.',
            driverId: 'd5', driverName: 'Roberto Almeida', driverPhoto: drivers[4].photoUrl, progress: 55
        },
        // 6. AXD: Fortaleza -> Natal (Nordeste, Entregue)
        {
            code: 'AXD2006', company: 'AXD', status: TrackingStatus.DELIVERED,
            currentLocation: { city: 'Natal', state: 'RN', coordinates: { lat: -5.7945, lng: -35.2110 } },
            origin: 'Fortaleza', destination: 'Natal', destinationCoordinates: { lat: -5.7945, lng: -35.2110 },
            lastUpdate: '08:00 - 23/10', estimatedDelivery: '23/10/2024', message: 'Entregue na loja matriz.',
            driverId: 'd1', driverName: 'Carlos Silva', driverPhoto: drivers[0].photoUrl, progress: 100,
            proof: { receiverName: 'Ana Souza', receiverDoc: '999.888.777-66', timestamp: new Date().toISOString(), location: { lat: -5.7945, lng: -35.2110 }, signatureBase64: '', photoBase64: '' }
        },
        // 7. RODOVAR: Manaus -> Belém (Norte, Logística Complexa, Parado)
        {
            code: 'RODOVAR1007', company: 'RODOVAR', status: TrackingStatus.STOPPED,
            currentLocation: { city: 'Santarém', state: 'PA', coordinates: { lat: -2.4430, lng: -54.7081 } },
            origin: 'Manaus', destination: 'Belém', destinationCoordinates: { lat: -1.4558, lng: -48.4902 },
            lastUpdate: '15:00 - 24/10', estimatedDelivery: '30/10/2024', message: 'Aguardando balsa para travessia.',
            driverId: 'd3', driverName: 'Marcos Souza', driverPhoto: drivers[2].photoUrl, progress: 40
        },
        // 8. AXD: Goiânia -> Cuiabá (Agro, Em Trânsito)
        {
            code: 'AXD2008', company: 'AXD', status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Jataí', state: 'GO', coordinates: { lat: -17.8814, lng: -51.7144 } },
            origin: 'Goiânia', destination: 'Cuiabá', destinationCoordinates: { lat: -15.6014, lng: -56.0979 },
            lastUpdate: '13:30 - 25/10', estimatedDelivery: '26/10/2024', message: 'Carga de grãos em movimento.',
            driverId: 'd5', driverName: 'Roberto Almeida', driverPhoto: drivers[4].photoUrl, progress: 35
        },
        // 9. RODOVAR: Vitória -> Rio de Janeiro (Litoral, Entregue)
        {
            code: 'RODOVAR1009', company: 'RODOVAR', status: TrackingStatus.DELIVERED,
            currentLocation: { city: 'Campos dos Goytacazes', state: 'RJ', coordinates: { lat: -21.7622, lng: -41.3257 } },
            origin: 'Vitória', destination: 'Rio de Janeiro', destinationCoordinates: { lat: -22.9068, lng: -43.1729 },
            lastUpdate: '18:00 - 24/10', estimatedDelivery: '24/10/2024', message: 'Finalizado no porto.',
            driverId: 'd4', driverName: 'Fernanda Lima', driverPhoto: drivers[3].photoUrl, progress: 100
        },
        // 10. AXD: Porto Alegre -> Caxias do Sul (Serra Gaúcha, Em Trânsito)
        {
            code: 'AXD2010', company: 'AXD', status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Novo Hamburgo', state: 'RS', coordinates: { lat: -29.6842, lng: -51.1278 } },
            origin: 'Porto Alegre', destination: 'Caxias do Sul', destinationCoordinates: { lat: -29.1678, lng: -51.1794 },
            lastUpdate: '07:30 - 25/10', estimatedDelivery: '25/10/2024', message: 'Subindo a serra.',
            driverId: 'd2', driverName: 'Pedro Santos', driverPhoto: drivers[1].photoUrl, progress: 20
        }
    ];

    for (const s of shipments) { await saveShipment(s); }
};
