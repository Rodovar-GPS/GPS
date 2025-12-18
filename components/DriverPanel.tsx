
import React, { useState, useEffect, useRef } from 'react';
import { TrackingData, TrackingStatus, Coordinates, StatusLabels, CompanySettings } from '../types';
import { getShipment, saveShipment, getCompanySettings } from '../services/storageService';
import MapVisualization from './MapVisualization';
import { TruckIcon, SteeringWheelIcon, MicrophoneIcon, UserIcon } from './Icons';

interface DriverPanelProps {
  onClose: () => void;
}

interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const DriverPanel: React.FC<DriverPanelProps> = ({ onClose }) => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
      name: 'RODOVAR',
      slogan: 'Logística Inteligente',
  });

  const [code, setCode] = useState('');
  const [shipment, setShipment] = useState<TrackingData | null>(null);
  const shipmentRef = useRef<TrackingData | null>(null);

  const [error, setError] = useState('');
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [pendingStartAfterShare, setPendingStartAfterShare] = useState(false);
  
  const trackingIntervalRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]); 

  const MANAGER_PHONE = "5571999202476"; 

  const getNowFormatted = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} - ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  useEffect(() => {
    loadSettings();
    const savedCode = localStorage.getItem('rodovar_active_driver_code');
    if (savedCode) {
        setCode(savedCode);
        handleShipmentLogin(null, savedCode);
    }

    const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) setAvailableVoices(voices);
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && pendingStartAfterShare && shipmentRef.current) {
        setPendingStartAfterShare(false);
        const s = shipmentRef.current;
        const started = { ...s, status: TrackingStatus.IN_TRANSIT };
        setShipment(started);
        await saveShipment(started);
        startLiveTracking(s.code, false); 
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pendingStartAfterShare]);

  const loadSettings = async () => {
      const settings = await getCompanySettings();
      setCompanySettings(settings);
  };

  useEffect(() => {
      shipmentRef.current = shipment;
  }, [shipment]);

  useEffect(() => {
    return () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      releaseWakeLock();
      // Correção: Agora encerra o assistente silenciosamente ao desmontar o componente
      stopVoiceAssistant(true);
    };
  }, []);

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = availableVoices.length > 0 ? availableVoices : window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.includes('pt-BR') && v.name.includes('Google')) || voices.find(v => v.lang.includes('pt-BR'));
      if (ptVoice) utterance.voice = ptVoice;
      utterance.lang = 'pt-BR';
      utterance.rate = 1.2; 
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startVoiceAssistant = (silent = false) => {
    const { webkitSpeechRecognition, SpeechRecognition } = window as unknown as IWindow;
    const Recognition = SpeechRecognition || webkitSpeechRecognition;
    if (!Recognition) return;
    
    if (recognitionRef.current) recognitionRef.current.stop();

    const rec = new Recognition();
    rec.lang = 'pt-BR'; 
    rec.continuous = true;
    rec.interimResults = false;

    rec.onstart = () => {
      setIsVoiceActive(true);
      if(!silent) speak("Assistente de voz ativado. Estou ouvindo.");
    };

    rec.onresult = (e: any) => {
        const cmd = e.results[e.results.length-1][0].transcript.toLowerCase();
        console.log("Comando recebido:", cmd);
        if (cmd.includes('ajuda') || cmd.includes('problema') || cmd.includes('emergência')) {
            speak("Entendido. Enviando alerta de emergência para a central agora.");
            sendWhatsAppUpdate('problem');
        } else if (cmd.includes('desativar') || cmd.includes('parar assistente')) {
            toggleVoiceAssistant();
        }
    };

    rec.onerror = () => setIsVoiceActive(false);
    rec.onend = () => setIsVoiceActive(false);

    recognitionRef.current = rec; 
    rec.start();
  };

  const stopVoiceAssistant = (silent = false) => { 
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
    }
    setIsVoiceActive(false); 
    if(!silent) speak("Assistente de voz desativado.");
  };

  const toggleVoiceAssistant = () => {
    if (isVoiceActive) stopVoiceAssistant();
    else startVoiceAssistant();
  };

  const requestWakeLock = async () => { 
    try { 
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (e) {} 
  };

  const releaseWakeLock = async () => { 
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const startLiveTracking = (currentCode: string, silentRestore = false) => {
      setIsLiveTracking(true);
      requestWakeLock();
      localStorage.setItem(`rodovar_tracking_state_${currentCode}`, 'active');
      
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      
      performUpdate();
      trackingIntervalRef.current = window.setInterval(() => performUpdate(), 15000);
      
      if(!silentRestore) {
          const s = shipmentRef.current;
          const firstName = s?.driverName?.split(' ')[0] || 'Motorista';
          speak(`Olá, ${firstName}. Rastreamento satélite ativado. Viagem para ${s?.destination} iniciada. Dirija com segurança!`);
          setTimeout(() => startVoiceAssistant(true), 5000);
      }
  };

  const stopLiveTracking = () => {
      if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
      setIsLiveTracking(false); 
      releaseWakeLock();
      if(shipment) localStorage.removeItem(`rodovar_tracking_state_${shipment.code}`);
  };

  const performUpdate = async () => {
      if (!shipmentRef.current) return;
      navigator.geolocation.getCurrentPosition(async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          
          let exactAddress = shipmentRef.current?.currentLocation.address || '';
          let city = shipmentRef.current?.currentLocation.city || '';
          let state = shipmentRef.current?.currentLocation.state || '';

          try {
              const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
              const data = await response.json();
              if (data && data.address) {
                  exactAddress = data.address.road || data.display_name.split(',')[0] || '';
                  city = data.address.city || data.address.town || data.address.village || city;
                  state = data.address.state || state;
              }
          } catch (e) {
              console.warn("Falha ao buscar endereço exato:", e);
          }

          const updated = { 
            ...shipmentRef.current!, 
            currentLocation: { 
              ...shipmentRef.current!.currentLocation, 
              city,
              state: state.toUpperCase(),
              address: exactAddress,
              coordinates: { lat, lng } 
            }, 
            lastUpdate: getNowFormatted() 
          };
          await saveShipment(updated);
          setShipment(updated);
      }, (err) => console.error("GPS Error:", err), { enableHighAccuracy: true });
  };

  const sendWhatsAppUpdate = async (type: 'start' | 'problem' | 'stop') => {
       const s = shipmentRef.current;
       if (!s) return;
       const magicLink = `${window.location.origin}/?track=${s.code}`;
       let msg = '';
       if (type === 'start') msg = `*🚚 INÍCIO DE VIAGEM*\n\nMotorista: ${s.driverName}\nCarga: ${s.code}\nDestino: ${s.destination}\n\n*Acompanhe:* ${magicLink}`;
       if (type === 'problem') msg = `*⚠️ EMERGÊNCIA RODOVAR*\n\nO motorista ${s.driverName} (Carga ${s.code}) solicitou ajuda imediata!\n\n*Localização:* ${magicLink}`;
       
       const url = `https://wa.me/${MANAGER_PHONE}?text=${encodeURIComponent(msg)}`;
       window.open(url, '_blank');
  };

  const handleShipmentLogin = async (e: any, codeOverride?: string) => {
    if (e) e.preventDefault();
    const searchCode = (codeOverride || code).toUpperCase();
    const found = await getShipment(searchCode);
    if (found) {
        setShipment(found); 
        shipmentRef.current = found;
        localStorage.setItem('rodovar_active_driver_code', found.code);
        if (localStorage.getItem(`rodovar_tracking_state_${found.code}`) === 'active') {
          startLiveTracking(found.code, true);
        }
    } else setError('Viagem não encontrada.');
  };

  const handleLogout = () => {
    stopLiveTracking();
    // Correção: Encerra o assistente silenciosamente ao sair
    stopVoiceAssistant(true);
    localStorage.removeItem('rodovar_active_driver_code');
    setShipment(null);
    setCode('');
    onClose();
  };

  const toggleTripStatus = async () => {
    if (isLiveTracking) {
        const stopped = { ...shipment!, status: TrackingStatus.STOPPED };
        setShipment(stopped); 
        await saveShipment(stopped);
        stopLiveTracking();
    } else {
        sendWhatsAppUpdate('start');
        setPendingStartAfterShare(true);
    }
  };

  if (!shipment) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-[fadeIn_0.5s]">
            <div className="bg-rodovar-gray w-full max-w-md p-10 rounded-3xl border border-gray-700 text-center shadow-2xl">
                <div className="bg-rodovar-yellow w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(255,215,0,0.3)]">
                  <SteeringWheelIcon className="w-10 h-10 text-black"/>
                </div>
                <h2 className="text-2xl font-black text-white uppercase mb-2">Painel do Motorista</h2>
                <div className="relative mb-6">
                    <input 
                      value={code} 
                      onChange={e => setCode(e.target.value.toUpperCase())} 
                      className="w-full bg-black border-2 border-gray-700 rounded-2xl p-5 text-rodovar-yellow text-center font-mono text-xl focus:border-rodovar-yellow outline-none transition-all" 
                      placeholder="CÓDIGO VIAGEM" 
                    />
                </div>
                <button onClick={e => handleShipmentLogin(e)} className="w-full bg-rodovar-yellow text-black font-black py-5 rounded-2xl uppercase tracking-widest hover:scale-[1.02] transition-transform active:scale-95 shadow-xl">
                  Acessar Viagem
                </button>
                {error && <p className="text-red-500 text-xs mt-6 font-bold">{error}</p>}
                <button onClick={onClose} className="mt-10 text-gray-600 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">← Voltar</button>
            </div>
          </div>
      );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8 flex flex-col gap-6 animate-[fadeIn_0.5s]">
        <div className="bg-rodovar-gray p-6 rounded-2xl border border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4 shadow-xl">
            <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-full border-2 border-rodovar-yellow overflow-hidden bg-gray-800">
                  {shipment.driverPhoto ? <img src={shipment.driverPhoto} className="w-full h-full object-cover" /> : <UserIcon className="w-6 h-6 m-auto mt-2 text-gray-500" />}
               </div>
               <div>
                  <h1 className="text-xl font-black text-white uppercase tracking-tighter">{shipment.code}</h1>
                  <p className="text-[10px] text-rodovar-yellow font-black uppercase tracking-widest">{shipment.driverName}</p>
               </div>
            </div>
            <button onClick={handleLogout} className="w-full md:w-auto text-red-400 text-[10px] font-black border border-red-900/30 px-6 py-3 rounded-xl hover:bg-red-900/10 uppercase tracking-widest">Sair do Painel</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 flex flex-col gap-6">
                <div className="bg-rodovar-gray p-8 rounded-3xl border border-gray-700 text-center shadow-2xl relative overflow-hidden">
                     <div className="relative z-10">
                        <span className="text-gray-500 text-[10px] font-black uppercase tracking-[0.3em] block mb-2">Destino Final</span>
                        <h2 className="text-3xl font-black text-white uppercase mb-8">{shipment.destination}</h2>
                        
                        <button 
                          onClick={toggleTripStatus} 
                          className={`w-full py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl transition-all hover:scale-[1.02] active:scale-95 text-sm flex items-center justify-center gap-3 ${isLiveTracking ? 'bg-red-600 text-white shadow-red-900/20' : 'bg-green-600 text-white shadow-green-900/20'}`}
                        >
                           <TruckIcon className="w-6 h-6" />
                           {isLiveTracking ? 'PARAR RASTREAMENTO' : 'INICIAR VIAGEM'}
                        </button>
                        
                        {pendingStartAfterShare && (
                          <div className="mt-4 p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-xl animate-pulse">
                             <p className="text-indigo-400 text-[10px] font-black uppercase">Compartilhando no WhatsApp...</p>
                          </div>
                        )}
                     </div>
                </div>

                <div className="bg-rodovar-gray p-6 rounded-3xl border border-gray-700 shadow-xl transition-all duration-500">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white text-xs font-black uppercase flex items-center gap-2">
                          <MicrophoneIcon className="w-4 h-4 text-rodovar-yellow" /> Comando de Voz
                        </h3>
                        <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${isVoiceActive ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                            {isVoiceActive ? 'Ouvindo' : 'Inativo'}
                        </span>
                    </div>
                    <button 
                      onClick={toggleVoiceAssistant} 
                      className={`w-full py-5 rounded-2xl border-2 font-black text-xs uppercase transition-all flex items-center justify-center gap-3 ${isVoiceActive ? 'bg-indigo-600 border-indigo-400 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] animate-pulse' : 'bg-black border-gray-700 text-gray-500 hover:border-rodovar-yellow'}`}
                    >
                       {isVoiceActive ? 'DESATIVAR ASSISTENTE' : 'ATIVAR ASSISTENTE DE VOZ'}
                    </button>
                    <p className="text-[9px] text-gray-500 mt-4 text-center uppercase font-bold tracking-tighter">Diga "AJUDA" ou "EMERGÊNCIA" para alertar a base.</p>
                </div>
            </div>

            <div className="lg:col-span-7 h-[400px] lg:h-auto rounded-3xl overflow-hidden border-2 border-gray-700 shadow-2xl bg-black">
                 <MapVisualization 
                    coordinates={shipment.currentLocation.coordinates} 
                    destinationCoordinates={shipment.destinationCoordinates} 
                    status={shipment.status} 
                    company={shipment.company}
                    className="w-full h-full"
                 />
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <button onClick={() => sendWhatsAppUpdate('problem')} className="bg-red-950/40 text-red-500 py-6 rounded-2xl border-2 border-red-900/50 font-black uppercase tracking-widest text-xs hover:bg-red-900/20 transition-all flex items-center justify-center gap-3 shadow-xl">
                🆘 SOS EMERGÊNCIA
             </button>
             <div className="bg-rodovar-gray p-6 rounded-2xl border border-gray-700 flex items-center justify-center gap-4">
                <div className={`w-3 h-3 rounded-full ${isLiveTracking ? 'bg-green-500 animate-ping' : 'bg-gray-700'}`}></div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {isLiveTracking ? 'SINAL GPS ATIVO' : 'MODO STANDBY'}
                </span>
             </div>
        </div>
    </div>
  );
};

export default DriverPanel;
