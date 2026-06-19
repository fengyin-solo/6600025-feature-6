<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useCanBusStore } from './store/canbus';
import FrameTable from './components/FrameTable.vue';
import SignalChart from './components/SignalChart.vue';

const store = useCanBusStore();

function formatDateForInput(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseDateFromInput(str: string): number {
  if (!str) return 0;
  return new Date(str).getTime();
}

const startInputValue = computed({
  get: () => formatDateForInput(store.playbackStartTime),
  set: (v: string) => { store.playbackStartTime = parseDateFromInput(v); }
});

const endInputValue = computed({
  get: () => formatDateForInput(store.playbackEndTime),
  set: (v: string) => { store.playbackEndTime = parseDateFromInput(v); }
});

function handleLoadDbc() {
  store.loadMockDbc();
  alert(`已加载 DBC 定义: ${store.dbcMessages.size} 条消息`);
}

function handleExport() {
  const csv = store.exportFrames();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `can_frames_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function setQuickRange(minutes: number) {
  const end = store.historyEndTime || Date.now();
  const start = end - minutes * 60 * 1000;
  store.playbackStartTime = start;
  store.playbackEndTime = end;
  store.loadPlaybackData();
}

onMounted(() => {
  store.fetchHistoryRange();
});
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
    <!-- Header -->
    <header class="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-cyan-600 rounded-lg flex items-center justify-center">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
        </div>
        <h1 class="text-lg font-bold text-gray-100">CAN 总线数据帧解析与诊断仪</h1>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex bg-gray-700 rounded overflow-hidden border border-gray-600 mr-2">
          <button
            @click="store.exitPlaybackMode()"
            class="px-3 py-1.5 text-sm transition-colors font-medium"
            :class="!store.isPlayback ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-600'"
          >
            实时模式
          </button>
          <button
            @click="store.enterPlaybackMode()"
            class="px-3 py-1.5 text-sm transition-colors font-medium"
            :class="store.isPlayback ? 'bg-cyan-600 text-white' : 'text-gray-300 hover:bg-gray-600'"
          >
            历史回看
          </button>
        </div>
        <button
          @click="handleLoadDbc"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          加载DBC
        </button>
        <template v-if="!store.isPlayback">
          <button
            @click="store.isCapturing ? store.stopCapture() : store.startCapture()"
            class="px-3 py-1.5 text-sm rounded transition-colors font-medium"
            :class="store.isCapturing
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'"
          >
            {{ store.isCapturing ? '停止捕获' : '开始捕获' }}
          </button>
        </template>
        <button
          @click="store.clearFrames()"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          清除
        </button>
        <button
          @click="handleExport"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors border border-gray-600"
        >
          导出CSV
        </button>
      </div>
    </header>

    <!-- Playback Toolbar -->
    <div
      v-if="store.isPlayback"
      class="flex items-center gap-3 px-6 py-2 bg-gray-800/80 border-b border-gray-700 shrink-0 flex-wrap"
    >
      <span class="text-sm text-gray-400 shrink-0">时间范围:</span>
      <div class="flex items-center gap-2">
        <input
          v-model="startInputValue"
          type="datetime-local"
          step="1"
          class="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-cyan-500"
        />
        <span class="text-gray-500">—</span>
        <input
          v-model="endInputValue"
          type="datetime-local"
          step="1"
          class="px-2 py-1 bg-gray-900 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-cyan-500"
        />
      </div>
      <div class="flex items-center gap-1">
        <button
          @click="setQuickRange(1)"
          class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded border border-gray-600"
        >
          1分钟
        </button>
        <button
          @click="setQuickRange(5)"
          class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded border border-gray-600"
        >
          5分钟
        </button>
        <button
          @click="setQuickRange(15)"
          class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded border border-gray-600"
        >
          15分钟
        </button>
        <button
          @click="() => { store.playbackStartTime = store.historyStartTime; store.playbackEndTime = store.historyEndTime; store.loadPlaybackData(); }"
          class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded border border-gray-600"
        >
          全部
        </button>
      </div>
      <button
        @click="store.loadPlaybackData()"
        :disabled="store.isLoadingPlayback"
        class="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors"
      >
        <span v-if="store.isLoadingPlayback">加载中...</span>
        <span v-else>查询回看</span>
      </button>
      <button
        @click="store.refreshPlaybackData()"
        class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded border border-gray-600"
      >
        刷新范围
      </button>
      <div class="text-xs text-gray-500 ml-auto">
        已加载 <span class="text-cyan-400 font-mono">{{ store.playbackFrames.length }}</span> 帧 ·
        历史范围: <span class="text-gray-400 font-mono">{{ formatDateForInput(store.historyStartTime) }}</span> ~
        <span class="text-gray-400 font-mono">{{ formatDateForInput(store.historyEndTime) }}</span>
      </div>
    </div>

    <!-- Main Area -->
    <main class="flex-1 flex overflow-hidden">
      <!-- Left Panel: Frame Table (60%) -->
      <div class="w-3/5 border-r border-gray-700 flex flex-col overflow-hidden">
        <FrameTable />
      </div>

      <!-- Right Panel: Signal Chart (40%) -->
      <div class="w-2/5 flex flex-col overflow-hidden">
        <SignalChart />
      </div>
    </main>

    <!-- Status Bar -->
    <footer class="flex items-center justify-between px-6 py-1.5 bg-gray-800 border-t border-gray-700 text-xs shrink-0">
      <div class="flex items-center gap-4 text-gray-500">
        <span>
          <span
            :class="store.isPlayback ? 'text-cyan-400' : (store.isCapturing ? 'text-green-400' : 'text-gray-500')"
          >
            ● {{ store.isPlayback ? '历史回看' : (store.isCapturing ? '捕获中' : '已停止') }}
          </span>
        </span>
        <span>DBC消息: {{ store.dbcMessages.size }}</span>
        <span v-if="store.isPlayback">
          回看帧数: <span class="text-cyan-400">{{ store.playbackFrames.length }}</span>
        </span>
      </div>
      <div class="flex items-center gap-4 text-gray-500">
        <span>帧数: {{ store.isPlayback ? store.playbackFrames.length : store.busStats.totalFrames }}</span>
        <span>RX: {{ store.busStats.rxCount }}</span>
        <span>TX: {{ store.busStats.txCount }}</span>
        <span>负载: {{ store.busLoadPercent }}%</span>
      </div>
    </footer>
  </div>
</template>
