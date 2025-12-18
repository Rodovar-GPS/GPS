
import { Coordinates, RouteStop, TrackingStatus, TrackingData } from '../types';
import React, { useEffect, useRef } from 'react';

declare const L: any;

interface MapVisualizationProps {
  coordinates?: Coordinates; 
  destinationCoordinates?: Coordinates; 
  stops?: RouteStop[]; // Intermediate stops
  userLocation?: Coordinates | null; 
  status?: TrackingStatus;
  company?: 'RODOVAR' | 'AXD'; 
  className?: string;
  loading?: boolean;
  // NOVO: Dados completos para o popup
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
    if (mapContainerRef.current.clientHeight === 0) return;

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
    setTimeout(() => { map.invalidateSize(); }, 300);

    return () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
            mapInstanceRef.current = null;
        }
    };
  }, []);

  useEffect(() => {
      if (!mapInstanceRef.current || !mapContainerRef.current) return;
      const resizeObserver = new ResizeObserver(() => {
          if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
      return () => resizeObserver.disconnect();
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

    let nextTargetLat = 0;
    let nextTargetLng = 0;
    
    if (stops && stops.length > 0) {
        nextTargetLat = stops[0].coordinates.lat;
        nextTargetLng = stops[0].coordinates.lng;
    } else if (destinationCoordinates) {
        nextTargetLat = destinationCoordinates.lat;
        nextTargetLng = destinationCoordinates.lng;
    }

    if (coordinates) {
        const isStopped = status === TrackingStatus.STOPPED;
        let rotationAngle = 0;
        if (nextTargetLat !== 0 && (coordinates.lat !== nextTargetLat || coordinates.lng !== nextTargetLng)) {
            rotationAngle = calculateBearing(coordinates.lat, coordinates.lng, nextTargetLat, nextTargetLng);
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

        const cargoIcon = L.divIcon({
            className: 'custom-div-icon',
            html: cargoIconHtml,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });

        // POPUP CUSTOMIZADO COM FOTO E INFO
        const popupContent = `
            <div class="p-2 w-48 text-black">
                <div class="flex items-center gap-3 mb-3 border-b pb-2">
                    <div class="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-50">
                        ${shipmentData?.driverPhoto ? `<img src="${shipmentData.driverPhoto}" class="w-full h-full object-cover" />` : `<div class="w-full h-full flex items-center justify-center text-gray-400">👤</div>`}
                    </div>
                    <div>
                        <p class="text-[10px] text-gray-400 uppercase font-black leading-none">Motorista</p>
                        <p class="text-xs font-black uppercase leading-tight">${shipmentData?.driverName || 'NÃO ATRIBUÍDO'}</p>
                    </div>
                </div>
                <div class="space-y-2">
                    <div>
                        <p class="text-[9px] text-gray-400 uppercase font-bold">Tipo de Carga</p>
                        <p class="text-[10px] font-black text-indigo-700 uppercase">${shipmentData?.loadType || 'CARGAS GERAIS'}</p>
                    </div>
                    <div>
                        <p class="text-[9px] text-gray-400 uppercase font-bold">Trajeto</p>
                        <p class="text-[10px] font-bold uppercase leading-tight">${shipmentData?.origin} <br/> <span class="text-indigo-600">➔</span> ${shipmentData?.destination}</p>
                    </div>
                    <div class="pt-1 border-t mt-1">
                        <p class="text-[9px] font-bold text-gray-500 uppercase">Rumo a ${Math.round(rotationAngle)}°</p>
                    </div>
                </div>
            </div>
        `;

        const cargoMarker = L.marker([coordinates.lat, coordinates.lng], { icon: cargoIcon, zIndexOffset: 1000 })
            .addTo(map)
            .bindPopup(popupContent);

        markersRef.current.push(cargoMarker);
        bounds.extend([coordinates.lat, coordinates.lng]);
        routePoints.push([coordinates.lat, coordinates.lng]);
    }

    if (stops && stops.length > 0) {
        const isRodovar = company === 'RODOVAR';
        const accentColor = isRodovar ? '#FFD700' : '#2563EB';
        const textColor = isRodovar ? '#000000' : '#FFFFFF';

        stops.forEach((stop, index) => {
             const stopIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `
                <div class="relative flex items-center justify-center">
                    <div class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center font-black text-xs shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-transform hover:scale-110" 
                         style="background-color: ${accentColor}; color: ${textColor};">
                        ${index + 1}
                    </div>
                </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
            
            const m = L.marker([stop.coordinates.lat, stop.coordinates.lng], { icon: stopIcon })
                .addTo(map)
                .bindPopup(`<b>PARADA ${index + 1}</b><br>${stop.city}<br>${stop.address}`);
            
            markersRef.current.push(m);
            bounds.extend([stop.coordinates.lat, stop.coordinates.lng]);
            routePoints.push([stop.coordinates.lat, stop.coordinates.lng]);
        });
    }

    if (destinationCoordinates && (destinationCoordinates.lat !== 0 || destinationCoordinates.lng !== 0)) {
        const destIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `
             <div class="relative w-10 h-10 flex justify-center items-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-xl filter">
                    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#DC2626" stroke="white" stroke-width="1.5"/>
                </svg>
             </div>
            `,
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
        L.polyline(routePoints, {
            color: '#FFFFFF',
            weight: 6,
            opacity: 0.8
        }).addTo(map);

        const line = L.polyline(routePoints, {
            color: '#000000',
            weight: 3,
            opacity: 1,
            dashArray: '10, 10'
        }).addTo(map);
        polylinesRef.current.push(line);
    }
    
    if (userLocation) {
         const userIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="relative flex items-center justify-center w-6 h-6"><div class="relative w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg ring-2 ring-blue-500/30"></div></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map);
    }

    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else {
        map.setView([-14.2350, -51.9253], 4);
    }

  }, [coordinates, userLocation, destinationCoordinates, stops, status, company, shipmentData]);

  return (
    <div className={`relative bg-gray-100 rounded-xl overflow-hidden border border-gray-700 shadow-2xl ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[300px] z-0 bg-[#e5e5e5]" />
      {loading && (
        <div className="absolute inset-0 z-[500] bg-black/50 flex items-center justify-center backdrop-blur-sm">
            <span className="text-white bg-black px-4 py-2 rounded-full font-bold text-xs animate-pulse">CARREGANDO ROTA OTIMIZADA...</span>
        </div>
      )}
    </div>
  );
});

export default MapVisualization;
