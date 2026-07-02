import Store from 'electron-store';
import { Preferences, DEFAULT_PREFERENCES } from '../../shared/types';

export class PreferencesStore {
  private store: Store<Preferences>;

  constructor() {
    this.store = new Store<Preferences>({
      defaults: DEFAULT_PREFERENCES,
      name: 'preferences'
    });
  }

  get(): Preferences {
    return this.store.store;
  }

  set(prefs: Partial<Preferences>): void {
    this.store.set(prefs);
  }

  getApiKey(): string {
    return this.store.get('apiKey');
  }

  setApiKey(key: string): void {
    this.store.set('apiKey', key);
  }
}
