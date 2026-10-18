import { LocalDb } from "./local-db";

export class BaseLocalTable<T extends BaseRecord> {
    private tableName: string;

    constructor(tableName: string) {
        this.tableName = tableName;
    }

    protected async prepareTable(type: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
        const db = await LocalDb.getInstance().open();
        const transaction = db.transaction(this.tableName, type);
        const table = transaction.objectStore(this.tableName);

        return table;
    }

    // Convert IndexDB method to Promise
    protected call(method: any) {
        return new Promise(resolve => {
            const request = method.call(null, ...Array.from(arguments).slice(1));
            request.onsuccess = (e: Event) => {
                resolve((e.target as any).result);
            };
        });
    }

    async count(): Promise<number> {
        const table = await this.prepareTable();
        // @ts-ignore
        return this.call(table.count.bind(table));
    }

    async add(data: T): Promise<number> {
        const table = await this.prepareTable('readwrite');
        // @ts-ignore
        return this.call(table.add.bind(table), ...arguments);
    }

    async put(data: T): Promise<number> {
        const table = await this.prepareTable('readwrite');
        // @ts-ignore
        return this.call(table.put.bind(table), ...arguments);
    }

    async delete(id: T['id']): Promise<number> {
        const table = await this.prepareTable('readwrite');
        // @ts-ignore
        return this.call(table.delete.bind(table), ...arguments);
    }

    async get(id: T['id']): Promise<T> {
        const table = await this.prepareTable();
        // @ts-ignore
        return this.call(table.get.bind(table), ...arguments);
    }

    async getAll(): Promise<{ [key: string]: T }> {
        const table = await this.prepareTable();
        // @ts-ignore
        const all = await (this.call(table.getAll.bind(table), ...arguments) as Promise<T[]>);
        const results: { [key: string]: T } = {};

        all.forEach(item => {
            results[item.id as T['id']] = item;
        });

        return results;
    }
}
