import { StorageKey, type StreamPref } from "@/enums/pref-keys";
import { BaseSettingsStorage } from "./base-settings-storage";
import { StreamSettingsStorage } from "./stream-settings-storage";

export class GameSettingsStorage extends BaseSettingsStorage<StreamPref> {
    constructor(id: number) {
        super(`${StorageKey.STREAM}.${id}`, StreamSettingsStorage.DEFINITIONS);
    }

    isEmpty() {
        return Object.keys(this.settings).length === 0;
    }
}
