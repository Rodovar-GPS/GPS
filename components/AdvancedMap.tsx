
import React, { useEffect, useRef, useState } from 'react';
import { TrackingData, TrackingStatus, StatusLabels } from '../types';
import { getAllShipments } from '../services/storageService';

declare const L: any;

interface AdvancedMapProps {
    className?: string;
}

const AdvancedMap: React.FC<AdvancedMapProps> = ({ className }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<Record<string, any>>({});
    const routesRef = useRef<Record<string, any>>({});
    const [activeShipments, setActiveShipments] = useState<TrackingData[]>([]);
    const [hasInitialFit, setHasInitialFit] = useState(false);

    // 1. Busca de dados periódica
    useEffect(() => {
        const loadAll = async () => {
            const dataMap = await getAllShipments();
            // Filtra apenas cargas que não foram entregues
            const active = Object.values(dataMap).filter(s => s.status !== TrackingStatus.DELIVERED);
            setActiveShipments(active);
        };

        loadAll();
        const interval = setInterval(loadAll, 10000); 
        return () => clearInterval(interval);
    }, []);

    // 2. Inicialização do Mapa com correção de tamanho
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        const map = L.map(mapContainerRef.current, {
            center: [-14.2350, -51.9253],
            zoom: 4,
            zoomControl: true,
            preferCanvas: true // Melhora performance com muitos elementos
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19,
            className: 'map-tiles'
        }).addTo(map);

        mapInstanceRef.current = map;

        // CORREÇÃO CRÍTICA: Aguarda a animação do container terminar para validar o tamanho
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 800);

        // Observer para mudanças de redimensionamento da janela ou container
        const resizeObserver = new ResizeObserver(() => {
            if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
        });
        resizeObserver.observe(mapContainerRef.current);

        return () => {
            clearTimeout(timer);
            resizeObserver.disconnect();
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // 3. Atualização Inteligente de Marcadores e Rotas
    useEffect(() => {
        if (!mapInstanceRef.current) return;
        const map = mapInstanceRef.current;

        const activeCodes = new Set(activeShipments.map(s => s.code));
        
        // Limpeza de veículos que saíram do rastreio
        Object.keys(markersRef.current).forEach(code => {
            if (!activeCodes.has(code)) {
                markersRef.current[code].remove();
                delete markersRef.current[code];
                if (routesRef.current[code]) {
                    routesRef.current[code].remove();
                    delete routesRef.current[code];
                }
            }
        });

        const bounds = L.latLngBounds([]);

        activeShipments.forEach(shipment => {
            const coords = shipment.currentLocation.coordinates;
            const destCoords = shipment.destinationCoordinates;
            const isRodovar = shipment.company === 'RODOVAR';
            const accentColor = isRodovar ? '#FFD700' : '#2563EB';
            const iconColor = isRodovar ? '#000000' : '#FFFFFF';

            // Marcador Customizado
            const iconHtml = `
                <div class="relative flex flex-col items-center">
                    <div class="absolute -top-9 bg-black/90 text-white text-[10px] font-bold px-2 py-1 rounded-md whitespace-nowrap border border-gray-700 shadow-2xl z-50">
                        ${shipment.driverName || 'Motorista'}
                    </div>
                    <div class="w-9 h-9 rounded-full border-2 border-white shadow-2xl flex items-center justify-center transition-transform duration-500 hover:scale-110" 
                         style="background-color: ${accentColor}; box-shadow: 0 0 15px ${accentColor}66">
                        <span class="text-[10px] font-black" style="color: ${iconColor}">${isRodovar ? 'R' : 'A'}</span>
                    </div>
                    <div class="w-0.5 h-2 bg-white/50"></div>
                </div>
            `;

            const icon = L.divIcon({
                className: 'custom-adv-icon',
                html: iconHtml,
                iconSize: [36, 45],
                iconAnchor: [18, 45]
            });

            // Adiciona ou Apenas Move o Marcador (Mais leve que recriar)
            if (markersRef.current[shipment.code]) {
                markersRef.current[shipment.code].setLatLng([coords.lat, coords.lng]);
                // Opcional: Atualizar ícone apenas se necessário
            } else {
                const m = L.marker([coords.lat, coords.lng], { icon })
                    .addTo(map)
                    .bindPopup(`
                        <div class="p-1">
                            <b class="text-lg">${shipment.code}</b><br/>
                            <span class="text-xs text-gray-500 uppercase font-bold">${shipment.driverName}</span>
                            <hr class="my-1 border-gray-200"/>
                            <div class="text-[10px] font-mono">
                                DESTINO: ${shipment.destination}<br/>
                                STATUS: ${StatusLabels[shipment.status]}
                            </div>
                        </div>
                    `);
                markersRef.current[shipment.code] = m;
            }

            // Desenha a linha de trajetória (Dashed)
            if (destCoords && (destCoords.lat !== 0 || destCoords.lng !== 0)) {
                const points = [[coords.lat, coords.lng], [destCoords.lat, destCoords.lng]];
                if (routesRef.current[shipment.code]) {
                    routesRef.current[shipment.code].setLatLngs(points);
                } else {
                    const line = L.polyline(points, {
                        color: accentColor,
                        weight: 2,
                        opacity: 0.3,
                        dashArray: '5, 10'
                    }).addTo(map);
                    routesRef.current[shipment.code] = line;
                }
            }

            bounds.extend([coords.lat, coords.lng]);
        });

        // Só ajusta o zoom automaticamente na primeira carga de dados
        if (!hasInitialFit && bounds.isValid() && activeShipments.length > 0) {
            map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12 });
            setHasInitialFit(true);
        }

    }, [activeShipments, hasInitialFit]);

    return (
        <div className={`relative bg-rodovar-black overflow-hidden shadow-inner ${className}`}>
            <div ref={mapContainerRef} className="w-full h-full z-0 bg-[#1a1a1a]" />
            
            {/* Overlay de Legenda */}
            <div className="absolute top-4 left-4 z-[500] bg-black/85 backdrop-blur-lg p-5 rounded-2xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.5)] min-w-[200px] animate-[fadeIn_0.5s]">
                 <h4 className="text-white text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                    </span>
                    Monitoramento Frota
                 </h4>
                 
                 <div className="space-y-4">
                    <div className="flex items-center justify-between group cursor-help">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-rodovar-yellow rounded-full border-2 border-white/20 shadow-[0_0_10px_rgba(255,215,0,0.4)]"></div>
                            <span className="text-[11px] text-gray-300 font-bold uppercase tracking-wide">Frota RODOVAR</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">({activeShipments.filter(s => s.company === 'RODOVAR').length})</span>
                    </div>
                    
                    <div className="flex items-center justify-between group cursor-help">
                        <div className="flex items-center gap-3">
                            <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white/20 shadow-[0_0_10px_rgba(37,99,235,0.4)]"></div>
                            <span className="text-[11px] text-gray-300 font-bold uppercase tracking-wide">Frota AXD</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">({activeShipments.filter(s => s.company === 'AXD').length})</span>
                    </div>

                    <div className="pt-3 border-t border-white/5">
                        <p className="text-[10px] text-gray-500 font-medium leading-relaxed">
                            <strong className="text-indigo-400">{activeShipments.length}</strong> veículos ativos transmitindo via satélite.
                        </p>
                        <p className="text-[9px] text-gray-600 mt-1 uppercase tracking-tighter">Atualização em tempo real</p>
                    </div>
                 </div>
            </div>

            {/* Indicador de Carregamento inicial */}
            {!hasInitialFit && activeShipments.length > 0 && (
                <div className="absolute inset-0 z-[600] bg-black/40 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-rodovar-gray p-4 rounded-xl border border-gray-700 flex items-center gap-3 shadow-2xl">
                        <div className="w-5 h-5 border-2 border-rodovar-yellow border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-bold text-white uppercase tracking-widest">Sincronizando Frota...</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdvancedMap;
