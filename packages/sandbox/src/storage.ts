export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface SandboxConfig {
  /** Base URL of the Homie backend. Used for proxying Jupiter price lookups. */
  backendUrl?: string;
}

let _storage: StorageAdapter | null = null;
let _backendUrl: string = "http://10.0.2.2:4000";

export function configureSandboxStorage(adapter: StorageAdapter): void {
  _storage = adapter;
}

export function configureSandbox(config: SandboxConfig): void {
  if (config.backendUrl) _backendUrl = config.backendUrl;
}

export function getStorage(): StorageAdapter {
  if (!_storage) {
    throw new Error(
      "[@homie/sandbox] Storage not configured. Call configureSandboxStorage() at app boot.",
    );
  }
  return _storage;
}

export function getBackendUrl(): string {
  return _backendUrl;
}
