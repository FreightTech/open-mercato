import type { CarrierAdapter } from '../lib/carrier-adapter'

/**
 * Singleton registry for carrier adapters.
 * Modules register concrete adapters at startup via DI.
 */
export class CarrierRegistryService {
  private adapters = new Map<string, CarrierAdapter>()

  register(adapter: CarrierAdapter): void {
    this.adapters.set(adapter.carrierName.toLowerCase(), adapter)
  }

  get(carrierName: string): CarrierAdapter | undefined {
    return this.adapters.get(carrierName.toLowerCase())
  }

  list(): CarrierAdapter[] {
    return Array.from(this.adapters.values())
  }

  has(carrierName: string): boolean {
    return this.adapters.has(carrierName.toLowerCase())
  }

  names(): string[] {
    return Array.from(this.adapters.keys())
  }
}
