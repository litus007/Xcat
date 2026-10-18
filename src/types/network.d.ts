type RemotePlayConsoleAddresses = {
    [key: string]: number[],
}

type ForceNativeMkbResponse = {
    $schemaVersion: number;
    data: { [key: string]: string };
}
