
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { fetchTrackingInfo } from './services/geminiService';
import { TrackingData, TrackingStatus, Coordinates, UserAddress, StatusLabels, CompanySettings } from './types';
import { TruckIcon, SearchIcon, MapPinIcon, WhatsAppIcon, SteeringWheelIcon, MicrophoneIcon, MicrophoneOffIcon, UserIcon, CheckCircleIcon, DocumentCheckIcon } from './components/Icons';
import MapVisualization from './components/MapVisualization';
import AdminPanel from './components/AdminPanel';
import LoginPanel from './components/LoginPanel';
import DriverPanel from './components/DriverPanel';
import { getDistanceFromLatLonInKm, populateDemoData, getCompanySettings } from './services/storageService';

type AppView = 'tracking' | 'login' | 'admin' | 'driver';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('tracking');
  const [adminUser, setAdminUser] = useState<string>(''); 
  
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
          setError("Ative o GPS para ver sua localização exata no mapa.");
        },
        { enableHighAccuracy: true }
      );
    } else {
        setLocationLoading(false);
    }
  }, []);

  // Polling logic
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

  // Voice Search Logic (Existing)
  const toggleVoiceSearch = () => {
    if (isListening) { window.location.reload(); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Navegador sem suporte.");
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
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

  // Views handling
  if (currentView === 'driver') return <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-gray-100"><header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50"><div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center"><div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('tracking')}>{companySettings.logoUrl ? <img src={companySettings.logoUrl} className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg" /> : <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black"><TruckIcon className="w-6 h-6 md:w-8 md:h-8" /></div>}<div><h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1><p className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest">Acesso do Motorista</p></div></div></div></header><DriverPanel onClose={() => setCurrentView('tracking')} /></div>;
  if (currentView === 'admin' || currentView === 'login') return <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-gray-100"><header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50"><div className="max-w-7xl mx-auto px-4 h-16 md:h-20 flex items-center"><div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('tracking')}>{companySettings.logoUrl ? <img src={companySettings.logoUrl} className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg" /> : <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black"><TruckIcon className="w-6 h-6 md:w-8 md:h-8" /></div>}<div><h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1><p className="text-[8px] md:text-[10px] text-gray-400 uppercase tracking-widest">{currentView === 'login' ? 'Login Administrativo' : `Área Administrativa (${adminUser})`}</p></div></div></div></header>{currentView === 'login' ? <LoginPanel onLoginSuccess={(u) => {setAdminUser(u); setCurrentView('admin');}} onCancel={() => setCurrentView('tracking')} /> : <AdminPanel currentUser={adminUser} onClose={() => {setAdminUser(''); setCurrentView('tracking'); loadSettings();}} />}</div>;

  return (
    <div className="min-h-screen bg-rodovar-black flex flex-col font-sans text-rodovar-white selection:bg-rodovar-yellow selection:text-black">
      <header className="border-b border-gray-800 bg-rodovar-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3 cursor-pointer" onClick={() => setTrackingCode('')}>
            {companySettings.logoUrl ? (
                <img src={companySettings.logoUrl} alt="Logo" className="h-10 w-10 md:h-12 md:w-12 object-contain rounded-lg shadow-[0_0_15px_rgba(255,215,0,0.3)]" />
            ) : (
                <div className="bg-rodovar-yellow p-1.5 md:p-2 rounded-lg text-black shadow-[0_0_15px_rgba(255,215,0,0.3)]">
                    <TruckIcon className="w-6 h-6 md:w-8 md:h-8" />
                </div>
            )}
            <div>
                <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter text-rodovar-white uppercase">{companySettings.name}</h1>
                <p className="text-[8px] md:text-sm text-gray-400 uppercase tracking-widest hidden md:block">{companySettings.slogan}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
             <button onClick={() => setCurrentView('driver')} className="flex items-center gap-2 text-xs md:text-sm font-bold text-black bg-rodovar-yellow hover:bg-yellow-400 transition-colors px-3 py-1.5 md:px-4 md:py-2 rounded-full shadow-[0_0_10px_rgba(255,215,0,0.3)] animate-[pulse_3s_infinite]">
                <SteeringWheelIcon className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden md:inline">SOU MOTORISTA</span>
                <span className="md:hidden">MOTORISTA</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center relative pb-20 md:pb-12">
        
        {/* User Location Bar */}
        {userLocation && (
            <div className="w-full max-w-7xl px-4 mt-4 md:mt-6 animate-[fadeIn_0.8s_ease-out]">
                <div className="bg-rodovar-gray border border-gray-800 rounded-xl p-3 md:p-4 flex flex-col md:flex-row items-center md:justify-between gap-3 md:gap-4 shadow-lg">
                    <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                        <div className="bg-blue-900/30 p-2 md:p-3 rounded-full text-blue-400 border border-blue-500/30 relative flex-shrink-0">
                            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20"></div>
                            <MapPinIcon className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-[10px] md:text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">Sua Localização Atual</h3>
                            {locationLoading ? (
                                <div className="h-4 w-32 md:w-48 bg-gray-800 rounded animate-pulse"></div>
                            ) : userAddress ? (
                                <div>
                                    <p className="text-rodovar-white font-bold text-sm md:text-lg leading-tight truncate">{userAddress.road}</p>
                                    <p className="text-gray-400 text-xs md:text-sm truncate">{userAddress.city} - {userAddress.state}</p>
                                </div>
                            ) : (
                                <p className="text-gray-400 text-sm">{userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

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
                        placeholder="CÓDIGO (Ex: RODOVAR2207, AXD3423) ou CELULAR (Ex: 7191777***)"
                        className="w-full bg-rodovar-gray border-2 border-gray-700 text-rodovar-white px-4 py-3 md:px-6 md:py-4 rounded-full focus:outline-none focus:border-rodovar-yellow focus:ring-1 focus:ring-rodovar-yellow transition-all text-base md:text-lg tracking-wider shadow-2xl placeholder-gray-600 uppercase"
                    />
                    <button type="submit" disabled={loading} className="absolute right-1.5 md:right-2 bg-rodovar-yellow hover:bg-yellow-400 text-black p-2 md:p-3 rounded-full transition-transform transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg">
                        {loading ? <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <SearchIcon className="w-5 h-5 md:w-6 md:h-6" />}
                    </button>
                </div>
            </form>
             {error && (
                <div className="w-full bg-red-900/20 border border-red-500/50 text-white px-4 py-4 rounded-lg text-center font-bold animate-pulse flex items-center justify-center gap-2 text-sm md:text-base">
                    <span className="text-lg">⚠️</span> {error}
                </div>
            )}
        </div>

        <div className="w-full max-w-7xl px-4 flex flex-col lg:flex-row gap-6 mb-8">
            
            {trackingData && (
                <div className="flex-1 order-2 lg:order-1 animate-[slideInLeft_0.5s_ease-out]">
                    <div className="bg-rodovar-gray rounded-2xl border border-gray-700 p-5 md:p-8 shadow-2xl relative overflow-hidden h-full">
                        
                        {/* HEADER CARGA */}
                        <div className="flex justify-between items-start mb-6 md:mb-8">
                            <div>
                                <h3 className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Código Identificador</h3>
                                <div className="flex items-center gap-2">
                                    <p className="text-2xl md:text-4xl font-mono font-bold text-rodovar-white tracking-tighter">{trackingData.code}</p>
                                    {trackingData.company && (
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${trackingData.company === 'AXD' ? 'bg-blue-600 text-white' : 'bg-rodovar-yellow text-black'}`}>
                                            {trackingData.company}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className={`px-3 py-1 md:px-4 md:py-1.5 rounded-full border ${getStatusColor(trackingData.status)} ${getStatusBg(trackingData.status)}`}>
                                <span className="text-xs md:text-sm font-bold tracking-wide uppercase">{StatusLabels[trackingData.status]}</span>
                            </div>
                        </div>

                        {/* DIGITAL PROOF OF DELIVERY CARD (IF DELIVERED) */}
                        {trackingData.status === TrackingStatus.DELIVERED && trackingData.proof && (
                             <div className="mb-8">
                                <div id="proof-of-delivery-card" className="bg-white text-black rounded-lg shadow-xl overflow-hidden mx-auto max-w-[600px] border border-gray-200">
                                      {/* Header with Green Strip */}
                                      <div className="bg-[#22c55e] text-white p-3 flex justify-between items-center">
                                          <div className="flex items-center gap-2">
                                              <DocumentCheckIcon className="w-5 h-5 text-white" />
                                              <h3 className="text-sm font-bold uppercase tracking-wide">Comprovante de Entrega Digital</h3>
                                          </div>
                                          <div className="bg-white text-[#22c55e] text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                                              Canhoto Digital Verificado
                                          </div>
                                      </div>
                                      
                                      {/* Company Info Header */}
                                      <div className="bg-gray-50 border-b border-gray-200 p-4 flex justify-between items-center">
                                          <div className="flex items-center gap-2">
                                              {companySettings.logoUrl ? (
                                                  <img src={companySettings.logoUrl} className="h-8 w-auto" alt="Logo" />
                                              ) : (
                                                  <div className="bg-black text-white p-1 rounded"><TruckIcon className="w-4 h-4"/></div>
                                              )}
                                              <div>
                                                  <p className="font-bold text-sm uppercase leading-tight">{companySettings.name}</p>
                                                  <p className="text-[9px] text-gray-500 uppercase">{companySettings.slogan}</p>
                                              </div>
                                          </div>
                                          <div className="text-right">
                                              <p className="text-[9px] text-gray-500 uppercase">Código da Carga</p>
                                              <p className="text-lg font-mono font-bold tracking-tighter text-black">{trackingData.code}</p>
                                          </div>
                                      </div>

                                      {/* Content Grid */}
                                      <div className="p-4 grid grid-cols-2 gap-4">
                                          {/* Left Column: Info */}
                                          <div className="space-y-4 border-r border-gray-100 pr-2">
                                              <div>
                                                  <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Recebido Por</p>
                                                  <p className="font-bold text-sm text-black leading-tight">{trackingData.proof.receiverName}</p>
                                                  <p className="text-[10px] text-gray-600">Doc: {trackingData.proof.receiverDoc}</p>
                                              </div>
                                              <div>
                                                  <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Data da Entrega</p>
                                                  <p className="text-xs text-black font-medium">{new Date(trackingData.proof.timestamp).toLocaleString('pt-BR')}</p>
                                              </div>
                                              <div>
                                                  <p className="text-[9px] text-gray-400 uppercase font-bold mb-0.5">Local Validade (GPS)</p>
                                                  <div className="text-[10px] text-blue-600 flex items-center gap-1 font-mono">
                                                      <MapPinIcon className="w-3 h-3" /> 
                                                      {trackingData.proof.location.lat.toFixed(5)}, {trackingData.proof.location.lng.toFixed(5)}
                                                  </div>
                                              </div>
                                          </div>

                                          {/* Right Column: Evidence */}
                                          <div className="flex flex-col gap-3">
                                              <div className="border border-gray-200 rounded-md bg-gray-50 p-2 text-center h-24 flex flex-col justify-center">
                                                  <p className="text-[8px] text-gray-400 uppercase mb-1">Assinatura Digital</p>
                                                  <img src={trackingData.proof.signatureBase64} className="h-full w-full object-contain mix-blend-multiply" alt="Assinatura" />
                                              </div>
                                              {trackingData.proof.photoBase64 && (
                                                  <div className="border border-gray-200 rounded-md overflow-hidden h-24 relative bg-black">
                                                      <img src={trackingData.proof.photoBase64} className="w-full h-full object-cover opacity-90" alt="Foto da Entrega" />
                                                      <div className="absolute bottom-0 left-0 w-full bg-black/50 text-white text-[8px] p-0.5 text-center">Foto Local</div>
                                                  </div>
                                              )}
                                          </div>
                                      </div>
                                      
                                      {/* Footer */}
                                      <div className="bg-gray-100 p-2 text-center border-t border-gray-200">
                                          <p className="text-[8px] text-gray-400 uppercase tracking-widest">Documento gerado eletronicamente em {new Date().toLocaleDateString()}</p>
                                      </div>
                                 </div>
                             </div>
                        )}

                        {/* EXISTING TRACKING INFO */}
                        <div className="space-y-6 md:space-y-8">
                            <div className="relative pl-4 md:pl-6 border-l-2 border-gray-700 space-y-6 md:space-y-8">
                                <div className="relative">
                                    <div className="absolute -left-[23px] md:-left-[31px] top-0 bg-rodovar-yellow rounded-full p-1 border-4 border-rodovar-gray">
                                        <div className="w-2 h-2 md:w-3 md:h-3 bg-black rounded-full"></div>
                                    </div>
                                    <h4 className="text-gray-400 text-xs uppercase tracking-wider">Status Atual {trackingData.isLive && <span className="text-red-500 font-bold ml-1">● AO VIVO</span>}</h4>
                                    <p className="text-xl md:text-2xl font-bold text-rodovar-white mt-1">{trackingData.currentLocation.city}, {trackingData.currentLocation.state}</p>
                                    
                                    {trackingData.driverName && (
                                        <div className="flex flex-col items-center justify-center mt-6 mb-2 bg-gray-800/40 p-4 rounded-xl border border-gray-700">
                                            <div className="relative mb-2">
                                                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-rodovar-yellow shadow-[0_0_20px_rgba(255,215,0,0.5)] z-10 relative">
                                                    {trackingData.driverPhoto ? (
                                                        <img src={trackingData.driverPhoto} alt={trackingData.driverName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-gray-800 flex items-center justify-center"><SteeringWheelIcon className="w-10 h-10 text-rodovar-yellow" /></div>
                                                    )}
                                                </div>
                                                <div className="absolute inset-0 bg-rodovar-yellow/20 rounded-full animate-pulse blur-md transform scale-110 z-0"></div>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">Motorista</p>
                                                <p className="text-lg md:text-xl text-rodovar-white font-bold">{trackingData.driverName}</p>
                                                <p className="text-xs text-rodovar-yellow font-bold mt-1">{trackingData.company || 'RODOVAR'} TEAM</p>
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-xs md:text-sm text-rodovar-yellow mt-4 font-medium italic border-t border-gray-800 pt-2">"{trackingData.message}"</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                     <div className="relative">
                                        <div className="absolute -left-[22px] md:-left-[30px] top-1 w-3 h-3 md:w-4 md:h-4 bg-gray-700 rounded-full border-4 border-rodovar-gray"></div>
                                        <h4 className="text-gray-500 text-xs uppercase mb-1">Origem</h4>
                                        <p className="font-semibold text-gray-300">{trackingData.origin}</p>
                                    </div>
                                     <div className="relative">
                                        <div className="absolute -left-[22px] md:-left-[30px] top-1 w-3 h-3 md:w-4 md:h-4 bg-gray-700 rounded-full border-4 border-rodovar-gray"></div>
                                        <h4 className="text-gray-500 text-xs uppercase mb-1">Destino</h4>
                                        {trackingData.destinationAddress && <p className="text-[10px] md:text-xs text-gray-400 mb-1 font-medium">{trackingData.destinationAddress}</p>}
                                        <p className="font-semibold text-gray-300">{trackingData.destination}</p>
                                    </div>
                                </div>

                                {trackingData.stops && trackingData.stops.length > 0 && (
                                     <div className="bg-blue-900/10 p-3 rounded border border-blue-900/30">
                                         <p className="text-blue-400 text-xs font-bold uppercase mb-2">Rota Otimizada - Próximas Paradas</p>
                                         <ul className="space-y-1">
                                             {trackingData.stops.map((stop, idx) => (
                                                 <li key={idx} className="text-xs text-gray-300 flex items-center gap-2">
                                                     <span className="bg-blue-600 text-white w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold">{idx + 1}</span>
                                                     {stop.city}
                                                 </li>
                                             ))}
                                         </ul>
                                     </div>
                                )}
                            </div>

                            <div className="bg-black/30 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 border border-gray-800">
                                <div>
                                    <h4 className="text-gray-500 text-[10px] uppercase mb-1">Última Atualização</h4>
                                    <p className="font-mono text-xs md:text-sm text-gray-300">{trackingData.lastUpdate}</p>
                                </div>
                                <div className="border-l border-gray-800 pl-4 md:pl-0 md:border-l-0">
                                    <h4 className="text-gray-500 text-[10px] uppercase mb-1">Entrega Estimada</h4>
                                    <p className="font-mono text-xs md:text-sm text-rodovar-yellow">{trackingData.estimatedDelivery}</p>
                                </div>
                                <div className="border-l border-gray-800 pl-4 md:pl-0 md:border-l-0">
                                     <h4 className="text-gray-500 text-[10px] uppercase mb-1">Distância Restante</h4>
                                     <p className="font-mono text-sm md:text-base text-rodovar-yellow font-bold">{remainingDistance !== null ? `${remainingDistance} km` : '--'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className={`flex-1 order-1 lg:order-2 transition-all duration-700 ease-in-out ${loading || trackingData ? 'h-[40vh] md:h-[500px] opacity-100' : 'h-[30vh] md:h-[300px] opacity-80 hover:opacity-100'}`}>
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
      </main>

      <button onClick={toggleVoiceSearch} className={`fixed bottom-6 right-6 p-4 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.4)] transition-all z-50 hover:scale-110 active:scale-95 flex items-center justify-center ${isListening ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-600 text-white'}`}>
        {isListening ? <div className="flex gap-1 items-center"><div className="w-1 bg-white h-3 animate-pulse"></div><div className="w-1 bg-white h-5 animate-pulse"></div><div className="w-1 bg-white h-3 animate-pulse"></div></div> : <MicrophoneIcon className="w-6 h-6" />}
      </button>

      <footer className="bg-rodovar-black border-t border-gray-900 py-6 md:py-8 mt-auto relative">
        <div className="max-w-7xl mx-auto px-4 text-center">
            <p className="text-gray-600 text-xs md:text-sm">© {new Date().getFullYear()} {companySettings.name} Logística.</p>
            <p className="text-gray-800 text-[10px] mt-1 uppercase tracking-widest">Tecnologia {companySettings.name}-SAT</p>
            <div className="flex justify-center gap-4 mt-4 md:absolute md:bottom-4 md:right-4 md:flex-col md:items-end md:mt-0">
                 <button onClick={() => setCurrentView('driver')} className="text-[10px] text-gray-600 hover:text-rodovar-yellow uppercase tracking-widest">Sou Motorista</button>
                 <span className="text-gray-800 md:hidden">|</span>
                <button onClick={() => setCurrentView('login')} className="text-[10px] text-gray-800 hover:text-gray-500 uppercase tracking-widest">Área Restrita</button>
            </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
