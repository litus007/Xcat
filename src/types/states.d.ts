import type { StreamPlayerManager } from "@/modules/stream-player-manager";

type BxStates = {
    supportedRegion: boolean;
    serverRegions: Record<string, ServerRegion>;
    selectedRegion: any;
    gsToken: string;
    isSignedIn: boolean;

    isPlaying: boolean;

    browser: {
        capabilities: {
            touch: boolean;
            batteryApi: boolean;
            deviceVibration: boolean;
            mkb: boolean;
            emulatedNativeMkb: boolean;
        };
    };

    userAgent: {
        isTv: boolean;
        capabilities: {
            touch: boolean;
            mkb: boolean;
        };
    };

    currentStream: Partial<{
        titleSlug: string;
        titleInfo: XcloudTitleInfo;
        xboxTitleId: number | null;
        gameSpecificSettings: boolean;

        streamPlayerManager: StreamPlayerManager | null;

        peerConnection: RTCPeerConnection;
        audioContext: AudioContext | null;
        audioGainNode: GainNode | null;
    }>;

    remotePlay: Partial<{
        server: string;
        titleId?: string;
    }>;

    pointerServerPort: number;
}
