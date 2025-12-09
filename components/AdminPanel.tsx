
import React, { useState, useEffect, useRef } from 'react';
import { TrackingData, TrackingStatus, StatusLabels, AdminUser, Expense, Driver, CompanySettings, RouteStop, UserRole } from '../types';
import { 
    saveShipment, getAllShipments, deleteShipment, 
    getCoordinatesForCity, getCoordinatesForString, calculateProgress,
    saveUser, getAllUsers, deleteUser,
    getAllDrivers, saveDriver, deleteDriver, generateUniqueCode,
    getCompanySettings, saveCompanySettings, checkFleetMaintenance, optimizeRoute
} from '../services/storageService';
import { TruckIcon, MapPinIcon, SearchIcon, SteeringWheelIcon, WhatsAppIcon, CameraIcon, UploadIcon, UserIcon, TrashIcon, CheckCircleIcon, ClockIcon, CalendarIcon, ChartBarIcon, PencilIcon, EyeIcon, EyeSlashIcon } from './Icons';

interface AdminPanelProps {
  onClose: () => void;
  currentUser: string;
}

type Tab = 'shipments' | 'users' | 'drivers' | 'settings' | 'history';

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, currentUser }) => {
  const [activeTab, setActiveTab] = useState<Tab>('shipments');
  const [userRole, setUserRole] = useState<UserRole>('BASIC');
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<string[]>([]);

  // Check current user role to determine access
  useEffect(() => {
      const checkRole = async () => {
          const allUsers = await getAllUsers();
          const me = allUsers.find(u => u.username === currentUser);
          if (me) {
              setUserRole(me.role || 'BASIC');
          } else if (currentUser === 'admin') {
              setUserRole('MASTER');
          }
      };
      checkRole();
      loadFleetAlerts();
  }, [currentUser]);

  const isMaster = userRole === 'MASTER';

  const loadFleetAlerts = async () => {
      const alerts = await checkFleetMaintenance();
      setMaintenanceAlerts(alerts);
  };

  // --- HELPER: DATES ---
  const getNowFormatted = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} - ${day}/${month}/${year}`;
  };

  const getFutureDateInputFormat = (daysToAdd: number) => {
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const formatDateToBr = (isoDate: string) => {
      if (!isoDate) return '';
      const [year, month, day] = isoDate.split('-');
      return `${day}/${month}/${year}`;
  };

  const formatDateFromBr = (brDate: string) => {
      if (!brDate) return '';
      const parts = brDate.split('/');
      if (parts.length !== 3) return '';
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // --- STATES FOR SHIPMENTS ---
  const [shipments, setShipments] = useState<Record<string, TrackingData>>({});
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false); 
  const [isEditing, setIsEditing] = useState(false); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<'RODOVAR' | 'AXD'>('RODOVAR');

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<TrackingStatus>(TrackingStatus.IN_TRANSIT);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [message, setMessage] = useState('Carga em deslocamento para o destino.');
  const [notes, setNotes] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState(''); 
  const [driverNotes, setDriverNotes] = useState('');
  const [expensesList, setExpensesList] = useState<Expense[]>([]);
  const [estimatedDateInput, setEstimatedDateInput] = useState(getFutureDateInputFormat(3));
  const [updateTime, setUpdateTime] = useState(getNowFormatted());
  const [displayProgress, setDisplayProgress] = useState(0);

  // ROUTE OPTIMIZATION STATES
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [newStopAddress, setNewStopAddress] = useState('');
  const [newStopCity, setNewStopCity] = useState('');

  // --- STATES FOR USERS ---
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('BASIC');
  const [userMsg, setUserMsg] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null); // For editing user
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  // --- STATES FOR DRIVERS ---
  const [drivers, setDrivers] = useState<Driver[]>([]);
  // Edit State for Driver
  const [editDriverId, setEditDriverId] = useState<string | null>(null);

  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverPhoto, setNewDriverPhoto] = useState('');
  const [newDriverPlate, setNewDriverPlate] = useState('');
  const [newDriverMileage, setNewDriverMileage] = useState('');
  const [newDriverNextMaintenance, setNewDriverNextMaintenance] = useState('');

  const [driverMsg, setDriverMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- STATES FOR SETTINGS ---
  const [companyName, setCompanyName] = useState('RODOVAR');
  const [companySlogan, setCompanySlogan] = useState('Logística Inteligente');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#FFD700');
  const [backgroundColor, setBackgroundColor] = useState('#121212');
  const [cardColor, setCardColor] = useState('#1E1E1E');
  const [textColor, setTextColor] = useState('#F5F5F5');
  const [settingsMsg, setSettingsMsg] = useState('');

  // --- HISTORY FILTER STATES ---
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | 'DELIVERED' | 'TRANSIT'>('ALL');


  useEffect(() => {
    loadShipments();
    loadUsers();
    loadDrivers();
    loadSettings();
  }, []);

  useEffect(() => {
    if (!isEditing && activeTab === 'shipments' && !code) {
        generateNewCode(selectedCompany);
    }
  }, [shipments, isEditing, activeTab]);

  const generateNewCode = async (company: 'RODOVAR' | 'AXD') => {
      const nextCode = await generateUniqueCode(company);
      setCode(nextCode);
      setUpdateTime(getNowFormatted());
      setEstimatedDateInput(getFutureDateInputFormat(3));
  };

  const handleCompanyChange = (company: 'RODOVAR' | 'AXD') => {
      setSelectedCompany(company);
      if (!isEditing) {
          generateNewCode(company);
      }
  };

  const loadShipments = async () => {
    setLoading(true);
    const data = await getAllShipments();
    setShipments(data);
    setLoading(false);
  };

  const loadUsers = async () => {
    if (isMaster) {
      setUsers(await getAllUsers());
    }
  };

  const loadDrivers = async () => {
    setDrivers(await getAllDrivers());
  };

  const loadSettings = async () => {
    const settings = await getCompanySettings();
    setCompanyName(settings.name);
    setCompanySlogan(settings.slogan);
    setCompanyLogoUrl(settings.logoUrl || '');
    setPrimaryColor(settings.primaryColor || '#FFD700');
    setBackgroundColor(settings.backgroundColor || '#121212');
    setCardColor(settings.cardColor || '#1E1E1E');
    setTextColor(settings.textColor || '#F5F5F5');
  };

  const resetForm = () => {
      setIsEditing(false);
      setSelectedCompany('RODOVAR');
      generateNewCode('RODOVAR'); 
      setStatus(TrackingStatus.IN_TRANSIT);
      setCity('');
      setState('');
      setAddress('');
      setOrigin('');
      setDestination('');
      setDestinationAddress('');
      setMessage('Carga em deslocamento para o destino.');
      setNotes('');
      setDisplayProgress(0);
      setSelectedDriverId('');
      setDriverNotes('');
      setExpensesList([]);
      setRouteStops([]);
      setNewStopAddress('');
      setNewStopCity('');
      setEstimatedDateInput(getFutureDateInputFormat(3));
  };

  const handleGetDriverLocation = () => {
    if (!navigator.geolocation) {
        alert("Geolocalização não suportada.");
        return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const { latitude, longitude } = position.coords;
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
                );
                const data = await response.json();
                if (data && data.address) {
                    const foundCity = data.address.city || data.address.town || data.address.village || '';
                    const foundState = data.address.state || '';
                    const foundAddress = data.address.road || '';
                    setCity(foundCity);
                    setState(foundState);
                    setAddress(foundAddress);
                    setUpdateTime(getNowFormatted()); 
                } else {
                    alert("Endereço não encontrado.");
                }
            } catch (error) {
                alert("Erro ao converter coordenadas.");
            } finally {
                setGpsLoading(false);
            }
        },
        (error) => {
            setGpsLoading(false);
            alert("Erro GPS: " + error.message);
        },
        { enableHighAccuracy: true }
    );
  };

  // --- ROUTE STOPS LOGIC ---
  const handleAddStop = async () => {
      if (!newStopAddress || !newStopCity) return alert("Informe endereço e cidade para adicionar parada.");
      setLoading(true);
      try {
          const coords = await getCoordinatesForString(newStopCity, newStopAddress);
          const newStop: RouteStop = {
              id: Date.now().toString(),
              address: newStopAddress,
              city: newStopCity,
              coordinates: coords,
              completed: false,
              order: routeStops.length + 1
          };
          setRouteStops([...routeStops, newStop]);
          setNewStopAddress('');
          setNewStopCity('');
      } catch (e) { alert("Erro ao geolocalizar parada."); }
      setLoading(false);
  };

  const handleRemoveStop = (id: string) => {
      setRouteStops(routeStops.filter(s => s.id !== id));
  };

  const handleSaveShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !city || !state || !origin || !destination) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    setLoading(true);

    try {
        const currentCoords = await getCoordinatesForCity(city, state);
        const originCoords = await getCoordinatesForString(origin);
        const destCoords = await getCoordinatesForString(destination, destinationAddress);
        
        // --- INTELLIGENT OPTIMIZATION ---
        // Se houver paradas, otimiza a ordem usando Nearest Neighbor a partir da Origem
        let finalStops = routeStops;
        if (routeStops.length > 0) {
            finalStops = optimizeRoute(originCoords, routeStops);
        }

        const calculatedProgress = calculateProgress(originCoords, destCoords, currentCoords);
        setDisplayProgress(calculatedProgress);

        const assignedDriver = drivers.find(d => d.id === selectedDriverId);
        const finalDate = formatDateToBr(estimatedDateInput);

        const newData: TrackingData = {
            code: code.toUpperCase(),
            company: selectedCompany,
            status,
            currentLocation: {
                city,
                state: state.toUpperCase(),
                address,
                coordinates: currentCoords
            },
            origin,
            destination,
            destinationAddress,
            destinationCoordinates: destCoords, 
            
            stops: finalStops, // Rota Otimizada

            lastUpdate: updateTime,
            lastUpdatedBy: currentUser,
            estimatedDelivery: finalDate,
            message,
            notes,
            progress: calculatedProgress,
            isLive: isEditing ? shipments[code]?.isLive : false,
            
            driverId: selectedDriverId,
            driverName: assignedDriver ? assignedDriver.name : undefined,
            driverPhoto: assignedDriver ? assignedDriver.photoUrl : undefined,
            driverNotes,
            expenses: expensesList,
            maintenanceCost: 0,
            fuelCost: 0
        };

        await saveShipment(newData);
        await loadShipments(); 
        
        alert(`✅ Rota ${finalStops.length > 0 ? 'OTIMIZADA e ' : ''}salva com sucesso!`);
        
        if (!isEditing) {
            resetForm();
        }
    } catch (err) {
        console.error(err);
        alert("Erro ao processar a solicitação.");
    } finally {
        setLoading(false);
    }
  };

  const handleEditShipment = (data: TrackingData) => {
    setActiveTab('shipments');
    setIsEditing(true);
    setSelectedCompany(data.company || 'RODOVAR');
    setCode(data.code);
    setStatus(data.status);
    setCity(data.currentLocation.city);
    setState(data.currentLocation.state);
    setAddress(data.currentLocation.address || '');
    setOrigin(data.origin);
    setDestination(data.destination);
    setDestinationAddress(data.destinationAddress || '');
    setMessage(data.message);
    setNotes(data.notes || '');
    setDisplayProgress(data.progress);
    setRouteStops(data.stops || []);
    
    setEstimatedDateInput(formatDateFromBr(data.estimatedDelivery));
    setUpdateTime(getNowFormatted());
    setSelectedDriverId(data.driverId || '');
    setDriverNotes(data.driverNotes || '');
    setExpensesList(data.expenses || []);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
      resetForm();
  };

  const handleDeleteShipment = async (codeToDelete: string) => {
    if (confirm(`Excluir carga ${codeToDelete}?`)) {
      await deleteShipment(codeToDelete);
      await loadShipments();
      if (code === codeToDelete) resetForm();
    }
  };

  // --- HANDLERS FOR USERS ---
  const handleEditUser = (user: AdminUser) => {
      setNewUsername(user.username);
      setNewPassword(user.password);
      setNewUserRole(user.role);
      setEditingUser(user.username);
      setUserMsg(`Editando: ${user.username}`);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMaster) return; 
    if (!newUsername || !newPassword) return;
    
    try {
        const success = await saveUser({ 
            username: newUsername, 
            password: newPassword,
            role: newUserRole
        });
        if (success) {
            setNewUsername('');
            setNewPassword('');
            setEditingUser(null);
            setUserMsg('✅ Usuário salvo com sucesso.');
            await loadUsers();
            setTimeout(() => setUserMsg(''), 3000);
        } else {
            // If editing, success might be false if username exists, but saveUser logic handles update if pwd changed
            // Actually storageService.saveUser returns false if exists and no change. 
            // Let's reload anyway.
            await loadUsers();
            setUserMsg('✅ Usuário atualizado.');
            setNewUsername('');
            setNewPassword('');
            setEditingUser(null);
            setTimeout(() => setUserMsg(''), 3000);
        }
    } catch (error) {
        setUserMsg('Erro ao salvar.');
    }
  };

  const togglePasswordVisibility = (username: string) => {
      const next = new Set(visiblePasswords);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      setVisiblePasswords(next);
  };

  const handleDeleteUser = async (username: string) => {
      if (!isMaster) return;
      if (confirm(`Remover "${username}"?`)) {
          await deleteUser(username);
          await loadUsers(); 
      }
  };

  // --- HANDLERS FOR DRIVERS ---
  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files[0]) {
          const file = event.target.files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
             const img = new Image();
             img.onload = () => {
                 const canvas = document.createElement('canvas');
                 const ctx = canvas.getContext('2d');
                 const MAX_WIDTH = 300;
                 const MAX_HEIGHT = 300;
                 let width = img.width;
                 let height = img.height;
                 if (width > height) {
                     if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                 } else {
                     if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                 }
                 canvas.width = width;
                 canvas.height = height;
                 ctx?.drawImage(img, 0, 0, width, height);
                 setNewDriverPhoto(canvas.toDataURL('image/jpeg', 0.8));
             };
             if (e.target?.result) img.src = e.target.result as string;
          };
          reader.readAsDataURL(file);
      }
  };

  const handleEditDriver = (driver: Driver) => {
      setEditDriverId(driver.id);
      setNewDriverName(driver.name);
      setNewDriverPhone(driver.phone || '');
      setNewDriverPhoto(driver.photoUrl || '');
      setNewDriverPlate(driver.vehiclePlate || '');
      setNewDriverMileage(driver.currentMileage?.toString() || '');
      setNewDriverNextMaintenance(driver.nextMaintenanceMileage?.toString() || '');
      setDriverMsg(`Editando motorista: ${driver.name}`);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isMaster) return alert("Apenas Master.");
      
      if (!newDriverName) return;
      
      const newDriver: Driver = {
          id: editDriverId || Date.now().toString(),
          name: newDriverName,
          phone: newDriverPhone,
          photoUrl: newDriverPhoto,
          vehiclePlate: newDriverPlate.toUpperCase(),
          currentMileage: newDriverMileage ? parseInt(newDriverMileage) : 0,
          nextMaintenanceMileage: newDriverNextMaintenance ? parseInt(newDriverNextMaintenance) : 0
      };

      const success = await saveDriver(newDriver);
      if (success) {
          setEditDriverId(null);
          setNewDriverName('');
          setNewDriverPhone('');
          setNewDriverPhoto('');
          setNewDriverPlate('');
          setNewDriverMileage('');
          setNewDriverNextMaintenance('');
          setDriverMsg('✅ Motorista salvo/atualizado.');
          await loadDrivers();
          setTimeout(() => setDriverMsg(''), 3000);
      } else {
          setDriverMsg('Erro ao salvar (Nome duplicado?).');
      }
  };

  const handleDeleteDriver = async (id: string) => {
      if (!isMaster) return;
      if (confirm("Remover motorista?")) {
          await deleteDriver(id);
          await loadDrivers();
      }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isMaster) return;

      const settings: CompanySettings = {
          name: companyName,
          slogan: companySlogan,
          logoUrl: companyLogoUrl,
          primaryColor,
          backgroundColor,
          cardColor,
          textColor
      };
      await saveCompanySettings(settings);
      setSettingsMsg('✅ Configurações salvas. Reiniciando...');
      setTimeout(() => window.location.reload(), 2000);
  };

  const filteredShipments = (Object.values(shipments) as TrackingData[]).filter(s => {
      const search = searchTerm.toUpperCase();
      return s.code.includes(search) || 
             s.currentLocation.city.toUpperCase().includes(search) ||
             (s.driverName && s.driverName.toUpperCase().includes(search));
  });

  const getFilteredHistory = () => {
      return (Object.values(shipments) as TrackingData[]).filter(s => {
          const matchSearch = s.code.includes(historySearch.toUpperCase()) || s.company?.toUpperCase().includes(historySearch.toUpperCase());
          if (!matchSearch) return false;

          if (historyStatusFilter === 'DELIVERED') return s.status === TrackingStatus.DELIVERED;
          if (historyStatusFilter === 'TRANSIT') return s.status !== TrackingStatus.DELIVERED;
          return true;
      });
  };

  // --- RENDER HELPERS ---
  
  const renderSettingsTab = () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Side */}
          <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700 shadow-xl">
             <h3 className="text-xl font-bold text-rodovar-white mb-6 border-b border-gray-700 pb-4 flex items-center gap-2">
                 <TruckIcon className="w-5 h-5 text-rodovar-yellow" /> 
                 Identidade Visual & Sistema
             </h3>
             <form onSubmit={handleSaveSettings} className="space-y-6">
                <div>
                    <label className="text-gray-400 text-xs font-bold uppercase mb-1 block">Nome da Empresa</label>
                    <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full bg-black/40 border border-gray-600 rounded p-3 text-white focus:border-rodovar-yellow outline-none transition-colors" placeholder="Nome da Empresa" />
                </div>
                <div>
                    <label className="text-gray-400 text-xs font-bold uppercase mb-1 block">Slogan Comercial</label>
                    <input value={companySlogan} onChange={e => setCompanySlogan(e.target.value)} className="w-full bg-black/40 border border-gray-600 rounded p-3 text-white focus:border-rodovar-yellow outline-none transition-colors" placeholder="Slogan" />
                </div>
                <div>
                    <label className="text-gray-400 text-xs font-bold uppercase mb-1 block">URL do Logotipo</label>
                    <input value={companyLogoUrl} onChange={e => setCompanyLogoUrl(e.target.value)} className="w-full bg-black/40 border border-gray-600 rounded p-3 text-white focus:border-rodovar-yellow outline-none transition-colors" placeholder="https://..." />
                </div>
                
                <div className="bg-black/20 p-4 rounded-xl border border-gray-700">
                    <h4 className="text-rodovar-yellow text-xs font-bold uppercase mb-3">Paleta de Cores do Tema</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-gray-500 text-[10px] uppercase block mb-1">Primária (Amarelo/Destaque)</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none" />
                                <span className="text-xs text-gray-300 font-mono">{primaryColor}</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px] uppercase block mb-1">Fundo (Background)</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none" />
                                <span className="text-xs text-gray-300 font-mono">{backgroundColor}</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px] uppercase block mb-1">Cartões (Card Color)</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={cardColor} onChange={e => setCardColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none" />
                                <span className="text-xs text-gray-300 font-mono">{cardColor}</span>
                            </div>
                        </div>
                         <div>
                            <label className="text-gray-500 text-[10px] uppercase block mb-1">Texto Principal</label>
                            <div className="flex items-center gap-2">
                                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-none" />
                                <span className="text-xs text-gray-300 font-mono">{textColor}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {settingsMsg && <p className="text-green-400 bg-green-900/20 p-3 rounded text-sm font-bold text-center border border-green-500/30">{settingsMsg}</p>}
                
                <button type="submit" className="w-full bg-rodovar-yellow text-black font-bold py-4 rounded-lg hover:bg-yellow-400 uppercase tracking-widest shadow-lg transition-transform active:scale-95">
                    Aplicar Mudanças
                </button>
             </form>
          </div>

          {/* Preview Side */}
          <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700 shadow-xl flex flex-col items-center justify-center opacity-90">
             <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-widest">Pré-visualização do App</h3>
             
             {/* Fake Phone UI */}
             <div className="w-[300px] h-[550px] rounded-[30px] border-8 border-gray-800 relative overflow-hidden shadow-2xl" style={{ backgroundColor: backgroundColor }}>
                 {/* Header Preview */}
                 <div className="h-16 flex items-center px-4 gap-2" style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                          <TruckIcon className="w-5 h-5 text-black" />
                      </div>
                      <div>
                          <h1 className="font-bold text-sm leading-tight" style={{ color: textColor }}>{companyName || 'EMPRESA'}</h1>
                          <p className="text-[8px] text-gray-400">{companySlogan || 'Slogan'}</p>
                      </div>
                 </div>

                 {/* Content Preview */}
                 <div className="p-4 space-y-4">
                     <div className="p-4 rounded-xl shadow-lg" style={{ backgroundColor: cardColor }}>
                         <div className="flex justify-between items-center mb-2">
                             <span className="font-mono font-bold" style={{ color: primaryColor }}>RODO-1234</span>
                             <span className="text-[8px] bg-green-500/20 text-green-400 px-2 py-1 rounded">EM TRÂNSITO</span>
                         </div>
                         <p className="text-xs font-bold" style={{ color: textColor }}>São Paulo - SP</p>
                         <p className="text-[10px] text-gray-400 mt-1">Atualizado há 10 min</p>
                     </div>

                     <div className="p-4 rounded-xl shadow-lg flex items-center gap-3" style={{ backgroundColor: cardColor }}>
                          <div className="w-10 h-10 rounded-full bg-gray-700"></div>
                          <div>
                              <p className="text-xs font-bold" style={{ color: textColor }}>Motorista</p>
                              <p className="text-[10px] text-gray-400">Placa: ABC-1234</p>
                          </div>
                     </div>
                     
                     <div className="mt-8 flex justify-center">
                         <button className="px-6 py-2 rounded-full font-bold text-xs shadow-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
                             RASTREAR AGORA
                         </button>
                     </div>
                 </div>

                 {/* Navbar Preview */}
                 <div className="absolute bottom-0 w-full h-12 bg-black/40 backdrop-blur flex justify-around items-center px-4">
                      <div className="w-8 h-1 rounded bg-gray-600"></div>
                 </div>
             </div>
          </div>
      </div>
  );

  const renderUsersTab = () => (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700 h-fit shadow-xl">
              <h3 className="text-lg font-bold text-rodovar-white mb-6 border-b border-gray-700 pb-2">
                  {editingUser ? `Editando: ${editingUser}` : 'Novo Acesso Administrativo'}
              </h3>
              <form onSubmit={handleSaveUser} className="space-y-4">
                  <div>
                      <label className="text-gray-400 text-xs font-bold uppercase mb-1 block">Nome de Usuário</label>
                      <input value={newUsername} onChange={e => setNewUsername(e.target.value)} readOnly={!!editingUser} className={`w-full bg-black/40 border border-gray-600 rounded p-3 text-white focus:border-rodovar-yellow transition-colors ${editingUser ? 'cursor-not-allowed opacity-70' : ''}`} placeholder="Ex: joao.silva" />
                  </div>
                  <div>
                      <label className="text-gray-400 text-xs font-bold uppercase mb-1 block">Senha de Acesso</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full bg-black/40 border border-gray-600 rounded p-3 text-white focus:border-rodovar-yellow transition-colors" placeholder="******" />
                  </div>
                  
                  <div className="bg-black/20 p-4 rounded-xl border border-gray-700">
                      <p className="text-xs text-rodovar-yellow uppercase font-bold mb-3 flex items-center gap-2"><UserIcon className="w-4 h-4" /> Nível de Permissão</p>
                      <div className="space-y-3">
                          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${newUserRole === 'MASTER' ? 'bg-rodovar-yellow/10 border-rodovar-yellow' : 'bg-transparent border-gray-700 hover:bg-gray-800'}`}>
                              <input type="radio" checked={newUserRole === 'MASTER'} onChange={() => setNewUserRole('MASTER')} className="accent-rodovar-yellow w-4 h-4" />
                              <div>
                                  <span className="text-sm font-bold text-white block">MASTER (Acesso Total)</span>
                                  <span className="text-[10px] text-gray-400">Gerencia usuários, financeiro, motoristas e configurações.</span>
                              </div>
                          </label>
                          <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${newUserRole === 'BASIC' ? 'bg-rodovar-yellow/10 border-rodovar-yellow' : 'bg-transparent border-gray-700 hover:bg-gray-800'}`}>
                              <input type="radio" checked={newUserRole === 'BASIC'} onChange={() => setNewUserRole('BASIC')} className="accent-rodovar-yellow w-4 h-4" />
                              <div>
                                  <span className="text-sm font-bold text-white block">BÁSICO (Operacional)</span>
                                  <span className="text-[10px] text-gray-400">Apenas cadastro e edição de cargas/rotas.</span>
                              </div>
                          </label>
                      </div>
                  </div>

                  {userMsg && <p className="text-green-400 font-bold text-sm text-center">{userMsg}</p>}
                  <button type="submit" className="w-full bg-gray-700 text-white font-bold py-3 rounded hover:bg-gray-600 uppercase transition-colors">
                      {editingUser ? 'Atualizar Usuário' : 'Criar Usuário'}
                  </button>
                  {editingUser && (
                      <button type="button" onClick={() => { setEditingUser(null); setNewUsername(''); setNewPassword(''); setUserMsg(''); }} className="w-full text-xs text-gray-400 mt-2 hover:text-white">Cancelar Edição</button>
                  )}
              </form>
          </div>
          
          <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700 shadow-xl">
              <h3 className="text-lg font-bold text-rodovar-white mb-6 border-b border-gray-700 pb-2">Administradores Ativos</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {users.map(u => (
                      <div key={u.username} className="group flex justify-between items-start p-4 bg-black/20 rounded-xl border border-gray-800 hover:border-gray-600 transition-all">
                          <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${u.role === 'MASTER' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-black' : 'bg-gradient-to-br from-gray-600 to-gray-800 text-white'}`}>
                                  {u.username.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                  <span className="text-white font-bold block">{u.username}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${u.role === 'MASTER' ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-700' : 'bg-gray-700 text-gray-300'}`}>
                                      {u.role || 'BASIC'}
                                  </span>
                                  {visiblePasswords.has(u.username) && (
                                      <div className="mt-1 text-xs text-gray-400 bg-black/50 px-2 py-1 rounded border border-gray-700">
                                          Senha: <span className="text-rodovar-yellow font-mono">{u.password}</span>
                                      </div>
                                  )}
                              </div>
                          </div>
                          
                          {isMaster && u.username !== 'admin' && (
                              <div className="flex gap-2">
                                  <button onClick={() => togglePasswordVisibility(u.username)} className="text-gray-500 hover:text-white p-2" title={visiblePasswords.has(u.username) ? "Ocultar Senha" : "Ver Senha"}>
                                      {visiblePasswords.has(u.username) ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                  </button>
                                  <button onClick={() => handleEditUser(u)} className="text-blue-500 hover:text-blue-400 p-2" title="Editar Permissões/Senha">
                                      <PencilIcon className="w-4 h-4" />
                                  </button>
                                  <button onClick={(e) => {e.preventDefault(); handleDeleteUser(u.username);}} className="text-red-500 hover:text-red-400 p-2" title="Remover Usuário">
                                      <TrashIcon className="w-4 h-4" />
                                  </button>
                              </div>
                          )}
                           {/* Master admin (admin) specific - can still view their own password if needed but not delete */}
                          {isMaster && u.username === 'admin' && (
                               <div className="flex gap-2">
                                   <button onClick={() => togglePasswordVisibility(u.username)} className="text-gray-500 hover:text-white p-2" title="Ver Minha Senha">
                                      {visiblePasswords.has(u.username) ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                  </button>
                                  <button onClick={() => handleEditUser(u)} className="text-blue-500 hover:text-blue-400 p-2" title="Editar Senha">
                                      <PencilIcon className="w-4 h-4" />
                                  </button>
                               </div>
                          )}
                      </div>
                  ))}
              </div>
          </div>
      </div>
  );

  const renderHistoryTab = () => {
      const historyItems = getFilteredHistory();
      
      return (
          <div className="space-y-6">
              <div className="bg-rodovar-gray p-4 rounded-xl border border-gray-700 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg">
                   <div className="flex items-center gap-2 w-full md:w-auto">
                        <ChartBarIcon className="w-5 h-5 text-rodovar-yellow" />
                        <h3 className="text-lg font-bold text-white uppercase">Histórico de Viagens</h3>
                   </div>
                   <div className="flex gap-4 w-full md:w-auto">
                       <input 
                          value={historySearch} 
                          onChange={e => setHistorySearch(e.target.value)} 
                          placeholder="Buscar por Código ou Empresa..." 
                          className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:border-rodovar-yellow outline-none w-full md:w-64"
                       />
                       <select 
                          value={historyStatusFilter} 
                          onChange={e => setHistoryStatusFilter(e.target.value as any)}
                          className="bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-white text-sm focus:border-rodovar-yellow outline-none"
                       >
                           <option value="ALL">Todos os Status</option>
                           <option value="DELIVERED">Entregues / Finalizados</option>
                           <option value="TRANSIT">Em Trânsito / Pendentes</option>
                       </select>
                   </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                  {historyItems.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 bg-rodovar-gray rounded-xl border border-gray-700 border-dashed">
                          <p>Nenhuma viagem encontrada com os filtros atuais.</p>
                      </div>
                  ) : (
                      historyItems.map((item) => (
                          <div key={item.code} className="bg-rodovar-gray rounded-xl border border-gray-700 overflow-hidden shadow-lg hover:border-rodovar-yellow transition-all duration-300 group">
                              <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
                                  
                                  {/* Left: Code & Status */}
                                  <div className="md:col-span-3 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-700 pb-4 md:pb-0 md:pr-4">
                                       <div>
                                           <div className="flex items-center gap-2 mb-2">
                                               <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${item.company === 'AXD' ? 'bg-blue-900 text-blue-200' : 'bg-yellow-900 text-yellow-200'}`}>
                                                   {item.company || 'RODOVAR'}
                                               </span>
                                               <span className="text-xs text-gray-500 font-mono">{formatDateFromBr(item.estimatedDelivery)}</span>
                                           </div>
                                           <h4 className="text-2xl font-black text-white tracking-tighter">{item.code}</h4>
                                       </div>
                                       <div className="mt-4">
                                            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${item.status === TrackingStatus.DELIVERED ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-blue-900/30 border-blue-500 text-blue-400'}`}>
                                                {item.status === TrackingStatus.DELIVERED ? <CheckCircleIcon className="w-4 h-4" /> : <ClockIcon className="w-4 h-4" />}
                                                <span className="text-xs font-bold uppercase">{StatusLabels[item.status]}</span>
                                            </div>
                                       </div>
                                  </div>

                                  {/* Middle: Route Timeline */}
                                  <div className="md:col-span-6 flex flex-col justify-center relative pl-4 md:pl-0">
                                       <div className="space-y-6 relative z-10">
                                            {/* Origin */}
                                            <div className="flex items-center gap-4 relative">
                                                <div className="w-3 h-3 bg-gray-500 rounded-full z-10 outline outline-4 outline-rodovar-gray"></div>
                                                <div>
                                                    <p className="text-[10px] text-gray-500 uppercase">Origem</p>
                                                    <p className="text-sm font-bold text-gray-300">{item.origin}</p>
                                                </div>
                                            </div>
                                            
                                            {/* Connecting Line */}
                                            <div className="absolute top-1.5 bottom-1.5 left-[5px] w-0.5 bg-gray-700 -z-0"></div>

                                            {/* Stops */}
                                            {item.stops && item.stops.map((stop, i) => (
                                                <div key={i} className="flex items-center gap-4 relative">
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full z-10 outline outline-4 outline-rodovar-gray"></div>
                                                    <div>
                                                        <p className="text-[10px] text-blue-400 uppercase">Parada {i+1}</p>
                                                        <p className="text-xs font-medium text-gray-400">{stop.city}</p>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Destination */}
                                            <div className="flex items-center gap-4 relative">
                                                <div className={`w-3 h-3 rounded-full z-10 outline outline-4 outline-rodovar-gray ${item.status === TrackingStatus.DELIVERED ? 'bg-green-500' : 'bg-rodovar-yellow'}`}></div>
                                                <div>
                                                    <p className="text-[10px] text-gray-500 uppercase">Destino Final</p>
                                                    <p className="text-sm font-bold text-white">{item.destination}</p>
                                                </div>
                                            </div>
                                       </div>
                                  </div>

                                  {/* Right: Driver Info */}
                                  <div className="md:col-span-3 border-t md:border-t-0 md:border-l border-gray-700 pt-4 md:pt-0 md:pl-4 flex flex-col justify-center">
                                       {item.driverName ? (
                                           <div className="flex flex-col items-center text-center">
                                                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-600 mb-2">
                                                    {item.driverPhoto ? (
                                                        <img src={item.driverPhoto} alt={item.driverName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gray-800 flex items-center justify-center"><UserIcon className="w-8 h-8 text-gray-500"/></div>
                                                    )}
                                                </div>
                                                <p className="text-sm font-bold text-white">{item.driverName}</p>
                                                <p className="text-xs text-gray-500">Motorista Responsável</p>
                                                <button onClick={() => handleEditShipment(item)} className="mt-4 text-xs text-rodovar-yellow hover:underline uppercase">Ver Detalhes</button>
                                           </div>
                                       ) : (
                                           <div className="text-center text-gray-500 text-xs">
                                               <UserIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                               <p>Sem motorista atribuído</p>
                                               <button onClick={() => handleEditShipment(item)} className="mt-4 text-xs text-rodovar-yellow hover:underline uppercase">Atribuir Agora</button>
                                           </div>
                                       )}
                                  </div>
                              </div>
                              {/* Footer Stats */}
                              <div className="bg-black/20 px-6 py-2 flex justify-between items-center text-[10px] text-gray-500 border-t border-gray-800">
                                   <span>Criado por: {item.lastUpdatedBy || 'Sistema'}</span>
                                   <span>Atualizado: {item.lastUpdate}</span>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
      );
  };


  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-4 md:py-8 animate-[fadeIn_0.5s]">
      
      {/* MAINTENANCE ALERTS */}
      {maintenanceAlerts.length > 0 && isMaster && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6 animate-pulse">
              <h4 className="text-red-400 font-bold uppercase text-xs mb-2 flex items-center gap-2">
                  <TruckIcon className="w-4 h-4" /> Alertas de Manutenção Preventiva
              </h4>
              <ul className="list-disc pl-5 space-y-1">
                  {maintenanceAlerts.map((alert, idx) => (
                      <li key={idx} className="text-xs text-white font-bold">{alert}</li>
                  ))}
              </ul>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center mb-6 md:mb-8 gap-4">
        <div className="text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-bold text-rodovar-white">Painel {userRole}</h2>
            <p className="text-gray-500 text-xs md:text-sm">Sistema de Gestão {companyName}</p>
        </div>
        
        <div className="flex flex-wrap justify-center gap-2 bg-rodovar-gray p-1 rounded-lg border border-gray-700 w-full md:w-auto overflow-x-auto">
            <button onClick={() => setActiveTab('shipments')} className={`px-4 py-2 rounded-md text-xs font-bold whitespace-nowrap ${activeTab === 'shipments' ? 'bg-rodovar-yellow text-black' : 'text-gray-400'}`}>CARGAS ATIVAS</button>
            <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-md text-xs font-bold whitespace-nowrap ${activeTab === 'history' ? 'bg-rodovar-yellow text-black' : 'text-gray-400'}`}>HISTÓRICO</button>
            {isMaster && (
                <>
                    <button onClick={() => setActiveTab('drivers')} className={`px-4 py-2 rounded-md text-xs font-bold whitespace-nowrap ${activeTab === 'drivers' ? 'bg-rodovar-yellow text-black' : 'text-gray-400'}`}>MOTORISTAS</button>
                    <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-md text-xs font-bold whitespace-nowrap ${activeTab === 'users' ? 'bg-rodovar-yellow text-black' : 'text-gray-400'}`}>ADMINS</button>
                    <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-md text-xs font-bold whitespace-nowrap ${activeTab === 'settings' ? 'bg-rodovar-yellow text-black' : 'text-gray-400'}`}>CONFIGURAÇÕES</button>
                </>
            )}
        </div>

        <button onClick={onClose} className="text-red-400 bg-red-900/10 px-4 py-2 rounded text-xs font-bold border border-red-900/20 hover:bg-red-900/30">SAIR</button>
      </div>

      {/* RENDER CONTENT BASED ON TAB */}
      <div className="min-h-[500px]">
          {activeTab === 'shipments' && (
             <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 md:gap-8">
                {/* ... (Existing Shipments UI) ... */}
                <div className="xl:col-span-6 bg-rodovar-gray rounded-xl border border-gray-700 shadow-xl overflow-hidden relative">
                    <div className="bg-black/20 border-b border-gray-700 p-4 flex justify-between items-center">
                        <h3 className="text-base font-bold text-rodovar-white">{isEditing ? `Editando: ${code}` : 'Nova Carga'}</h3>
                        {isEditing && <button onClick={handleCancelEdit} className="text-[10px] text-red-400">Cancelar</button>}
                    </div>
                    
                    <form onSubmit={handleSaveShipment} className="p-4 md:p-6 space-y-6">
                        
                        {/* COMPANY */}
                        <div className="grid grid-cols-2 gap-4">
                             <button type="button" onClick={() => handleCompanyChange('RODOVAR')} disabled={isEditing} className={`py-3 rounded font-bold border ${selectedCompany === 'RODOVAR' ? 'bg-rodovar-yellow text-black border-rodovar-yellow' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>RODOVAR</button>
                             <button type="button" onClick={() => handleCompanyChange('AXD')} disabled={isEditing} className={`py-3 rounded font-bold border ${selectedCompany === 'AXD' ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>AXD</button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <input value={code} readOnly className="bg-rodovar-black border border-gray-700 rounded p-2 text-rodovar-yellow font-bold text-center" />
                            <select value={status} onChange={e => setStatus(e.target.value as TrackingStatus)} className="bg-rodovar-black border border-gray-700 rounded p-2 text-white">
                                {Object.entries(StatusLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                        </div>

                        {/* DRIVER */}
                        <div className="relative">
                            <SteeringWheelIcon className="absolute left-3 top-3 w-4 h-4 text-gray-500" />
                            <select value={selectedDriverId} onChange={e => setSelectedDriverId(e.target.value)} className="w-full bg-rodovar-black border border-gray-700 rounded p-2 pl-10 text-white">
                                <option value="">-- Selecione Motorista --</option>
                                {drivers.map(d => <option key={d.id} value={d.id}>{d.name} {d.vehiclePlate ? `(${d.vehiclePlate})` : ''}</option>)}
                            </select>
                        </div>

                        {/* ROUTE */}
                        <div className="bg-black/20 p-4 rounded border border-gray-800 space-y-3">
                             <h4 className="text-rodovar-yellow text-xs font-bold uppercase">Rota & Paradas</h4>
                             <input value={origin} onChange={e => setOrigin(e.target.value)} placeholder="Cidade de Origem" className="w-full bg-rodovar-black border border-gray-700 rounded p-2 text-white" />
                             
                             {/* MULTI-STOP ADDER */}
                             <div className="border-l-2 border-rodovar-yellow pl-3 space-y-2">
                                 <p className="text-[10px] text-gray-400 uppercase">Adicionar Entregas / Paradas (Otimização Automática)</p>
                                 <div className="flex gap-2">
                                     <input value={newStopCity} onChange={e => setNewStopCity(e.target.value)} placeholder="Cidade" className="w-1/3 bg-rodovar-black border border-gray-700 rounded p-2 text-white text-xs" />
                                     <input value={newStopAddress} onChange={e => setNewStopAddress(e.target.value)} placeholder="Endereço" className="w-2/3 bg-rodovar-black border border-gray-700 rounded p-2 text-white text-xs" />
                                     <button type="button" onClick={handleAddStop} className="bg-blue-600 text-white px-3 rounded font-bold">+</button>
                                 </div>
                                 {routeStops.length > 0 && (
                                     <div className="space-y-1 mt-2">
                                         {routeStops.map((stop, idx) => (
                                             <div key={stop.id} className="flex justify-between items-center bg-gray-800 p-2 rounded text-xs text-gray-300">
                                                 <span>{idx + 1}. {stop.city} - {stop.address}</span>
                                                 <button type="button" onClick={() => handleRemoveStop(stop.id)} className="text-red-500 font-bold">x</button>
                                             </div>
                                         ))}
                                         <p className="text-[10px] text-green-500 italic">* A rota será otimizada automaticamente ao salvar.</p>
                                     </div>
                                 )}
                             </div>

                             <input value={destination} onChange={e => setDestination(e.target.value)} placeholder="Cidade Destino Final" className="w-full bg-rodovar-black border border-gray-700 rounded p-2 text-white" />
                             <input value={destinationAddress} onChange={e => setDestinationAddress(e.target.value)} placeholder="Endereço Destino Final" className="w-full bg-rodovar-black border border-gray-700 rounded p-2 text-white" />
                        </div>

                        {/* CURRENT LOC */}
                        <div className="grid grid-cols-2 gap-4">
                            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade Atual" className="bg-rodovar-black border border-gray-700 rounded p-2 text-white" />
                            <input value={state} onChange={e => setState(e.target.value)} placeholder="UF" maxLength={2} className="bg-rodovar-black border border-gray-700 rounded p-2 text-white uppercase" />
                        </div>
                        <button type="button" onClick={handleGetDriverLocation} disabled={gpsLoading} className="w-full bg-blue-900/30 text-blue-400 text-xs py-2 rounded flex justify-center gap-2 border border-blue-900/50">
                            {gpsLoading ? '...' : <><MapPinIcon className="w-3 h-3"/> ATUALIZAR VIA GPS</>}
                        </button>

                        <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Mensagem Pública" className="w-full bg-rodovar-black border border-gray-700 rounded p-2 text-white" />
                        <input type="date" value={estimatedDateInput} onChange={e => setEstimatedDateInput(e.target.value)} className="w-full bg-rodovar-black border border-gray-700 rounded p-2 text-white" />

                        <button type="submit" disabled={loading} className="w-full bg-rodovar-yellow text-black font-bold py-4 rounded-lg uppercase tracking-widest hover:bg-yellow-400 shadow-lg">
                            {loading ? 'PROCESSANDO...' : isEditing ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR ROTA OTIMIZADA'}
                        </button>
                    </form>
                </div>

                <div className="xl:col-span-6 space-y-4">
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar carga..." className="w-full bg-rodovar-black border border-gray-700 rounded-full py-2 px-4 text-white" />
                    <div className="max-h-[800px] overflow-y-auto space-y-3 pr-2">
                        {filteredShipments.filter(s => s.status !== TrackingStatus.DELIVERED).map(s => (
                            <div key={s.code} className={`bg-rodovar-gray p-4 rounded-xl border border-gray-800 ${isEditing && code === s.code ? 'border-blue-500' : ''}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-rodovar-yellow font-bold font-mono">{s.code}</span>
                                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${s.status === TrackingStatus.DELIVERED ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-400'}`}>{StatusLabels[s.status]}</span>
                                </div>
                                <div className="text-xs text-gray-400">
                                    <p>Origem: {s.origin}</p>
                                    {s.stops && s.stops.length > 0 && (
                                        <p className="text-blue-400"> + {s.stops.length} Paradas Intermediárias</p>
                                    )}
                                    <p>Destino: {s.destination}</p>
                                </div>
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => handleEditShipment(s)} className="text-blue-400 text-xs font-bold uppercase px-2">Editar</button>
                                    {isMaster && <button onClick={() => handleDeleteShipment(s.code)} className="text-red-400 text-xs font-bold uppercase px-2">Excluir</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
             </div>
          )}
          
          {activeTab === 'history' && renderHistoryTab()}

          {activeTab === 'users' && isMaster && renderUsersTab()}

          {activeTab === 'settings' && isMaster && renderSettingsTab()}

          {activeTab === 'drivers' && isMaster && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700 h-fit">
                    <h3 className="text-xl font-bold text-rodovar-white mb-6">
                        {editDriverId ? `Editar: ${newDriverName}` : 'Cadastrar Motorista'}
                    </h3>
                    <form onSubmit={handleSaveDriver} className="space-y-4">
                        
                        <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-700 rounded-xl bg-black/20 relative">
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
                            {newDriverPhoto ? <img src={newDriverPhoto} className="w-24 h-24 rounded-full object-cover border-4 border-rodovar-yellow" /> : <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center border-4 border-gray-700"><UploadIcon className="w-8 h-8 text-gray-400" /></div>}
                            <p className="mt-2 text-xs text-gray-400 uppercase font-bold">Foto de Perfil</p>
                        </div>

                        <input value={newDriverName} onChange={e => setNewDriverName(e.target.value)} className="w-full bg-rodovar-black border border-gray-600 rounded p-3 text-white" placeholder="Nome Completo" />
                        <input value={newDriverPhone} onChange={e => setNewDriverPhone(e.target.value)} className="w-full bg-rodovar-black border border-gray-600 rounded p-3 text-white" placeholder="Celular (Somente números)" />
                        
                        <div className="bg-black/20 p-3 rounded border border-gray-800">
                            <h4 className="text-gray-400 text-xs font-bold uppercase mb-2">Dados do Veículo</h4>
                            <input value={newDriverPlate} onChange={e => setNewDriverPlate(e.target.value)} className="w-full bg-rodovar-black border border-gray-600 rounded p-2 text-white mb-2 uppercase" placeholder="Placa do Veículo" />
                            <div className="grid grid-cols-2 gap-2">
                                <input type="number" value={newDriverMileage} onChange={e => setNewDriverMileage(e.target.value)} className="w-full bg-rodovar-black border border-gray-600 rounded p-2 text-white text-xs" placeholder="Km Atual" />
                                <input type="number" value={newDriverNextMaintenance} onChange={e => setNewDriverNextMaintenance(e.target.value)} className="w-full bg-rodovar-black border border-gray-600 rounded p-2 text-white text-xs" placeholder="Próx. Revisão (Km)" />
                            </div>
                            <p className="text-[9px] text-gray-500 mt-1">* O sistema avisará quando faltar 500km para revisão.</p>
                        </div>

                        {driverMsg && <p className="text-green-500 text-sm font-bold">{driverMsg}</p>}
                        <button type="submit" className="w-full bg-rodovar-yellow text-black font-bold py-3 rounded hover:bg-yellow-400 uppercase">
                            {editDriverId ? 'Atualizar Motorista' : 'Salvar Motorista'}
                        </button>
                        {editDriverId && (
                            <button type="button" onClick={() => {
                                setEditDriverId(null);
                                setNewDriverName('');
                                setNewDriverPhone('');
                                setNewDriverPhoto('');
                                setNewDriverPlate('');
                                setNewDriverMileage('');
                                setNewDriverNextMaintenance('');
                            }} className="w-full text-xs text-gray-500 mt-1 hover:text-white">Cancelar Edição</button>
                        )}
                    </form>
                </div>

                <div className="bg-rodovar-gray p-6 rounded-xl border border-gray-700">
                    <h3 className="text-xl font-bold text-rodovar-white mb-6">Equipe</h3>
                    <div className="space-y-3">
                        {drivers.map(d => (
                            <div key={d.id} className="flex justify-between items-center bg-black/30 p-4 rounded-lg border border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-800 overflow-hidden">
                                        {d.photoUrl ? <img src={d.photoUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-full h-full p-2 text-gray-500" />}
                                    </div>
                                    <div>
                                        <p className="text-white font-bold text-sm">{d.name}</p>
                                        {d.vehiclePlate && <p className="text-[10px] text-gray-400">Placa: {d.vehiclePlate} | Km: {d.currentMileage}</p>}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleEditDriver(d)} className="text-blue-500 hover:text-blue-400 p-2" title="Editar">
                                        <PencilIcon className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteDriver(d.id)} className="text-red-500 hover:text-red-400 p-2" title="Remover">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
          )}
      </div>

    </div>
  );
};

export default AdminPanel;
