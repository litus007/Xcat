import { StorageKey } from "@/enums/pref-keys";
import { BxEventBus } from "./bx-event-bus";

/**
 * Llistes locals (sense cap petició de xarxa).
 * Es guarden al localStorage i es poden editar manualment des de la consola del navegador.
 */
export class LocalLists {
    private static readSchema(key: string, supportedSchema = 1): any | null {
        try {
            const info = JSON.parse(window.localStorage.getItem(key) || '{}');
            if (info.$schemaVersion === supportedSchema) {
                return info;
            }
        } catch (e) {}

        return null;
    }

    static getNativeMkbCustomList(): ForceNativeMkbResponse['data'] {
        return LocalLists.readSchema(StorageKey.LIST_FORCE_NATIVE_MKB)?.data || {};
    }

    static getTouchControlCustomList(): string[] {
        try {
            const list = JSON.parse(window.localStorage.getItem(StorageKey.LIST_CUSTOM_TOUCH_LAYOUTS) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    /** Disposicions tàctils pròpies: { [xboxTitleId]: { default_layout, layouts } } */
    static getTouchLayouts(): Record<string, any> {
        try {
            return JSON.parse(window.localStorage.getItem(StorageKey.CUSTOM_TOUCH_LAYOUTS) || '{}') || {};
        } catch (e) {
            return {};
        }
    }

    static getLocalCoOpList(): Set<string> {
        const info = LocalLists.readSchema(StorageKey.LIST_LOCAL_CO_OP);
        const ids = new Set<string>(Object.keys(info?.data || {}));
        // Notifica la llista (buida o no) perquè la resta de mòduls s'inicialitzin
        window.setTimeout(() => BxEventBus.Script.emit('list.localCoOp.updated', { ids }), 0);
        return ids;
    }
}
