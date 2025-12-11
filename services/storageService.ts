
import { TrackingData, Coordinates, AdminUser, Driver, CompanySettings, RouteStop, ProofOfDelivery, TrackingStatus } from '../types';
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
    if (supabase) await supabase.from('users').upsert({ username: 'GLOBAL_SETTINGS', data: settings });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

// --- USER & AUTH SERVICE ---
const initUsers = () => {
  const users = localStorage.getItem(USERS_KEY);
  if (!users) {
    const defaultUser: AdminUser = { username: 'admin', email: 'admin@rodovar.com', role: 'MASTER' };
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
        if (!error && data) {
            // Garante que retorna um array válido mesmo se vazio
            return data.map((row: any) => row.data);
        }
      } catch (e) {
          console.error("Erro ao buscar motoristas:", e);
      }
  }
  const drivers = localStorage.getItem(DRIVERS_KEY);
  return drivers ? JSON.parse(drivers) : [];
};

export const saveDriver = async (driver: Driver): Promise<boolean> => {
  const drivers = await getAllDrivers();
  // Check duplicate name if creating new ID
  const existing = drivers.find(d => d.id === driver.id);
  if (!existing && drivers.some(d => d.name.toLowerCase() === driver.name.toLowerCase())) {
     // Permite salvar se for o mesmo ID (update), bloqueia se for novo ID com nome igual
     return false; 
  }

  if (supabase) {
      const { error } = await supabase.from('drivers').upsert({ id: driver.id, data: driver });
      if (error) console.error("Erro ao salvar motorista no Supabase:", error);
  }
  
  // Atualiza cache local
  const newDrivers = drivers.filter(d => d.id !== driver.id);
  newDrivers.push(driver);
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(newDrivers));
  return true;
};

export const deleteDriver = async (id: string): Promise<void> => {
  if (supabase) await supabase.from('drivers').delete().eq('id', id);
  let drivers = await getAllDrivers();
  drivers = drivers.filter(d => d.id !== id);
  localStorage.setItem(DRIVERS_KEY, JSON.stringify(drivers));
};

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
            if (dist < minDist) {
                minDist = dist;
                nearestIdx = idx;
            }
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
      await supabase.from('shipments').upsert({ code: data.code, data: data });
  }
  
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

// --- DATA POPULATION (TEST SCENARIOS) ---
export const populateDemoData = async () => {
    console.log("🛠️ Verificando dados de teste...");

    // 1. DEFINIÇÃO DOS DADOS DE TESTE (CENÁRIOS)
    
    // Motoristas
    const demoDrivers: Driver[] = [
        {
            id: 'd1',
            name: 'Carlos Silva',
            phone: '11999998888',
            vehiclePlate: 'ABC-1234',
            currentMileage: 50000,
            nextMaintenanceMileage: 60000,
            photoUrl: 'https://randomuser.me/api/portraits/men/32.jpg'
        },
        {
            id: 'd2',
            name: 'Roberto Otimiza',
            phone: '41988887777',
            vehiclePlate: 'ROT-9090',
            currentMileage: 20000,
            nextMaintenanceMileage: 30000,
            photoUrl: 'https://randomuser.me/api/portraits/men/45.jpg'
        },
        {
            id: 'd3',
            name: 'Fernanda Manut',
            phone: '21977776666',
            vehiclePlate: 'MAN-5050',
            currentMileage: 59600, // Crítico (<500km para 60000)
            nextMaintenanceMileage: 60000,
            photoUrl: 'https://randomuser.me/api/portraits/women/44.jpg'
        },
        {
            id: 'd4',
            name: 'João SOS',
            phone: '31966665555',
            vehiclePlate: 'SOS-1900',
            currentMileage: 10000,
            nextMaintenanceMileage: 20000,
            photoUrl: 'https://randomuser.me/api/portraits/men/12.jpg'
        }
    ];

    // Cargas
    const demoShipments: Record<string, TrackingData> = {
        'RODOVAR1001': {
            code: 'RODOVAR1001',
            company: 'RODOVAR',
            status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Resende', state: 'RJ', address: 'Rodovia Dutra', coordinates: { lat: -22.4704, lng: -44.4519 } },
            origin: 'São Paulo',
            destination: 'Rio de Janeiro',
            destinationCoordinates: { lat: -22.9068, lng: -43.1729 },
            driverId: 'd1',
            driverName: 'Carlos Silva',
            driverPhoto: 'https://randomuser.me/api/portraits/men/32.jpg',
            lastUpdate: 'Agora',
            estimatedDelivery: '25/12/2024',
            message: 'Caminho Feliz: Em trânsito normal.',
            progress: 60,
            isLive: true
        },
        'RODOVAR2002': {
            code: 'RODOVAR2002',
            company: 'AXD',
            status: TrackingStatus.PENDING,
            currentLocation: { city: 'Curitiba', state: 'PR', coordinates: { lat: -25.4284, lng: -49.2733 } },
            origin: 'Curitiba',
            destination: 'Florianópolis',
            destinationCoordinates: { lat: -27.5954, lng: -48.5480 },
            stops: [
                { id: 's1', city: 'Joinville', address: 'Centro', completed: false, order: 2, coordinates: { lat: -26.3044, lng: -48.8464 } },
                { id: 's2', city: 'São José dos Pinhais', address: 'Aeroporto', completed: false, order: 1, coordinates: { lat: -25.5302, lng: -49.2030 } }
            ],
            driverId: 'd2',
            driverName: 'Roberto Otimiza',
            lastUpdate: 'Hoje',
            estimatedDelivery: '30/12/2024',
            message: 'Rota Complexa: Paradas otimizadas.',
            progress: 0
        },
        'RODOVAR3003': {
            code: 'RODOVAR3003',
            company: 'RODOVAR',
            status: TrackingStatus.IN_TRANSIT,
            currentLocation: { city: 'Campinas', state: 'SP', coordinates: { lat: -22.9099, lng: -47.0626 } },
            origin: 'Campinas',
            destination: 'Santos',
            destinationCoordinates: { lat: -23.9618, lng: -46.3322 },
            driverId: 'd3',
            driverName: 'Fernanda Manut',
            lastUpdate: 'Há 1 hora',
            estimatedDelivery: 'Amanhã',
            message: 'Alerta de Manutenção: Veículo próximo da revisão.',
            progress: 10
        },
        'RODOVAR4004': {
            code: 'RODOVAR4004',
            company: 'RODOVAR',
            status: TrackingStatus.STOPPED,
            currentLocation: { city: 'Belo Horizonte', state: 'MG', coordinates: { lat: -19.9167, lng: -43.9345 } },
            origin: 'Betim',
            destination: 'Vitória',
            destinationCoordinates: { lat: -20.3155, lng: -40.3128 },
            driverId: 'd4',
            driverName: 'João SOS',
            lastUpdate: 'Agora mesmo',
            estimatedDelivery: '--',
            message: 'SOS: Veículo parado por problema mecânico.',
            progress: 20,
            isLive: true
        },
        'RODOVAR5005': {
            code: 'RODOVAR5005',
            company: 'RODOVAR',
            status: TrackingStatus.DELIVERED,
            currentLocation: { city: 'Salvador', state: 'BA', coordinates: { lat: -12.9777, lng: -38.5016 } },
            origin: 'Feira de Santana',
            destination: 'Salvador',
            destinationCoordinates: { lat: -12.9777, lng: -38.5016 },
            lastUpdate: 'Ontem',
            estimatedDelivery: 'Finalizado',
            message: 'Entrega Realizada com Sucesso.',
            progress: 100,
            proof: {
                receiverName: 'Empresa Teste LTDA',
                receiverDoc: '00.000.000/0001-99',
                signatureBase64: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', // Pixel transparente placeholder
                timestamp: new Date().toISOString(),
                location: { lat: -12.9777, lng: -38.5016 }
            }
        }
    };

    // 2. POPULAR LOCALSTORAGE (SEMPRE GARANTIR DADOS LOCAIS)
    const storedDrivers = localStorage.getItem(DRIVERS_KEY);
    if (!storedDrivers || JSON.parse(storedDrivers).length === 0) {
        localStorage.setItem(DRIVERS_KEY, JSON.stringify(demoDrivers));
    }
    
    const storedShipments = localStorage.getItem(STORAGE_KEY);
    if (!storedShipments || Object.keys(JSON.parse(storedShipments)).length === 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demoShipments));
    }

    // 3. POPULAR SUPABASE (SE CONECTADO E VAZIO)
    if (supabase) {
        try {
            // Verifica Motoristas
            const { data: driversData, error: dErr } = await supabase.from('drivers').select('id');
            if (!dErr && (!driversData || driversData.length === 0)) {
                console.log("☁️ Supabase vazio (Motoristas). Inserindo Demo Data...");
                for (const d of demoDrivers) {
                    await supabase.from('drivers').upsert({ id: d.id, data: d });
                }
            }

            // Verifica Cargas
            const { data: shipData, error: sErr } = await supabase.from('shipments').select('code');
            if (!sErr && (!shipData || shipData.length === 0)) {
                console.log("☁️ Supabase vazio (Cargas). Inserindo Demo Data...");
                for (const s of Object.values(demoShipments)) {
                    await supabase.from('shipments').upsert({ code: s.code, data: s });
                }
            }
        } catch (e) {
            console.error("Erro ao popular Supabase:", e);
        }
    }
};
