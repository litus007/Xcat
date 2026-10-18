import { StreamPref } from "@/enums/pref-keys";
import { STATES } from "./global";
import { humanFileSize, secondsToHm } from "./html";
import { BxLogger } from "./bx-logger";
import { StreamStat } from "@/enums/pref-values";
import { BxEventBus } from "./bx-event-bus";
import { getStreamPref } from "@/utils/pref-utils";


type CurrentStats = {
    [StreamStat.PING]: {
        current: number;
        grades: [number, number, number];
        toString: () => string;
    };

    [StreamStat.JITTER]: {
        current: number;
        grades: [number, number, number];
        toString: () => string;
    };

    [StreamStat.RESOLUTION]: {
        current: string;
        toString: () => string;
    };

    [StreamStat.FPS]: {
        current: number;
        toString: () => string;
    };

    [StreamStat.BITRATE]: {
        current: number;
        toString: () => string;
    };

    [StreamStat.FRAMES_LOST]: {
        received: number;
        dropped: number;
        toString: () => string;
    };

    [StreamStat.PACKETS_LOST]: {
        received: number;
        dropped: number;
        toString: () => string;
    };

    [StreamStat.DECODE_TIME]: {
        current: number;
        total: number;
        grades: [number, number, number];
        toString: () => string;
    };

    [StreamStat.DOWNLOAD]: {
        total: number;
        toString: () => string;
    };

    [StreamStat.UPLOAD]: {
        total: number;
        toString: () => string;
    };

    [StreamStat.PLAYTIME]: {
        seconds: number;
        startTime: number;
        toString: () => string;
    };

    [StreamStat.BATTERY]: {
        current: number;
        start: number;
        isCharging: boolean;
        toString: () => string;
    },

    [StreamStat.CLOCK]: {
        toString: () => string;
    },
};


export class StreamStatsCollector {
    private static instance: StreamStatsCollector;
    public static getInstance = () => StreamStatsCollector.instance ?? (StreamStatsCollector.instance = new StreamStatsCollector());
    private readonly LOG_TAG = 'StreamStatsCollector';

    // Collect in background - 60 seconds
    static readonly INTERVAL_BACKGROUND = 60 * 1000;

    public calculateGrade(value: number, grades: [number, number, number]): StreamStatGrade {
        return (value > grades[2]) ? 'bad' : (value > grades[1]) ? 'ok' : (value > grades[0]) ? 'good' : '';
    }

    private currentStats: CurrentStats = {
        [StreamStat.PING]: {
            current: -1,
            grades: [40, 75, 100],
            toString() {
                return this.current === -1 ? '???' : this.current.toString().padStart(3);
            },
        },

        [StreamStat.JITTER]: {
            current: 0,
            grades: [30, 40, 60],
            toString() {
                return `${this.current.toFixed(1)}ms`.padStart(6);
            },
        },

        [StreamStat.RESOLUTION]: {
            current: '',
            toString() {
                return this.current;
            },
        },

        [StreamStat.FPS]: {
            current: 0,
            toString() {
                const maxFps = getStreamPref(StreamPref.VIDEO_MAX_FPS);
                return maxFps < 60 ? `${maxFps}/${this.current}`.padStart(5) : this.current.toString();
            },
        },

        [StreamStat.BITRATE]: {
            current: 0,
            toString() {
                return `${this.current.toFixed(1)} Mbps`.padStart(9);
            },
        },

        [StreamStat.FRAMES_LOST]: {
            received: 0,
            dropped: 0,
            toString() {
                const percentage = (this.dropped * 100 / ((this.dropped + this.received) || 1)).toFixed(1);
                return percentage.startsWith('0.') ? this.dropped.toString() : `${this.dropped} (${percentage}%)`;
            },
        },

        [StreamStat.PACKETS_LOST]: {
            received: 0,
            dropped: 0,
            toString() {
                const percentage = (this.dropped * 100 / ((this.dropped + this.received) || 1)).toFixed(1);
                return percentage.startsWith('0.') ? this.dropped.toString() : `${this.dropped} (${percentage}%)`;
            },
        },

        [StreamStat.DECODE_TIME]: {
            current: 0,
            total: 0,
            grades: [6, 9, 12],
            toString() {
                return isNaN(this.current) ? '??ms' : `${this.current.toFixed(1)}ms`.padStart(6);
            },
        },

        [StreamStat.DOWNLOAD]: {
            total: 0,
            toString() {
                return humanFileSize(this.total).padStart(8);
            },
        },

        [StreamStat.UPLOAD]: {
            total: 0,
            toString() {
                return humanFileSize(this.total);
            },
        },

        [StreamStat.PLAYTIME]: {
            seconds: 0,
            startTime: 0,
            toString() {
                return secondsToHm(this.seconds);
            },
        },

        [StreamStat.BATTERY]: {
            current: 100,
            start: 100,
            isCharging: false,
            toString() {
                let text = `${this.current}%`;

                if (this.current !== this.start) {
                    const diffLevel = Math.round(this.current - this.start);
                    const sign = diffLevel > 0 ? '+' : '';
                    text += ` (${sign}${diffLevel}%)`;
                }

                return text;
            },
        },

        [StreamStat.CLOCK]: {
            toString() {
                return new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute:'2-digit',
                    hour12: false,
                });
            }
        },
    };

    private lastVideoStat?: RTCInboundRtpStreamStats | null;
    private selectedCandidatePairId: string | null | undefined = null;

    private constructor() {
        BxLogger.info(this.LOG_TAG, 'constructor()');
    }

    async collect() {
        const stats = await STATES.currentStream.peerConnection?.getStats();
        if (!stats) {
            return;
        }

        // Find selected candidate
        if (!this.selectedCandidatePairId) {
            let found = false;
            stats.forEach(stat => {
                if (found || stat.type !== 'transport') {
                    return;
                }

                stat = (stat as unknown as RTCTransportStats);
                if (stat.iceState === 'connected' && stat.selectedCandidatePairId) {
                    this.selectedCandidatePairId = (stat as unknown as RTCTransportStats).selectedCandidatePairId;
                    found = true;
                }
            });
        }

        stats.forEach(stat => {
            if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
                // Resolution
                const resolution = this.currentStats[StreamStat.RESOLUTION];
                resolution.current = stat.frameWidth + 'x' + stat.frameHeight;

                // FPS
                const fps = this.currentStats[StreamStat.FPS];
                fps.current = stat.framesPerSecond || 0;

                // Packets Lost
                // packetsLost can be negative, but we don't care about that
                const pl = this.currentStats[StreamStat.PACKETS_LOST];
                pl.dropped = Math.max(0, stat.packetsLost);
                pl.received = stat.packetsReceived;

                // Frames lost
                const fl = this.currentStats[StreamStat.FRAMES_LOST];
                fl.dropped = stat.framesDropped;
                fl.received = stat.framesReceived;

                if (!this.lastVideoStat) {
                    this.lastVideoStat = stat;
                    return;
                }

                const lastStat = this.lastVideoStat;

                // Jitter
                const jit = this.currentStats[StreamStat.JITTER];
                const bufferDelayDiff = (stat as RTCInboundRtpStreamStats).jitterBufferDelay! - lastStat.jitterBufferDelay!;
                const emittedCountDiff = (stat as RTCInboundRtpStreamStats).jitterBufferEmittedCount! - lastStat.jitterBufferEmittedCount!;
                if (emittedCountDiff > 0) {
                    jit.current = bufferDelayDiff / emittedCountDiff * 1000;
                }

                // Bitrate
                const btr = this.currentStats[StreamStat.BITRATE];
                const timeDiff = stat.timestamp - lastStat.timestamp;
                btr.current = 8 * (stat.bytesReceived - lastStat.bytesReceived!) / timeDiff / 1000;

                // Decode time
                const dt = this.currentStats[StreamStat.DECODE_TIME];
                dt.total = stat.totalDecodeTime - lastStat.totalDecodeTime!;
                const framesDecodedDiff = stat.framesDecoded - lastStat.framesDecoded!;
                dt.current = dt.total / framesDecodedDiff * 1000;

                this.lastVideoStat = stat;
            } else if (this.selectedCandidatePairId && stat.type === 'candidate-pair' && stat.id === this.selectedCandidatePairId) {
                // Round Trip Time
                const ping = this.currentStats[StreamStat.PING];
                ping.current = stat.currentRoundTripTime ? stat.currentRoundTripTime * 1000 : -1;

                // Download
                const dl = this.currentStats[StreamStat.DOWNLOAD];
                dl.total = stat.bytesReceived;

                // Upload
                const ul = this.currentStats[StreamStat.UPLOAD];
                ul.total = stat.bytesSent;
            }
        });

        // Battery
        let batteryLevel = 100;
        let isCharging = false;
        if (STATES.browser.capabilities.batteryApi) {
            try {
                const bm = await (navigator as NavigatorBattery).getBattery();
                isCharging = bm.charging;
                batteryLevel = Math.round(bm.level * 100);
            } catch(e) {}
        }

        const battery = this.currentStats[StreamStat.BATTERY];
        battery.current = batteryLevel;
        battery.isCharging = isCharging;

        // Playtime
        const playTime = this.currentStats[StreamStat.PLAYTIME];
        const now = +new Date;
        playTime.seconds = Math.ceil((now - playTime.startTime) / 1000);
    }

    getStat<T extends StreamStat>(kind: T): CurrentStats[T] {
        return this.currentStats[kind];
    }

    reset() {
        const playTime = this.currentStats[StreamStat.PLAYTIME];
        playTime.seconds = 0;
        playTime.startTime = +new Date;

        // Get battery level
        try {
            STATES.browser.capabilities.batteryApi && (navigator as NavigatorBattery).getBattery().then(bm => {
                this.currentStats[StreamStat.BATTERY].start = Math.round(bm.level * 100);
            });
        } catch(e) {}
    }

    static setupEvents() {
        BxEventBus.Stream.on('state.playing', () => {
            StreamStatsCollector.getInstance().reset();
        });
    }
}
