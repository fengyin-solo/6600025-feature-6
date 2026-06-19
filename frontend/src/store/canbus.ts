import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { CanFrame, DbcMessage, BusStats } from '../types';
import { parseDbc, decodeCanFrame, DEFAULT_DBC_CONTENT } from '../utils/dbc-parser';

let frameIdCounter = 0;

const API_BASE = 'http://localhost:8080/api';

export const useCanBusStore = defineStore('canbus', () => {
  const frames = ref<CanFrame[]>([]);
  const signals = ref<Map<string, { name: string; data: { time: number; value: number }[] }>>(new Map());
  const dbcMessages = ref<Map<number, DbcMessage>>(new Map());
  const filterId = ref('');
  const filterText = ref('');
  const isCapturing = ref(false);
  const pollInterval = ref<number | null>(null);

  const isPlayback = ref(false);
  const playbackFrames = ref<CanFrame[]>([]);
  const playbackSignals = ref<Map<string, { name: string; data: { time: number; value: number }[] }>>(new Map());
  const playbackStartTime = ref<number>(0);
  const playbackEndTime = ref<number>(0);
  const historyStartTime = ref<number>(0);
  const historyEndTime = ref<number>(0);
  const isLoadingPlayback = ref(false);

  const busStats = ref<BusStats>({
    totalFrames: 0,
    rxCount: 0,
    txCount: 0,
    errorCount: 0,
    busLoad: 0,
    lastUpdate: Date.now()
  });

  const currentFrames = computed(() => {
    return isPlayback.value ? playbackFrames.value : frames.value;
  });

  const currentSignals = computed(() => {
    return isPlayback.value ? playbackSignals.value : signals.value;
  });

  const filteredFrames = computed(() => {
    let result = currentFrames.value;

    if (filterId.value.trim()) {
      const idFilter = filterId.value.trim().toLowerCase().replace(/^0x/, '');
      result = result.filter(f =>
        f.arbitrationId.toString(16).toLowerCase().includes(idFilter)
      );
    }

    if (filterText.value.trim()) {
      const textFilter = filterText.value.trim().toLowerCase();
      result = result.filter(f => {
        if (f.arbitrationId.toString(16).toLowerCase().includes(textFilter)) return true;
        if (f.data.toLowerCase().includes(textFilter)) return true;
        for (const key of Object.keys(f.decoded)) {
          if (key.toLowerCase().includes(textFilter)) return true;
        }
        return false;
      });
    }

    return result;
  });

  const busLoadPercent = computed(() => {
    return busStats.value.busLoad.toFixed(1);
  });

  function buildSignalsFromFrames(framesList: CanFrame[]): Map<string, { name: string; data: { time: number; value: number }[] }> {
    const result = new Map<string, { name: string; data: { time: number; value: number }[] }>();
    for (const frame of framesList) {
      const msgDef = dbcMessages.value.get(frame.arbitrationId);
      const decoded = msgDef ? decodeCanFrame(frame, msgDef) : frame.decoded;
      for (const [name, value] of Object.entries(decoded)) {
        if (!result.has(name)) {
          result.set(name, { name, data: [] });
        }
        result.get(name)!.data.push({ time: frame.timestamp, value });
      }
    }
    return result;
  }

  function addFrame(frame: CanFrame) {
    frames.value.push(frame);
    if (frames.value.length > 500) {
      frames.value = frames.value.slice(-500);
    }

    busStats.value.totalFrames++;
    if (frame.direction === 'RX') busStats.value.rxCount++;
    else busStats.value.txCount++;
    busStats.value.lastUpdate = Date.now();

    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (msgDef) {
      const decoded = decodeCanFrame(frame, msgDef);
      frame.decoded = decoded;
      for (const [name, value] of Object.entries(decoded)) {
        if (!signals.value.has(name)) {
          signals.value.set(name, { name, data: [] });
        }
        const sig = signals.value.get(name)!;
        sig.data.push({ time: frame.timestamp, value });
        if (sig.data.length > 100) {
          sig.data = sig.data.slice(-100);
        }
      }
    }

    busStats.value.busLoad = 15 + Math.random() * 30;
  }

  function clearFrames() {
    frames.value = [];
    signals.value = new Map();
    playbackFrames.value = [];
    playbackSignals.value = new Map();
    busStats.value = {
      totalFrames: 0,
      rxCount: 0,
      txCount: 0,
      errorCount: 0,
      busLoad: 0,
      lastUpdate: Date.now()
    };
    frameIdCounter = 0;
  }

  function loadMockDbc() {
    parseAndLoadDbc(DEFAULT_DBC_CONTENT);
  }

  function parseAndLoadDbc(text: string) {
    dbcMessages.value = parseDbc(text);
  }

  function generateMockFrame(): CanFrame {
    const messageIds = Array.from(dbcMessages.value.keys());
    const arbId = messageIds.length > 0
      ? messageIds[Math.floor(Math.random() * messageIds.length)]
      : 0x7DF;

    const msgDef = dbcMessages.value.get(arbId);

    const rpm = Math.floor(800 + Math.random() * 5200);
    const speed = Math.floor(Math.random() * 120);
    const temp = Math.floor(70 + Math.random() * 35);
    const throttle = Math.floor(Math.random() * 100);
    const load = Math.floor(Math.random() * 100);

    const rpmRaw = Math.round(rpm / 0.25);
    const rpmLow = rpmRaw & 0xFF;
    const rpmHigh = (rpmRaw >> 8) & 0xFF;
    const speedByte = speed & 0xFF;
    const tempByte = (temp + 40) & 0xFF;
    const throttleByte = Math.round(throttle / 0.392) & 0xFF;
    const loadByte = Math.round(load / 0.392) & 0xFF;

    const dataBytes = [rpmLow, rpmHigh, speedByte, tempByte, throttleByte, loadByte, 0x00, 0x00];
    const dataHex = dataBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    const frame: CanFrame = {
      id: `frame-${++frameIdCounter}`,
      timestamp: Date.now(),
      arbitrationId: arbId,
      dlc: 8,
      data: dataHex,
      decoded: {},
      direction: Math.random() > 0.3 ? 'RX' : 'TX'
    };

    if (msgDef) {
      frame.decoded = {
        EngineRPM: rpm,
        VehicleSpeed: speed,
        CoolantTemp: temp,
        ThrottlePosition: throttle,
        EngineLoad: load
      };
    }

    return frame;
  }

  function startCapture() {
    if (isCapturing.value) return;
    if (dbcMessages.value.size === 0) {
      loadMockDbc();
    }
    isCapturing.value = true;

    pollInterval.value = window.setInterval(() => {
      const frame = generateMockFrame();
      addFrame(frame);
    }, 200);
  }

  function stopCapture() {
    isCapturing.value = false;
    if (pollInterval.value !== null) {
      clearInterval(pollInterval.value);
      pollInterval.value = null;
    }
  }

  function decodeFrame(frame: CanFrame): Record<string, number> {
    const msgDef = dbcMessages.value.get(frame.arbitrationId);
    if (!msgDef) return {};
    return decodeCanFrame(frame, msgDef);
  }

  function exportFrames(): string {
    const exportFrames = currentFrames.value;
    const header = 'Timestamp,Direction,CAN_ID,DLC,Data,Decoded\n';
    const rows = exportFrames.map(f => {
      const decodedStr = Object.entries(f.decoded)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      return `${f.timestamp},${f.direction},0x${f.arbitrationId.toString(16).toUpperCase()},${f.dlc},"${f.data}","${decodedStr}"`;
    }).join('\n');
    return header + rows;
  }

  async function fetchHistoryRange() {
    try {
      const res = await fetch(`${API_BASE}/frames/range`);
      const data = await res.json();
      historyStartTime.value = data.startTime || 0;
      historyEndTime.value = data.endTime || 0;
      if (!playbackStartTime.value && historyStartTime.value) {
        playbackStartTime.value = historyStartTime.value;
      }
      if (!playbackEndTime.value && historyEndTime.value) {
        playbackEndTime.value = historyEndTime.value;
      }
      return data;
    } catch (e) {
      console.warn('fetchHistoryRange failed, using local data', e);
      if (frames.value.length > 0) {
        historyStartTime.value = frames.value[0].timestamp;
        historyEndTime.value = frames.value[frames.value.length - 1].timestamp;
        playbackStartTime.value = historyStartTime.value;
        playbackEndTime.value = historyEndTime.value;
      }
    }
  }

  async function loadPlaybackData() {
    if (!playbackStartTime.value || !playbackEndTime.value) return;
    isLoadingPlayback.value = true;
    try {
      const res = await fetch(
        `${API_BASE}/frames/history?startTime=${playbackStartTime.value}&endTime=${playbackEndTime.value}`
      );
      const data: CanFrame[] = await res.json();
      if (data.length > 0) {
        playbackFrames.value = data;
        playbackSignals.value = buildSignalsFromFrames(data);
      } else {
        playbackFrames.value = frames.value.filter(
          f => f.timestamp >= playbackStartTime.value && f.timestamp <= playbackEndTime.value
        );
        playbackSignals.value = buildSignalsFromFrames(playbackFrames.value);
      }
    } catch (e) {
      console.warn('loadPlaybackData from API failed, using local filter', e);
      playbackFrames.value = frames.value.filter(
        f => f.timestamp >= playbackStartTime.value && f.timestamp <= playbackEndTime.value
      );
      playbackSignals.value = buildSignalsFromFrames(playbackFrames.value);
    } finally {
      isLoadingPlayback.value = false;
    }
  }

  function enterPlaybackMode() {
    if (dbcMessages.value.size === 0) {
      loadMockDbc();
    }
    isPlayback.value = true;
    if (playbackFrames.value.length === 0) {
      loadPlaybackData();
    }
  }

  function exitPlaybackMode() {
    isPlayback.value = false;
  }

  function togglePlaybackMode() {
    if (isPlayback.value) {
      exitPlaybackMode();
    } else {
      enterPlaybackMode();
    }
  }

  async function refreshPlaybackData() {
    await fetchHistoryRange();
    await loadPlaybackData();
  }

  return {
    frames,
    signals,
    dbcMessages,
    filterId,
    filterText,
    busStats,
    isCapturing,
    currentFrames,
    currentSignals,
    filteredFrames,
    busLoadPercent,
    isPlayback,
    playbackFrames,
    playbackSignals,
    playbackStartTime,
    playbackEndTime,
    historyStartTime,
    historyEndTime,
    isLoadingPlayback,
    addFrame,
    clearFrames,
    loadMockDbc,
    parseAndLoadDbc,
    startCapture,
    stopCapture,
    decodeFrame,
    exportFrames,
    fetchHistoryRange,
    loadPlaybackData,
    enterPlaybackMode,
    exitPlaybackMode,
    togglePlaybackMode,
    refreshPlaybackData
  };
});
