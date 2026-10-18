import type { AllPresets, AllPresetsData, PresetRecord, PresetRecords } from "@/types/presets";
import { deepClone } from "../global";
import { BaseLocalTable } from "./base-table";

export abstract class BasePresetsTable<T extends PresetRecord> extends BaseLocalTable<T> {
    protected abstract TABLE_PRESETS: string;
    protected abstract DEFAULT_PRESETS: PresetRecords<T>;
    protected abstract readonly DEFAULT_PRESET_ID: number;
    abstract readonly BLANK_PRESET_DATA: T['data'];

    async newPreset(name: string, data: T['data']) {
        const newRecord = { name, data } as T;
        return await this.add(newRecord);
    }

    async updatePreset(preset: T) {
        return await this.put(preset);
    }

    async deletePreset(id: number) {
        return this.delete(id);
    }

    async getPreset(id: number): Promise<T | null> {
        if (id === 0) {
            return null;
        }

        if (id < 0) {
            return this.DEFAULT_PRESETS[id];
        }

        let preset = await this.get(id);
        if (!preset) {
            preset = this.DEFAULT_PRESETS[this.DEFAULT_PRESET_ID];
        }

        return preset;
    }

    async getPresets(): Promise<AllPresets<T>> {
        let all = deepClone(this.DEFAULT_PRESETS) as Record<string, T>;
        const presets: AllPresets<T> = {
            default: Object.keys(this.DEFAULT_PRESETS).map(key => parseInt(key)),
            custom: [],
            data: {},
        }

        const count = await this.count();
        if (count > 0) {
            const items = await this.getAll();

            let id: keyof typeof items;
            for (id in items) {
                const item = items[id]!;
                presets.custom.push(item.id!);
                all[item.id] = item;
            }
        }

        presets.data = all;
        return presets;
    }

    async getPresetsData(): Promise<AllPresetsData<T>> {
        const presetsData: AllPresetsData<T> = {}
        for (const id in this.DEFAULT_PRESETS) {
            const preset = this.DEFAULT_PRESETS[id];
            presetsData[id] = deepClone(preset.data);
        }

        const count = await this.count();
        if (count > 0) {
            const items = await this.getAll();

            let id: keyof typeof items;
            for (id in items) {
                const item = items[id]!;
                presetsData[item.id] = item.data;
            }
        }

        return presetsData;
    }
}
