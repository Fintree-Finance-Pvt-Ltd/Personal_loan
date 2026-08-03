import { Inject, Injectable } from '@nestjs/common';
import { LenderAdapter } from './lender-integration.types';
import { LenderIntegrationError } from './lender-integration.errors';

export const LENDER_ADAPTERS = Symbol('LENDER_ADAPTERS');

@Injectable()
export class LenderAdapterRegistry {
  private readonly adapters = new Map<string, LenderAdapter>();

  constructor(@Inject(LENDER_ADAPTERS) adapters: LenderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: LenderAdapter): void {
    const key = this.key(adapter.adapterKey, adapter.adapterVersion);
    if (this.adapters.has(key)) {
      throw new LenderIntegrationError('LENDER_ADAPTER_DUPLICATE', `Adapter ${key} is already registered.`, 'AUTHENTICATION_CONFIGURATION');
    }
    this.adapters.set(key, adapter);
  }

  resolve(adapterKey: string, adapterVersion?: string): LenderAdapter {
    if (!adapterVersion) {
      throw new LenderIntegrationError('LENDER_ADAPTER_NOT_CONFIGURED', 'Adapter version is required.', 'AUTHENTICATION_CONFIGURATION');
    }
    const adapter = this.adapters.get(this.key(adapterKey, adapterVersion));
    if (!adapter) {
      throw new LenderIntegrationError('LENDER_ADAPTER_NOT_CONFIGURED', `No adapter is configured for ${adapterKey}:${adapterVersion}.`, 'AUTHENTICATION_CONFIGURATION');
    }
    return adapter;
  }

  private key(adapterKey: string, adapterVersion: string): string {
    return `${adapterKey.trim().toUpperCase()}:${adapterVersion.trim().toUpperCase()}`;
  }
}
