'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Location } from '../shared/domain';
const city: L.LatLngExpression = [17.385, 78.4867];
const pin = L.divIcon({ className: 'civic-map-pin', html: '<span></span>', iconSize: [26, 34], iconAnchor: [13, 34] });
type Props = { location: Location; onChange?: (patch: Partial<Location>) => void };
export default function LocationMap({ location, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), marker = useRef<L.Marker | null>(null);
  const change = useRef(onChange); change.current = onChange;
  const [failed, setFailed] = useState(false);
  const editable = !!onChange;
  useEffect(() => {
    if (!host.current) return;
    // Leaflet's animated zoom timeout can outlive a collapsed/unmounted picker.
    const m = L.map(host.current, { scrollWheelZoom: false, zoomAnimation: false }).setView(city, 12);
    map.current = m;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setFailed(true)).addTo(m);
    const select = (point: L.LatLng) => change.current?.({ lat: Number(point.lat.toFixed(6)), lng: Number(point.wrap().lng.toFixed(6)) });
    if (editable) m.on('click', (e: L.LeafletMouseEvent) => select(e.latlng));
    const resize = new ResizeObserver(() => m.invalidateSize()); resize.observe(host.current);
    return () => { resize.disconnect(); m.remove(); map.current = null; marker.current = null; };
  }, [editable]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (location.lat === null || location.lng === null || !Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
      marker.current?.remove(); marker.current = null; return;
    }
    const point: L.LatLngExpression = [location.lat, location.lng];
    if (!marker.current) {
      marker.current = L.marker(point, { icon: pin, draggable: editable, title: 'Reported location', alt: 'Reported location' }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng().wrap();
        change.current?.({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
      });
    } else marker.current.setLatLng(point);
    m.panTo(point);
  }, [location.lat, location.lng, editable]);
  return <div className="location-map-panel">
    <p className="muted">{editable ? 'Tap the map to place a pin, or drag it to adjust. With the map focused, use arrow keys to pan and + / − to zoom, then choose Use map center. A pin does not verify accuracy.' : 'Resident-supplied position; not independently verified.'}</p>
    <div ref={host} className="location-map" role="region" aria-label={editable ? 'Hyderabad location picker' : 'Reported location map'} />
    {failed && <p role="status" className="notice">Map tiles could not load. You can still enter a landmark and coordinates manually.</p>}
    <p aria-live="polite" className="map-coordinates">{location.lat !== null && location.lng !== null ? `Selected: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : 'No pin selected'}</p>
    <div className="map-actions">
      {editable && <button type="button" className="secondary" onClick={() => { const p = map.current?.getCenter().wrap(); if (p) onChange?.({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) }); }}>Use map center</button>}
      {editable && <button type="button" className="secondary" onClick={() => onChange?.({ lat: null, lng: null })}>Clear pin</button>}
      <button type="button" className="secondary" onClick={() => map.current?.setView(city, 12)}>View Hyderabad</button>
    </div>
  </div>;
}
