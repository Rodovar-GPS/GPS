
export enum TrackingStatus {
  PENDING = 'PENDING',
  IN_TRANSIT = 'IN_TRANSIT',
  STOPPED = 'STOPPED', // Parado
  DELIVERED = 'DELIVERED',
  DELAYED = 'DELAYED',
  EXCEPTION = 'EXCEPTION'
}

export const StatusLabels: Record<TrackingStatus, string> = {
  [TrackingStatus.PENDING]: 'Aguardando Coleta',
  [TrackingStatus.IN_TRANSIT]: 'Em Trânsito',
  [TrackingStatus.STOPPED]: 'PARADO',
  [TrackingStatus.DELIVERED]: 'Entregue / Finalizado',
  [TrackingStatus.DELAYED]: 'Atrasado',
  [TrackingStatus.EXCEPTION]: 'Problema / Retido'
};

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface UserAddress {
  road?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  formatted?: string;
}

export interface Expense {
  id: string;
  category: 'Combustível' | 'Manutenção' | 'Alimentação' | 'Outros';
  description: string;
  value: number;
  date: string;
}

export interface Driver {
  id: string;
  name: string; 
  password?: string; 
  phone?: string;
  photoUrl?: string; 
  // Vehicle & Maintenance Data
  vehiclePlate?: string;
  currentMileage?: number; // Km atuais do caminhão
  nextMaintenanceMileage?: number; // Km da próxima troca de óleo/revisão
}

export interface CompanySettings {
  name: string;
  slogan: string;
  logoUrl?: string; 
  primaryColor?: string; 
  backgroundColor?: string; 
  cardColor?: string; 
  textColor?: string; 
}

export interface RouteStop {
  id: string;
  address: string;
  city: string;
  coordinates: Coordinates;
  completed: boolean;
  order: number; // For optimization
}

export interface ProofOfDelivery {
  receiverName: string;
  receiverDoc: string;
  signatureBase64: string;
  photoBase64?: string;
  timestamp: string;
  location: Coordinates;
}

export interface TrackingData {
  code: string;
  company: 'RODOVAR' | 'AXD';
  status: TrackingStatus;
  loadType?: string; // NOVO CAMPO
  isLive?: boolean; 
  currentLocation: {
    city: string;
    state: string;
    address?: string; 
    coordinates: Coordinates;
  };
  origin: string;
  destination: string;
  destinationAddress?: string; 
  destinationCoordinates?: Coordinates; 
  
  // Intelligent Routing
  stops?: RouteStop[]; // Lista de paradas otimizadas

  lastUpdate: string;
  lastUpdatedBy?: string; 
  estimatedDelivery: string;
  message: string;
  notes?: string; 
  progress: number; 

  driverId?: string; 
  driverName?: string; 
  driverPhoto?: string; 

  driverNotes?: string;
  expenses?: Expense[];
  maintenanceCost?: number;
  fuelCost?: number;

  proof?: ProofOfDelivery; // Comprovante Digital
}

export type UserRole = 'MASTER' | 'BASIC';

export interface AdminUser {
  username: string;
  password: string;
  role: UserRole; // Nível de acesso
}
