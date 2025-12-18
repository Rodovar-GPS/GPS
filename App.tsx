
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { fetchTrackingInfo } from './services/geminiService';
import { TrackingData, TrackingStatus, Coordinates, UserAddress, StatusLabels, CompanySettings } from './types';
import { TruckIcon, SearchIcon, MapPinIcon, WhatsAppIcon, SteeringWheelIcon, MicrophoneIcon, MicrophoneOffIcon, UserIcon, CheckCircleIcon, DocumentCheckIcon, DownloadIcon, ChartBarIcon } from './components/Icons';
import MapVisualization from './components/MapVisualization';
import AdvancedMap from './components/AdvancedMap';
import AdminPanel from './components/AdminPanel';
import LoginPanel from './components/LoginPanel';
import DriverPanel from './components/DriverPanel';
import { getDistanceFromLatLonInKm, populateDemoData, getCompanySettings, getAllShipments } from './services/storageService';

type AppView = 'tracking' | 'login' | 'admin' | 'driver';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('tracking');
  const [adminUser, setAdminUser] = useState<string>(localStorage.getItem('rodovar_logged_admin') || ''); 
  const [showAdvancedMap, setShowAdvancedMap] = useState(false);
  
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
      name: 'RODOVAR',
      slogan: 'Logística Inteligente',
      logoUrl: '',
      primaryColor: '#FFD700',
      backgroundColor: '#121212',
      cardColor: '#1E1E1E',
      textColor: '#F5F5F5'
  });

  const [trackingCode, setTrackingCode] = useState('');
  const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingDistance, setRemainingDistance] = useState<number | null>(null);
  
  const pollingIntervalRef = useRef<number | null>(null);

  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [userAddress, setUserAddress] = useState<UserAddress | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const [isListening, setIsListening] = useState(false);

  // --- WELCOME REACTION LOGIC (MEU CHEF!) ---
  useEffect(() => {
      if (adminUser) {
          const today = new Date().toISOString().split('T')[0];
          const lastWelcome = localStorage.getItem(`last_welcome_${adminUser}`);
          
          if (lastWelcome !== today) {
              const msg = "Seja bem vindo, meu chef!";
              
              if ('speechSynthesis' in window) {
                  const utterance = new SpeechSynthesisUtterance(msg);
                  utterance.lang = 'pt-BR';
                  
                  // Busca vozes brasileiras de qualidade
                  const voices = window.speechSynthesis.getVoices();
                  const brVoice = voices.find(v => v.lang.includes('pt-BR') && (v.name.includes('Google') || v.name.includes('Luciana')));
                  if (brVoice) utterance.voice = brVoice;
                  
                  utterance.rate = 0.95; // Velocidade natural
                  utterance.pitch = 1.0;
                  window.speechSynthesis.speak(utterance);
              }
              
              setTimeout(() => {
                  alert(`👔 ${msg}`);
                  localStorage.setItem(`last_welcome_${adminUser}`, today);
              }, 1000);
          }
      }
  }, [adminUser]);

  useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const magicCode = params.get('track');
      if (magicCode) {
          const cleanCode = magicCode.trim().toUpperCase();
          setTrackingCode(cleanCode);
          setTimeout(() => {
              handleTrack(undefined, cleanCode);
          }, 500);
      }
  }, []);

  useEffect(() => {
      populateDemoData();
      loadSettings();
  }, []);

  const loadSettings = async () => {
      const settings = await getCompanySettings();
      setCompanySettings(settings);
      document.title = `${settings.name} - Rastreamento`;
      
      const root = document.documentElement;
      root.style.setProperty('--color-primary', settings.primaryColor || '#FFD700');
      root.style.setProperty('--color-bg', settings.backgroundColor || '#121212');
      root.style.setProperty('--color-card', settings.cardColor || '#1E1E1E');
      root.style.setProperty('--color-text', settings.textColor || '#F5F5F5');
  };

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });

          try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`
            );
            const data = await response.json();
            if (data && data.address) {
                setUserAddress({
                    road: data.address.road || 'Rua não identificada',
                    neighborhood: data.address.suburb || data.address.neighbourhood || '',
                    city: data.address.city || data.address.town || '',
                    state: data.address.state || '',
                    country: data.address.country || '',
                    formatted: data.display_name
                });
            }
          } catch (err) {
            console.error("Erro ao buscar endereço:", err);
          } finally {
            setLocationLoading(false);
          }
        },
        (err) => {
          console.warn(err);
          setLocationLoading(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
        setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
      if (!trackingData || !trackingData.isLive || trackingData.status === TrackingStatus.DELIVERED) {
          if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
          }
          return;
      }
      if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = window.setInterval(async () => {
               try {
                   const updated = await fetchTrackingInfo(trackingData.code);
                   setTrackingData(updated);
                   if (updated.currentLocation.coordinates && updated.destinationCoordinates && 
                    (updated.destinationCoordinates.lat !== 0 || updated.destinationCoordinates.lng !== 0)) {
                        const dist = getDistanceFromLatLonInKm(
                            updated.currentLocation.coordinates.lat,
                            updated.currentLocation.coordinates.lng,
                            updated.destinationCoordinates.lat,
                            updated.destinationCoordinates.lng
                        );
                        setRemainingDistance(Math.round(dist));
                   }
               } catch (e) { console.error(e); }
          }, 5000); 
      }
      return () => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); };
  }, [trackingData?.isLive, trackingData?.code, trackingData?.status]);


  const handleTrack = useCallback(async (e?: React.FormEvent, codeOverride?: string) => {
    if (e) e.preventDefault();
    const codeToSearch = codeOverride ? codeOverride.trim() : trackingCode.trim();
    if (!codeToSearch) return;
    setLoading(true);
    setError(null);
    setTrackingData(null);
    setRemainingDistance(null);
    if (codeOverride) setTrackingCode(codeOverride);

    try {
      const data = await fetchTrackingInfo(codeToSearch);
      setTrackingData(data);
      if (data.currentLocation.coordinates && data.destinationCoordinates && 
         (data.destinationCoordinates.lat !== 0 || data.destinationCoordinates.lng !== 0)) {
           const dist = getDistanceFromLatLonInKm(
               data.currentLocation.coordinates.lat,
               data.currentLocation.coordinates.lng,
               data.destinationCoordinates.lat,
               data.destinationCoordinates.lng
           );
           setRemainingDistance(Math.round(dist));
      }
    } catch (err: any) {
      setError(err.message || "Não existe cadastro com a numeração informada.");
    } finally {
      setLoading(false);
    }
  }, [trackingCode]);

  const handleLogout = () => {
      setAdminUser('');
      localStorage.removeItem('rodovar_logged_admin');
      setCurrentView('tracking');
      setShowAdvancedMap(false);
  };

  const toggleVoiceSearch = () => {
    if (isListening) { window.location.reload(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Navegador sem suporte.");
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      if (transcript.includes('motorista')) { setCurrentView('driver'); return; }
      if (transcript.includes('admin') || transcript.includes('login')) { setCurrentView('login'); return; }
      let code = transcript.replace('rastrear', '').replace('buscar', '').replace('código', '').replace('carga', '').trim();
      const cleanCode = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      if (cleanCode.length >= 3) { setTrackingCode(cleanCode); handleTrack(undefined, cleanCode); }
    };
    recognition.start();
  };

  const getStatusColor = (status: TrackingStatus) => {
    switch (status) {
      case TrackingStatus.DELIVERED: return 'text-green-500 border-green-500';
      case TrackingStatus.DELAYED:
      case TrackingStatus.EXCEPTION: return 'text-red-500 border-red-500';
      case TrackingStatus.STOPPED: return 'text-orange-500 border-orange-500';
      case TrackingStatus.PENDING: return 'text-gray-400 border-gray-400';
      default: return 'text-rodovar-yellow border-rodovar-yellow';
    }
  };

  const getStatusBg = (status: TrackingStatus) => {
    switch (status) {
      case TrackingStatus.DELIVERED: return 'bg-green-500/20';
      case TrackingStatus.DELAYED:
      case TrackingStatus.EXCEPTION: return 'bg-red-500/20';
      case TrackingStatus.STOPPED: return 'bg-orange-500/20';
      case TrackingStatus.PENDING: return 'bg-gray-500/20';
      default: return 'bg-yellow-500/20';
    }
  };

  if (currentView === 'driver') {
      return (
        <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-gray-100">
            <header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('tracking')}>
                        {companySettings.logoUrl ? <img src={companySettings.logoUrl} className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg" /> : <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black"><TruckIcon className="w-6 h-6 md:w-8 md:h-8" /></div>}
                        <div>
                            <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1>
                            <p className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest">Acesso do Motorista</p>
                        </div>
                    </div>
                </div>
            </header>
            <DriverPanel onClose={() => setCurrentView('tracking')} />
        </div>
      );
  }
  
  if (currentView === 'admin') {
      return (
        <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-gray-100">
            <header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('tracking')}>
                        {companySettings.logoUrl ? <img src={companySettings.logoUrl} className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg" /> : <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black"><TruckIcon className="w-6 h-6 md:w-8 md:h-8" /></div>}
                        <div>
                            <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1>
                            <p className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest">Painel Administrativo ({adminUser})</p>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="text-xs bg-red-900/20 text-red-400 px-4 py-2 rounded-full border border-red-500/30 hover:bg-red-900/40">SAIR</button>
                </div>
            </header>
            <AdminPanel currentUser={adminUser} onClose={() => {setCurrentView('tracking'); loadSettings();}} />
        </div>
      );
  }

  if (currentView === 'login') {
      return (
        <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-gray-100">
            <header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('tracking')}>
                        {companySettings.logoUrl ? <img src={companySettings.logoUrl} className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg" /> : <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black"><TruckIcon className="w-6 h-6 md:w-8 md:h-8" /></div>}
                        <div>
                            <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1>
                            <p className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest">Identificação Necessária</p>
                        </div>
                    </div>
                </div>
            </header>
            <LoginPanel 
                onLoginSuccess={(username) => {
                    setAdminUser(username);
                    setCurrentView('admin');
                }} 
                onCancel={() => setCurrentView('tracking')} 
            />
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-rodovar-white selection:bg-rodovar-yellow selection:text-black">
      <header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => { setTrackingCode(''); setTrackingData(null); setShowAdvancedMap(false); }}>
            {companySettings.logoUrl ? (
                <img src={companySettings.logoUrl} alt="Logo" className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg" />
            ) : (
                <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black">
                    <TruckIcon className="w-6 h-6 md:w-8 md:h-8" />
                </div>
            )}
            <div>
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1>
                <p className="text-[8px] md:text-sm text-gray-400 uppercase tracking-widest hidden md:block">{companySettings.slogan}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
             {adminUser ? (
                 <div className="flex items-center gap-4">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">Logado como</span>
                        <span className="text-sm font-bold text-rodovar-yellow uppercase">{adminUser}</span>
                    </div>
                    <button onClick={() => setCurrentView('admin')} className="p-2 bg-gray-800 rounded-full text-white hover:bg-gray-700" title="Configurações">
                         <UserIcon className="w-5 h-5" />
                    </button>
                    <button onClick={handleLogout} className="text-[10px] bg-red-900/20 text-red-400 px-3 py-1.5 rounded-full border border-red-500/30 font-bold hover:bg-red-900/40">SAIR</button>
                 </div>
             ) : (
                <button onClick={() => setCurrentView('driver')} className="flex items-center gap-2 text-xs md:text-sm font-bold text-black bg-rodovar-yellow hover:bg-yellow-400 transition-colors px-3 py-1.5 md:px-4 md:py-2 rounded-full">
                    <SteeringWheelIcon className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="hidden md:inline">SOU MOTORISTA</span>
                    <span className="md:hidden">MOTORISTA</span>
                </button>
             )}
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center relative pb-20 md:pb-12">
        
        {/* Advanced Map Toggle (Admin Only) */}
        {adminUser && (
            <div className="w-full max-w-7xl px-4 mt-4 animate-[fadeIn_0.5s]">
                <button 
                    onClick={() => setShowAdvancedMap(!showAdvancedMap)}
                    className={`w-full p-4 rounded-xl border flex items-center justify-center gap-3 font-black uppercase tracking-widest transition-all ${showAdvancedMap ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_20px_rgba(79,70,229,0.4)]' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-rodovar-yellow hover:text-white'}`}
                >
                    <ChartBarIcon className="w-6 h-6" />
                    {showAdvancedMap ? 'FECHAR MONITORAMENTO AVANÇADO' : 'ATIVAR MAPA AVANÇADO (AO VIVO)'}
                </button>
            </div>
        )}

        {showAdvancedMap ? (
            <div className="w-full max-w-7xl px-4 mt-6 h-[70vh] animate-[slideInDown_0.6s_ease-out]">
                 <AdvancedMap className="h-full w-full rounded-2xl shadow-2xl border-4 border-indigo-500/20" />
            </div>
        ) : (
            <>
                <div className="w-full max-w-3xl px-4 py-8 md:py-10 flex flex-col items-center gap-4 md:gap-6 z-10">
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl md:text-5xl font-bold text-rodovar-white uppercase">
                            Rastreamento <span className="text-transparent bg-clip-text bg-gradient-to-r from-rodovar-yellow to-yellow-200">Satélite</span>
                        </h2>
                        {companySettings.slogan && <p className="text-gray-400 text-sm uppercase tracking-widest">{companySettings.slogan}</p>}
                    </div>

                    <form onSubmit={(e) => handleTrack(e)} className="w-full relative group">
                        <div className="absolute inset-0 bg-rodovar-yellow/10 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="relative flex items-center">
                            <input 
                                type="text" 
                                value={trackingCode}
                                onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                                placeholder="CÓDIGO DA CARGA OU CELULAR"
                                className="w-full bg-rodovar-gray border-2 border-gray-700 text-rodovar-white px-4 py-3 md:px-6 md:py-4 rounded-full focus:outline-none focus:border-rodovar-yellow transition-all text-base md:text-lg tracking-wider shadow-2xl placeholder-gray-600 uppercase"
                            />
                            <button type="submit" disabled={loading} className="absolute right-1.5 md:right-2 bg-rodovar-yellow hover:bg-yellow-400 text-black p-2 md:p-3 rounded-full transition-transform transform active:scale-95 shadow-lg">
                                {loading ? <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <SearchIcon className="w-5 h-5 md:w-6 md:h-6" />}
                            </button>
                        </div>
                    </form>
                    {error && <div className="w-full bg-red-900/20 border border-red-500/50 text-white px-4 py-4 rounded-lg text-center font-bold animate-pulse text-sm">⚠️ {error}</div>}
                </div>

                <div className="w-full max-w-7xl px-4 flex flex-col lg:flex-row gap-6 mb-8">
                    {trackingData && (
                        <div className="flex-1 order-2 lg:order-1 animate-[slideInLeft_0.5s_ease-out]">
                            <div className="bg-rodovar-gray rounded-2xl border border-gray-700 p-5 md:p-8 shadow-2xl h-full">
                                <div className="flex justify-between items-start mb-6 md:mb-8">
                                    <div>
                                        <h3 className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Carga</h3>
                                        <div className="flex items-center gap-2">
                                            <p className="text-2xl md:text-4xl font-mono font-bold text-rodovar-white">{trackingData.code}</p>
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${trackingData.company === 'AXD' ? 'bg-blue-600 text-white' : 'bg-rodovar-yellow text-black'}`}>{trackingData.company}</span>
                                        </div>
                                    </div>
                                    <div className={`px-3 py-1 rounded-full border ${getStatusColor(trackingData.status)} ${getStatusBg(trackingData.status)} text-[10px] md:text-xs font-bold uppercase`}>
                                        {StatusLabels[trackingData.status]}
                                    </div>
                                </div>
                                <div className="space-y-6 md:space-y-8">
                                    <div className="relative pl-4 border-l-2 border-gray-700 space-y-6">
                                        <div>
                                            <h4 className="text-gray-400 text-[10px] uppercase tracking-widest">Localização Atual {trackingData.isLive && <span className="text-red-500 ml-1">● AO VIVO</span>}</h4>
                                            <p className="text-lg md:text-xl font-bold text-rodovar-white">{trackingData.currentLocation.city}, {trackingData.currentLocation.state}</p>
                                            {trackingData.driverName && (
                                                <div className="flex items-center gap-3 mt-4 bg-black/20 p-3 rounded-lg border border-gray-800">
                                                    <div className="w-10 h-10 rounded-full overflow-hidden border border-rodovar-yellow">
                                                        {trackingData.driverPhoto ? <img src={trackingData.driverPhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-6 h-6 m-auto text-gray-500" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-gray-500 uppercase">Responsável</p>
                                                        <p className="text-sm font-bold text-white">{trackingData.driverName}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div><h4 className="text-gray-500 text-[10px] uppercase mb-1">Origem</h4><p className="text-xs font-semibold text-gray-300">{trackingData.origin}</p></div>
                                            <div><h4 className="text-gray-500 text-[10px] uppercase mb-1">Destino</h4><p className="text-xs font-semibold text-gray-300">{trackingData.destination}</p></div>
                                        </div>
                                    </div>
                                    <div className="bg-black/30 rounded-xl p-4 grid grid-cols-3 gap-2 border border-gray-800 text-center">
                                        <div><h4 className="text-gray-500 text-[8px] uppercase">Atualizado</h4><p className="text-[10px] text-gray-300">{trackingData.lastUpdate}</p></div>
                                        <div><h4 className="text-gray-500 text-[8px] uppercase">Chegada</h4><p className="text-[10px] text-rodovar-yellow">{trackingData.estimatedDelivery}</p></div>
                                        <div><h4 className="text-gray-500 text-[8px] uppercase">Km Faltando</h4><p className="text-[10px] text-rodovar-yellow font-bold">{remainingDistance !== null ? `${remainingDistance}km` : '--'}</p></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className={`flex-1 order-1 lg:order-2 transition-all duration-700 ease-in-out ${loading || trackingData ? 'h-[40vh] md:h-[500px]' : 'h-[30vh] md:h-[300px]'}`}>
                        <MapVisualization 
                            loading={loading} 
                            coordinates={trackingData?.currentLocation.coordinates}
                            destinationCoordinates={trackingData?.destinationCoordinates} 
                            stops={trackingData?.stops}
                            userLocation={userLocation}
                            status={trackingData?.status}
                            className="h-full w-full"
                        />
                    </div>
                </div>
            </>
        )}
      </main>

      <button onClick={toggleVoiceSearch} className={`fixed bottom-6 right-6 p-4 rounded-full shadow-2xl transition-all z-50 hover:scale-110 flex items-center justify-center ${isListening ? 'bg-red-600 animate-pulse' : 'bg-indigo-600'}`}>
        {isListening ? <div className="flex gap-1"><div className="w-1 bg-white h-3 animate-pulse"></div><div className="w-1 bg-white h-5 animate-pulse"></div><div className="w-1 bg-white h-3 animate-pulse"></div></div> : <MicrophoneIcon className="w-6 h-6 text-white" />}
      </button>

      <footer className="bg-rodovar-black border-t border-gray-900 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-gray-600 text-[10px] uppercase tracking-widest">© {new Date().getFullYear()} {companySettings.name} Logística • Tecnologia {companySettings.name}-SAT</p>
            <div className="flex justify-center gap-4 mt-4">
                 <button onClick={() => setCurrentView('driver')} className="text-[10px] text-gray-700 hover:text-rodovar-yellow uppercase">Sou Motorista</button>
                 <span className="text-gray-800">|</span>
                 {adminUser ? (
                     <button onClick={() => setCurrentView('admin')} className="text-[10px] text-rodovar-yellow uppercase font-bold">Admin Panel</button>
                 ) : (
                     <button onClick={() => setCurrentView('login')} className="text-[10px] text-gray-800 hover:text-white uppercase">Área Restrita</button>
                 )}
            </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
