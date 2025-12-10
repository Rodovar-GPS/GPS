
import React, { useEffect, useRef } from 'react';
import { Coordinates, RouteStop, TrackingStatus } from '../types';

declare const L: any;

interface MapVisualizationProps {
  coordinates?: Coordinates; 
  destinationCoordinates?: Coordinates; 
  stops?: RouteStop[]; // Intermediate stops
  userLocation?: Coordinates | null; 
  status?: TrackingStatus;
  className?: string;
  loading?: boolean;
}

const MapVisualization: React.FC<MapVisualizationProps> = React.memo(({ coordinates, destinationCoordinates, stops, userLocation, status, className, loading }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);

  // Initialize Map
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

  // Update Markers and Lines
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    polylinesRef.current.forEach(p => p.remove());
    polylinesRef.current = [];

    const bounds = L.latLngBounds([]);
    const routePoints: any[] = [];

    // 1. CARGO MARKER (Start of Line)
    if (coordinates) {
        // VISUAL ALERT FOR STOPPED STATUS
        const isStopped = status === TrackingStatus.STOPPED;
        
        const cargoIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="relative flex items-center justify-center w-10 h-10">
                     ${isStopped ? '<div class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white text-[8px] font-bold px-1 rounded animate-bounce border border-white">PARADO</div>' : ''}
                     <div class="relative w-6 h-6 ${isStopped ? 'bg-red-600' : 'bg-rodovar-yellow'} border-2 border-black rounded-full shadow-xl z-10 flex items-center justify-center">
                        <div class="w-2 h-2 bg-black rounded-full"></div>
                     </div>
                     <div class="absolute w-full h-full ${isStopped ? 'bg-red-600/50' : 'bg-rodovar-yellow/30'} rounded-full animate-ping opacity-75"></div>
                   </div>`,
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        });

        const cargoMarker = L.marker([coordinates.lat, coordinates.lng], { icon: cargoIcon })
            .addTo(map)
            .bindPopup(isStopped ? "<b>ALERTA: VEÍCULO PARADO</b>" : "<b>CAMINHÃO</b>");

        markersRef.current.push(cargoMarker);
        bounds.extend([coordinates.lat, coordinates.lng]);
        routePoints.push([coordinates.lat, coordinates.lng]);
    }

    // 2. INTERMEDIATE STOPS (Optimized Route)
    if (stops && stops.length > 0) {
        stops.forEach((stop, index) => {
             const stopIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="relative flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-[10px] font-bold rounded-full border-2 border-white shadow-md">${index + 1}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            
            const m = L.marker([stop.coordinates.lat, stop.coordinates.lng], { icon: stopIcon })
                .addTo(map)
                .bindPopup(`<b>PARADA ${index + 1}</b><br>${stop.city}<br>${stop.address}`);
            
            markersRef.current.push(m);
            bounds.extend([stop.coordinates.lat, stop.coordinates.lng]);
            routePoints.push([stop.coordinates.lat, stop.coordinates.lng]);
        });
    }

    // 3. DESTINATION
    if (destinationCoordinates && (destinationCoordinates.lat !== 0 || destinationCoordinates.lng !== 0)) {
        const destIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="relative flex items-center justify-center w-6 h-6">
                     <div class="relative w-4 h-4 bg-red-600 border-2 border-white rounded-sm transform rotate-45 shadow-md"></div>
                   </div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const destMarker = L.marker([destinationCoordinates.lat, destinationCoordinates.lng], { icon: destIcon })
            .addTo(map)
            .bindPopup("<b>DESTINO FINAL</b>");

        markersRef.current.push(destMarker);
        bounds.extend([destinationCoordinates.lat, destinationCoordinates.lng]);
        routePoints.push([destinationCoordinates.lat, destinationCoordinates.lng]);
    }

    // 4. DRAW ROUTE LINE
    if (routePoints.length > 1) {
        const line = L.polyline(routePoints, {
            color: '#000000',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(map);
        polylinesRef.current.push(line);
    }
    
    // 5. USER LOCATION
    if (userLocation) {
         const userIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="relative flex items-center justify-center w-6 h-6"><div class="relative w-3 h-3 bg-blue-400 border-2 border-white rounded-full shadow-lg"></div></div>`,
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

  }, [coordinates, userLocation, destinationCoordinates, stops, status]);

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
