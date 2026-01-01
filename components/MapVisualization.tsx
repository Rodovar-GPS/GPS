
import { Coordinates, RouteStop, TrackingStatus, TrackingData } from '../types';
import React, { useEffect, useRef } from 'react';

declare const L: any;

interface MapVisualizationProps {
  coordinates?: Coordinates; 
  destinationCoordinates?: Coordinates; 
  stops?: RouteStop[]; 
  userLocation?: Coordinates | null; 
  status?: TrackingStatus;
  company?: 'RODOVAR' | 'AXD'; 
  className?: string;
  loading?: boolean;
  shipmentData?: Partial<TrackingData>;
}

const toRad = (deg: number) => deg * (Math.PI / 180);
const toDeg = (rad: number) => rad * (180 / Math.PI);

const calculateBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
  const startLatRad = toRad(startLat);
  const startLngRad = toRad(startLng);
  const destLatRad = toRad(destLat);
  const destLngRad = toRad(destLng);
  const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
  const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360; 
};

const MapVisualization: React.FC<MapVisualizationProps> = React.memo(({ coordinates, destinationCoordinates, stops, userLocation, status, company, className, loading, shipmentData }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, {
        center: [-14.2350, -51.9253], 
        zoom: 4,
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true 
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
        className: 'map-tiles'
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.remove());
    polylinesRef.current = [];

    const bounds = L.latLngBounds([]);
    const routePoints: any[] = [];

    // Marcador da Localização do Usuário (Ponto Azul de GPS)
    if (userLocation) {
        const userIcon = L.divIcon({
            className: 'user-location-icon',
            html: `
                <div class="relative w-6 h-6">
                    <div class="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-50"></div>
                    <div class="relative w-4 h-4 m-1 bg-blue-600 border-2 border-white rounded-full shadow-lg"></div>
                </div>
            `,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 2000 })
            .addTo(map)
            .bindPopup("<div class='text-xs font-bold text-blue-600'>Sua Localização Atual</div>");
        markersRef.current.push(userMarker);
        bounds.extend([userLocation.lat, userLocation.lng]);
    }

    if (coordinates) {
        const isStopped = status === TrackingStatus.STOPPED;
        let rotationAngle = 0;
        if (destinationCoordinates?.lat) {
            rotationAngle = calculateBearing(coordinates.lat, coordinates.lng, destinationCoordinates.lat, destinationCoordinates.lng);
        }

        const cargoIconHtml = `
            <div class="relative flex items-center justify-center w-12 h-12">
                 ${isStopped ? '<div class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white text-[8px] font-bold px-2 py-0.5 rounded animate-bounce border border-white shadow-sm z-50">PARADO</div>' : ''}
                 <div class="absolute w-full h-full ${isStopped ? 'bg-red-500/30' : 'bg-rodovar-yellow/30'} rounded-full animate-ping opacity-75"></div>
                 <div class="relative w-10 h-10 ${isStopped ? 'bg-red-600' : 'bg-rodovar-yellow'} border-2 border-white rounded-full shadow-2xl z-20 flex items-center justify-center">
                    <div style="transform: rotate(${rotationAngle}deg); transition: transform 0.5s ease-in-out;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2L2 22L12 18L22 22L12 2Z" fill="${isStopped ? 'white' : 'black'}" stroke="none"/>
                        </svg>
                    </div>
                 </div>
            </div>
        `;

        const popupContent = `
            <div class="p-2 w-52 text-black">
                <div class="flex items-center gap-3 mb-3 border-b pb-2">
                    <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-50 flex items-center justify-center">
                        ${shipmentData?.driverPhoto ? `<img src="${shipmentData.driverPhoto}" class="w-full h-full object-cover" />` : `<span class="text-xl">👤</span>`}
                    </div>
                    <div>
                        <p class="text-[9px] text-gray-400 uppercase font-black leading-none mb-1">Motorista</p>
                        <p class="text-[11px] font-black uppercase leading-tight text-black">${shipmentData?.driverName || 'NÃO ATRIBUÍDO'}</p>
                        <p class="text-[8px] text-gray-400 font-bold uppercase">${shipmentData?.code || 'CARGA'}</p>
                    </div>
                </div>
                <div class="space-y-2">
                    <div>
                        <p class="text-[9px] text-gray-400 uppercase font-bold mb-0.5 tracking-tighter">Tipo de Carga</p>
                        <p class="text-[10px] font-black text-indigo-700 uppercase bg-indigo-50 px-1.5 py-0.5 rounded inline-block">${shipmentData?.loadType || 'CARGAS GERAIS'}</p>
                    </div>
                    <div class="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <p class="text-[9px] text-gray-400 uppercase font-bold mb-1 tracking-tighter">Trajeto Operacional</p>
                        <div class="flex flex-col gap-0.5">
                            <p class="text-[10px] font-bold text-gray-600 uppercase truncate">DE: ${shipmentData?.origin || 'ORIGEM'}</p>
                            <p class="text-[10px] font-black text-black uppercase truncate">PARA: ${shipmentData?.destination || 'DESTINO'}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const cargoMarker = L.marker([coordinates.lat, coordinates.lng], { 
            icon: L.divIcon({ className: 'custom-div-icon', html: cargoIconHtml, iconSize: [48, 48], iconAnchor: [24, 24] }), 
            zIndexOffset: 1000 
        })
            .addTo(map)
            .bindPopup(popupContent, { minWidth: 210 });

        markersRef.current.push(cargoMarker);
        bounds.extend([coordinates.lat, coordinates.lng]);
        routePoints.push([coordinates.lat, coordinates.lng]);
    }

    if (destinationCoordinates && (destinationCoordinates.lat !== 0 || destinationCoordinates.lng !== 0)) {
        const destIcon = L.divIcon({
            className: 'dest-icon',
            html: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#DC2626" stroke="white" stroke-width="1.5"/></svg>`,
            iconSize: [40, 40],
            iconAnchor: [20, 38] 
        });
        const destMarker = L.marker([destinationCoordinates.lat, destinationCoordinates.lng], { icon: destIcon })
            .addTo(map)
            .bindPopup("<b>DESTINO FINAL</b>");
        markersRef.current.push(destMarker);
        bounds.extend([destinationCoordinates.lat, destinationCoordinates.lng]);
        routePoints.push([destinationCoordinates.lat, destinationCoordinates.lng]);
    }

    if (routePoints.length > 1) {
        L.polyline(routePoints, { color: '#000000', weight: 3, opacity: 0.6, dashArray: '10, 10' }).addTo(map);
    }
    
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [coordinates, userLocation, destinationCoordinates, stops, status, company, shipmentData]);

  return (
    <div className={`relative bg-gray-100 rounded-xl overflow-hidden border border-gray-700 shadow-2xl ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[300px] z-0 bg-[#e5e5e5]" />
    </div>
  );
});

export default MapVisualization;
