import { NATIVE_FETCH } from "./bx-flags"

export class XboxApi {
    private static CACHED_TITLES: Record<string, string> = {};

    static async getProductTitle(xboxTitleId: number | string): Promise<string | undefined> {
        xboxTitleId = xboxTitleId.toString();
        if (XboxApi.CACHED_TITLES[xboxTitleId]) {
            return XboxApi.CACHED_TITLES[xboxTitleId];
        }

        let title: string;
        try {
            const url = `https://displaycatalog.mp.microsoft.com/v7.0/products/lookup?market=US&languages=en&value=${xboxTitleId}&alternateId=XboxTitleId&fieldsTemplate=browse`;
            const resp = await NATIVE_FETCH(url);
            const json = await resp.json();

            title = json['Products'][0]['LocalizedProperties'][0]['ProductTitle'];
        } catch (e) {
            title = 'Unknown Game #' + xboxTitleId;
        }

        XboxApi.CACHED_TITLES[xboxTitleId] = title;
        return title;
    }
}
