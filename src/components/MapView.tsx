import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { MetaInfo, PublicGameState } from '../../shared/types';
import { TRUCK_STATUS } from '../labels';

interface Props {
  meta: MetaInfo;
  state: PublicGameState;
  selectedOrderId: string | null;
  selectedTruckId: string | null;
  onSelectOrder: (id: string | null) => void;
  onSelectTruck: (id: string | null) => void;
}

export default function MapView({ meta, state, selectedOrderId, selectedTruckId, onSelectTruck }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const routes = useRef<L.LayerGroup | null>(null);
  const trucks = useRef<L.LayerGroup | null>(null);
  const onTruck = useRef(onSelectTruck);
  onTruck.current = onSelectTruck;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, minZoom: 5, maxZoom: 10 }).setView([56.3, 24.2], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 10,
    }).addTo(m);

    const cities = L.layerGroup().addTo(m);
    for (const c of meta.cities) {
      L.circleMarker([c.lat, c.lng], {
        radius: 5,
        color: '#e8edf2',
        weight: 1.5,
        fillColor: '#0f1419',
        fillOpacity: 1,
      })
        .bindTooltip(c.name, { permanent: true, direction: 'right', className: 'city-label', offset: [6, 0] })
        .addTo(cities);
    }
    routes.current = L.layerGroup().addTo(m);
    trucks.current = L.layerGroup().addTo(m);
    map.current = m;

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, [meta]);

  useEffect(() => {
    const r = routes.current;
    const tl = trucks.current;
    if (!r || !tl) return;
    r.clearLayers();
    tl.clearLayers();
    const city = (id: string) => meta.cities.find((c) => c.id === id)!;

    // маршруты машин в пути
    for (const t of state.trucks) {
      if (!t.leg) continue;
      const to = city(t.leg.toId);
      L.polyline(
        [
          [t.lat, t.lng],
          [to.lat, to.lng],
        ],
        {
          color: t.status === 'to_pickup' ? '#8aa0b4' : '#4fb3ff',
          weight: 2.5,
          dashArray: t.status === 'to_pickup' ? '6 6' : undefined,
          opacity: 0.85,
        },
      ).addTo(r);
    }

    // выбранный заказ: маршрут груза + порожний пробег выбранной машины
    const order = state.orders.find((o) => o.id === selectedOrderId);
    if (order) {
      const a = city(order.fromId);
      const b = city(order.toId);
      L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        { color: '#ffb547', weight: 4, opacity: 0.95 },
      ).addTo(r);
      L.circleMarker([a.lat, a.lng], { radius: 9, color: '#ffb547', weight: 2, fillOpacity: 0 }).addTo(r);
      L.circleMarker([b.lat, b.lng], { radius: 9, color: '#ffb547', weight: 2, fillOpacity: 0.25 }).addTo(r);
      const truck = state.trucks.find((t) => t.id === selectedTruckId);
      if (truck && !truck.leg && truck.cityId !== order.fromId) {
        L.polyline(
          [
            [truck.lat, truck.lng],
            [a.lat, a.lng],
          ],
          { color: '#ffb547', weight: 2, dashArray: '4 8', opacity: 0.8 },
        ).addTo(r);
      }
    }

    // грузовики
    for (const t of state.trucks) {
      const tone = TRUCK_STATUS[t.status].tone;
      const icon = L.divIcon({
        className: '',
        html: `<div class="truck-pin ${tone} ${t.id === selectedTruckId ? 'selected' : ''}">#${t.number}</div>`,
        iconSize: [30, 22],
        iconAnchor: [15, 11],
      });
      L.marker([t.lat, t.lng], { icon, zIndexOffset: 1000 })
        .bindTooltip(`${t.driverName} · ${TRUCK_STATUS[t.status].label}`, { direction: 'top', offset: [0, -10] })
        .on('click', () => onTruck.current(t.id))
        .addTo(tl);
    }
  }, [meta, state, selectedOrderId, selectedTruckId]);

  const order = state.orders.find((o) => o.id === selectedOrderId);
  const cityName = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="map-wrap panel">
      <div ref={el} className="map" />
      <div className="map-legend">
        <span>
          <i className="lg cargo" /> груз
        </span>
        <span>
          <i className="lg empty" /> порожний пробег
        </span>
        <span>
          <i className="lg moving" /> в пути
        </span>
      </div>
      {order && (
        <div className="map-route">
          {order.id}: {cityName(order.fromId)} → {cityName(order.toId)}
        </div>
      )}
    </div>
  );
}
