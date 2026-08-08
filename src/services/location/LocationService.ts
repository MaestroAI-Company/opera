import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timestamp: number;
};

const CACHE_TTL_MS = 15 * 60 * 1000;

class LocationServiceImpl {
  private cache: LocationSnapshot | null = null;

  //ask os for permission
  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      console.warn('[LocationService] requestPermission failed:', e);
      return false;
    }
  }

  //read current permission without prompting
  async hasPermission(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  //fetch position (and reverse geocode when possible) and cache it
  async refresh(): Promise<LocationSnapshot | null> {
    try {
      if (!(await this.hasPermission())) return null;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const snap: LocationSnapshot = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        timestamp: Date.now(),
      };
      //reverse geocode only where supported (native)
      if (Platform.OS !== 'web') {
        try {
          const places = await Location.reverseGeocodeAsync({
            latitude: snap.latitude,
            longitude: snap.longitude,
          });
          const p = places?.[0];
          if (p) {
            snap.city = p.city || p.subregion || null;
            snap.region = p.region || null;
            snap.country = p.country || null;
          }
        } catch (e) {
          //reverse geocode is best-effort
        }
      }
      this.cache = snap;
      return snap;
    } catch (e) {
      console.warn('[LocationService] refresh failed:', e);
      return null;
    }
  }

  //cached snapshot; refreshes in background when stale
  getCached(): LocationSnapshot | null {
    if (this.cache && Date.now() - this.cache.timestamp > CACHE_TTL_MS) {
      this.refresh().catch(() => {});
    }
    return this.cache;
  }

  //string ready to inject into a system prompt, or empty when unavailable
  getContextString(): string {
    const s = this.cache;
    if (!s) return '';
    const parts: string[] = [];
    const place = [s.city, s.region, s.country].filter(Boolean).join(', ');
    if (place) parts.push(place);
    parts.push(`lat ${s.latitude.toFixed(4)}, lon ${s.longitude.toFixed(4)}`);
    return parts.join(' — ');
  }
}

export const LocationService = new LocationServiceImpl();
