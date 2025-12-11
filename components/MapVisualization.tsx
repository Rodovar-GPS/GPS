
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

// Helper to calculate bearing (angle) between two points
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
  return (brng + 360) % 360; // Normalize to 0-360
};

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

    // Determine the next immediate target to calculate direction arrow
    let nextTargetLat = 0;
    let nextTargetLng = 0;
    
    if (stops && stops.length > 0) {
        nextTargetLat = stops[0].coordinates.lat;
        nextTargetLng = stops[0].coordinates.lng;
    } else if (destinationCoordinates) {
        nextTargetLat = destinationCoordinates.lat;
        nextTargetLng = destinationCoordinates.lng;
    }

    // 1. CARGO MARKER (Start of Line)
    if (coordinates) {
        const isStopped = status === TrackingStatus.STOPPED;
        
        // Calculate Rotation Angle
        let rotationAngle = 0;
        if (nextTargetLat !== 0 && (coordinates.lat !== nextTargetLat || coordinates.lng !== nextTargetLng)) {
            rotationAngle = calculateBearing(coordinates.lat, coordinates.lng, nextTargetLat, nextTargetLng);
        }

        // Professional SVG Icon with Directional Arrow
        const cargoIconHtml = `
            <div class="relative flex items-center justify-center w-12 h-12">
                 ${isStopped ? '<div class="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-red-600 text-white text-[8px] font-bold px-2 py-0.5 rounded animate-bounce border border-white shadow-sm z-50">PARADO</div>' : ''}
                 
                 <!-- Outer Pulse Ring -->
                 <div class="absolute w-full h-full ${isStopped ? 'bg-red-500/30' : 'bg-rodovar-yellow/30'} rounded-full animate-ping opacity-75"></div>
                 
                 <!-- Main Circle Body -->
                 <div class="relative w-10 h-10 ${isStopped ? 'bg-red-600' : 'bg-rodovar-yellow'} border-2 border-white rounded-full shadow-2xl z-20 flex items-center justify-center">
                    <!-- Rotating Arrow -->
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

        const cargoMarker = L.marker([coordinates.lat, coordinates.lng], { icon: cargoIcon, zIndexOffset: 1000 })
            .addTo(map)
            .bindPopup(isStopped ? "<b>ALERTA: VEÍCULO PARADO</b>" : `<b>CAMINHÃO</b><br>Rumo a ${Math.round(rotationAngle)}°`);

        markersRef.current.push(cargoMarker);
        bounds.extend([coordinates.lat, coordinates.lng]);
        routePoints.push([coordinates.lat, coordinates.lng]);
    }

    // 2. INTERMEDIATE STOPS (Optimized Route)
    if (stops && stops.length > 0) {
        stops.forEach((stop, index) => {
             const stopIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `
                <div class="relative flex flex-col items-center justify-center">
                    <div class="w-8 h-8 bg-blue-600 text-white text-[12px] font-bold rounded-full border-2 border-white shadow-lg flex items-center justify-center relative z-10">
                        ${index + 1}
                    </div>
                    <div class="w-1 h-3 bg-blue-600 -mt-1"></div>
                </div>
                `,
                iconSize: [32, 44],
                iconAnchor: [16, 44]
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
        // Professional Pin Icon (SVG style)
        const destIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `
             <div class="relative w-10 h-10 flex justify-center items-center">
                <!-- Pin Shape -->
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-xl filter">
                    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#DC2626" stroke="white" stroke-width="1.5"/>
                </svg>
             </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 38] // Anchor at the tip of the pin
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
        // Outer glow line for contrast
        L.polyline(routePoints, {
            color: '#FFFFFF',
            weight: 6,
            opacity: 0.8
        }).addTo(map);

        // Main dash line
        const line = L.polyline(routePoints, {
            color: '#000000',
            weight: 3,
            opacity: 1,
            dashArray: '10, 10'
        }).addTo(map);
        polylinesRef.current.push(line);
    }
    
    // 5. USER LOCATION
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
