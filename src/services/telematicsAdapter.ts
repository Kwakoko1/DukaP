export interface ITelematicsPosition {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading_deg: number;
  ignition: boolean;
  odometer_km: number;
  fuel_level_percent?: number;
  timestamp: number;
}

export type GeofenceEvent = 'ENTERED_GEOFENCE' | 'EXITED_GEOFENCE' | 'OVERSPEED' | 'UNAUTHORIZED_MOVEMENT';

export interface IGeofenceAlert {
  id: string;
  vehicle_id: string;
  geofence_name: string;
  event_type: GeofenceEvent;
  speed_kmh?: number;
  speed_limit_kmh?: number;
  timestamp: number;
}

export interface ITelematicsProvider {
  getProviderName(): string;
  fetchLatestPosition(vehicleId: string): Promise<ITelematicsPosition | null>;
  streamPositions(tenantId: string, callback: (pos: ITelematicsPosition) => void): () => void;
}

export class DefaultKwakoPosGpsAdapter implements ITelematicsProvider {
  getProviderName(): string {
    return 'KwakoPos Telematics Adapter v1.0';
  }

  async fetchLatestPosition(vehicleId: string): Promise<ITelematicsPosition | null> {
    return {
      vehicle_id: vehicleId,
      latitude: -6.7924 + (Math.random() - 0.5) * 0.05, // Dar es Salaam coordinates baseline
      longitude: 39.2083 + (Math.random() - 0.5) * 0.05,
      speed_kmh: Math.floor(40 + Math.random() * 45),
      heading_deg: Math.floor(Math.random() * 360),
      ignition: true,
      odometer_km: 45200,
      fuel_level_percent: 78,
      timestamp: Date.now()
    };
  }

  streamPositions(_tenantId: string, callback: (pos: ITelematicsPosition) => void): () => void {
    const timer = setInterval(() => {
      callback({
        vehicle_id: 'vh-active-demo',
        latitude: -6.7924 + (Math.random() - 0.5) * 0.02,
        longitude: 39.2083 + (Math.random() - 0.5) * 0.02,
        speed_kmh: Math.floor(50 + Math.random() * 30),
        heading_deg: Math.floor(Math.random() * 360),
        ignition: true,
        odometer_km: 45210,
        fuel_level_percent: 76,
        timestamp: Date.now()
      });
    }, 10000);

    return () => clearInterval(timer);
  }
}
