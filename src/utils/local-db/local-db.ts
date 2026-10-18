export class LocalDb {
    private static instance: LocalDb;
    public static getInstance = () => LocalDb.instance ?? (LocalDb.instance = new LocalDb());
    // private readonly LOG_TAG = 'LocalDb';

    static readonly DB_NAME = 'BetterXcloud';
    static readonly DB_VERSION = 4;

    static readonly TABLE_VIRTUAL_CONTROLLERS = 'virtual_controllers';
    static readonly TABLE_CONTROLLER_SHORTCUTS = 'controller_shortcuts';
    static readonly TABLE_CONTROLLER_CUSTOMIZATIONS = 'controller_customizations';
    static readonly TABLE_CONTROLLER_SETTINGS = 'controller_settings';
    static readonly TABLE_KEYBOARD_SHORTCUTS = 'keyboard_shortcuts';

    private db!: IDBDatabase;

    open() {
        return new Promise<IDBDatabase>((resolve, reject) => {
            if (this.db) {
                resolve(this.db);
                return;
            }

            const request = window.indexedDB.open(LocalDb.DB_NAME, LocalDb.DB_VERSION);
            request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
                const db = (e.target! as any).result as IDBDatabase;

                // Delete "undefined" table
                if (db.objectStoreNames.contains('undefined')) {
                    db.deleteObjectStore('undefined');
                }

                // Virtual controller
                if (!db.objectStoreNames.contains(LocalDb.TABLE_VIRTUAL_CONTROLLERS)) {
                    db.createObjectStore(LocalDb.TABLE_VIRTUAL_CONTROLLERS, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                }

                // Controller shortcuts
                if (!db.objectStoreNames.contains(LocalDb.TABLE_CONTROLLER_SHORTCUTS)) {
                    db.createObjectStore(LocalDb.TABLE_CONTROLLER_SHORTCUTS, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                }

                // Controller settings
                if (!db.objectStoreNames.contains(LocalDb.TABLE_CONTROLLER_SETTINGS)) {
                    db.createObjectStore(LocalDb.TABLE_CONTROLLER_SETTINGS, {
                        keyPath: 'id',
                    });
                }

                // Controller mappings
                if (!db.objectStoreNames.contains(LocalDb.TABLE_CONTROLLER_CUSTOMIZATIONS)) {
                    db.createObjectStore(LocalDb.TABLE_CONTROLLER_CUSTOMIZATIONS, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                }

                // Keyboard shortcuts
                if (!db.objectStoreNames.contains(LocalDb.TABLE_KEYBOARD_SHORTCUTS)) {
                    db.createObjectStore(LocalDb.TABLE_KEYBOARD_SHORTCUTS, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                }
            };

            request.onerror = e => {
                console.log(e);
                alert((e.target as any).error.message);
                reject && reject();
            };

            request.onsuccess = e => {
                this.db = (e.target as any).result;
                resolve(this.db);
            };
        });
    }
}
