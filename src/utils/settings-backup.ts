import { LocalDb } from "@utils/local-db/local-db";
import { AppInterface } from "@utils/global";
import { Toast } from "@utils/toast";
import { t } from "@utils/translation";
import { BxLogger } from "@utils/bx-logger";

const FORMAT = 'xcloud-catala-backup';
const FORMAT_VERSION = 1;
const MAX_SIZE = 8 * 1024 * 1024;
const LOG_TAG = 'SettingsBackup';

// Memòries internes regenerables: no cal copiar-les
const SKIP_KEYS = ['BetterXcloud.Patches.Cache', 'BetterXcloud.Patches.Cache.Signature', 'BetterXcloud.UserAgent', 'BetterXcloud.Reconnect'];

const isOwnKey = (key: string) => (key.startsWith('BetterXcloud') || key.startsWith('better_xcloud')) && !SKIP_KEYS.includes(key);

type BackupFile = {
    format: typeof FORMAT;
    version: number;
    createdAt: string;
    localStorage: Record<string, string>;
    indexedDb: Record<string, any[]>;
};

function readAllFromStore(db: IDBDatabase, name: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const request = db.transaction(name, 'readonly').objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function replaceStore(db: IDBDatabase, name: string, rows: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const store = tx.objectStore(name);
        store.clear();
        rows.forEach(row => store.put(row));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function createBackup(): Promise<string> {
    const backup: BackupFile = {
        format: FORMAT,
        version: FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        localStorage: {},
        indexedDb: {},
    };

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && isOwnKey(key)) {
            backup.localStorage[key] = localStorage.getItem(key) ?? '';
        }
    }

    try {
        const db = await LocalDb.getInstance().open();
        for (const name of Array.from(db.objectStoreNames)) {
            backup.indexedDb[name] = await readAllFromStore(db, name);
        }
    } catch (e) {
        BxLogger.warning(LOG_TAG, 'No es pot llegir IndexedDB', e);
    }

    return JSON.stringify(backup, null, 2);
}

/** Valida i aplica una còpia. Retorna el nombre d'elements restaurats. */
export async function restoreBackup(json: string): Promise<number> {
    if (json.length > MAX_SIZE) {
        throw new Error('Fitxer massa gran');
    }

    const data = JSON.parse(json) as BackupFile;
    if (data?.format !== FORMAT || typeof data.localStorage !== 'object') {
        throw new Error('Format no vàlid');
    }

    let count = 0;

    // Només s'accepten claus pròpies de l'aplicació i valors de text
    for (const [key, value] of Object.entries(data.localStorage)) {
        if (isOwnKey(key) && typeof value === 'string') {
            localStorage.setItem(key, value);
            count++;
        }
    }

    if (data.indexedDb && typeof data.indexedDb === 'object') {
        const db = await LocalDb.getInstance().open();
        const existing = new Set(Array.from(db.objectStoreNames));
        for (const [name, rows] of Object.entries(data.indexedDb)) {
            if (existing.has(name) && Array.isArray(rows)) {
                await replaceStore(db, name, rows);
                count += rows.length;
            }
        }
    }

    return count;
}

/** Desa la còpia: a l'app d'Android a Descàrregues; al navegador, com a fitxer descarregat. */
export async function exportBackupToFile() {
    const json = await createBackup();
    const name = `xcloud-catala-${new Date().toISOString().slice(0, 10)}.json`;

    if (AppInterface && (AppInterface as any).saveTextFile) {
        (AppInterface as any).saveTextFile(name, 'application/json', json);
        return;
    }

    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const $a = document.createElement('a');
    $a.href = url;
    $a.download = name;
    document.body.appendChild($a);
    $a.click();
    $a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);

    Toast.show(t('backup-exported'), name, { instant: true });
}

export function importBackupFromFile() {
    const $input = document.createElement('input');
    $input.type = 'file';
    $input.accept = '.json,application/json';
    $input.addEventListener('change', async () => {
        const file = $input.files?.[0];
        if (!file) {
            return;
        }

        try {
            const count = await restoreBackup(await file.text());
            Toast.show(t('backup-restored', { count }), '✅', { instant: true });
            window.setTimeout(() => window.location.reload(), 1500);
        } catch (e) {
            BxLogger.error(LOG_TAG, e);
            Toast.show(t('backup-invalid'), '❌', { instant: true });
        }
    });
    $input.click();
}
