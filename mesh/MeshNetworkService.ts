import {
  BleManager,
  Device,
  State,
  BleError,
} from 'react-native-ble-plx';
import * as FileSystem from 'expo-file-system';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  MeshPacket,
  MeshRoute,
  NearbyDevice,
  Message,
  FileTransfer,
} from '@/types';
import { useMeshStore } from '@/store/meshStore';
import { useChatStore } from '@/store/chatStore';
import { EncryptionService } from '@/services/EncryptionService';
import { DatabaseService } from '@/database/DatabaseService';

// ─── BLE Advertiser ───────────────────────────────────────────────────────────
let BLEAdvertiser: any = null;
try {
  BLEAdvertiser = require('react-native-ble-advertiser').default;
} catch {
  console.warn('[Mesh] react-native-ble-advertiser not found. Advertising disabled.');
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BCHAT_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const BCHAT_CHAR_TX_UUID = '12345678-1234-5678-1234-56789abcdef1';
const BCHAT_CHAR_RX_UUID = '12345678-1234-5678-1234-56789abcdef2';

const MAX_HOPS = 8;
const HEARTBEAT_INTERVAL_MS = 20_000;
const ROUTE_TTL_MS = 300_000;
const PACKET_TTL_MS = 60_000;
const DEDUP_TTL_MS = 120_000;
const SCAN_PAUSE_MS = 5_000;
const MAX_PENDING_PER_DEVICE = 100;
const RELAY_CHUNK_SIZE_BYTES = 300;
const CHUNK_DELAY_MS = 120;
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const DB_DEDUP_TYPES = new Set(['message', 'file_chunk', 'relay_share', 'discovery']);
const ROUTE_SAVE_RELIABILITY_DELTA = 0.05;
const MAX_BLE_WRITE_BYTES = 400;

// ─── Congestion / scan tuning constants ──────────────────────────────────────
// Per-device write queue capacity before backpressure kicks in
const DEVICE_QUEUE_CAPACITY = 24;
// Window size for AIMD-style congestion control
const CONGESTION_WINDOW_MIN = 1;
const CONGESTION_WINDOW_MAX = 8;
// LRU capacities
const DEDUP_LRU_CAPACITY = 1_000;
const ROUTE_LRU_CAPACITY = 200;
// Fragment reassembly hard timeout (ms)
const FRAG_REASSEMBLY_TIMEOUT_MS = 30_000;
// Scan interval bounds (ms) — shrinks when density is high, grows when sparse
const SCAN_DURATION_MIN_MS = 8_000;
const SCAN_DURATION_MAX_MS = 25_000;
// BLE write retry
const WRITE_MAX_RETRIES = 4;
const WRITE_RETRY_BASE_MS = 150;
// Advertising watchdog: if no scan event arrives in this window, restart advertising
const ADVERTISING_WATCHDOG_MS = 60_000;
// Route score weights
const RSSI_SCORE_WEIGHT = 0.4;
const SUCCESS_RATE_WEIGHT = 0.6;

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeduplicationEntry { timestamp: number }
interface PendingEntry { packet: MeshPacket; enqueuedAt: number }
interface RouteSnapshot { reliability: number; lastSaved: number }

// LRU node for doubly-linked list
interface LRUNode<K, V> {
  key: K; value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

// Per-device write queue entry
interface WriteQueueEntry {
  fragment: string;
  isReliable: boolean;
  resolve: (ok: boolean) => void;
  reject: (e: unknown) => void;
  retries: number;
}

// Per-device route score (RSSI + success rate)
interface RouteScore {
  rssiSum: number;
  rssiSamples: number;
  successCount: number;
  totalAttempts: number;
}

// ─── LRU Cache ────────────────────────────────────────────────────────────────
class LRUCache<K, V> {
  private capacity: number;
  private map = new Map<K, LRUNode<K, V>>();
  private head: LRUNode<K, V> | null = null; // MRU end
  private tail: LRUNode<K, V> | null = null; // LRU end

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  has(key: K): boolean { return this.map.has(key); }

  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;
    this.moveToFront(node);
    return node.value;
  }

  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToFront(existing);
      return;
    }
    const node: LRUNode<K, V> = { key, value, prev: null, next: this.head };
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
    this.map.set(key, node);

    if (this.map.size > this.capacity) this.evictLRU();
  }

  delete(key: K): void {
    const node = this.map.get(key);
    if (!node) return;
    this.removeNode(node);
    this.map.delete(key);
  }

  keys(): IterableIterator<K> { return this.map.keys(); }
  values(): IterableIterator<V> {
    const vals: V[] = [];
    let cur = this.head;
    while (cur) { vals.push(cur.value); cur = cur.next; }
    return vals[Symbol.iterator]() as IterableIterator<V>;
  }
  entries(): IterableIterator<[K, V]> {
    const pairs: [K, V][] = [];
    let cur = this.head;
    while (cur) { pairs.push([cur.key, cur.value]); cur = cur.next; }
    return pairs[Symbol.iterator]() as IterableIterator<[K, V]>;
  }
  get size(): number { return this.map.size; }
  clear(): void { this.map.clear(); this.head = null; this.tail = null; }

  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) return;
    this.removeNode(node);
    node.next = this.head;
    node.prev = null;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private evictLRU(): void {
    if (!this.tail) return;
    this.map.delete(this.tail.key);
    this.removeNode(this.tail);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generatePacketId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function rssiToDistance(rssi: number): number {
  const txPower = -59;
  if (rssi === 0) return 99;
  const ratio = rssi / txPower;
  if (ratio < 1) return Math.pow(ratio, 10);
  return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
}

function splitIntoChunks(data: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }
  return chunks;
}

function getFileType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const types: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', gif: 'image/gif', mp4: 'video/mp4',
    mp3: 'audio/mpeg', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip', apk: 'application/vnd.android.package-archive',
  };
  return types[ext] ?? 'application/octet-stream';
}

/**
 * Simple CRC-32 checksum for fragment corruption detection.
 * Runs synchronously so it doesn't need EncryptionService for frags.
 */
function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Fragment a large JSON payload into BLE-safe chunks.
 * Each fragment envelope now includes a CRC-32 for corruption detection.
 * Single-chunk packets are returned as-is without fragmentation overhead.
 */
function fragmentPacket(packet: MeshPacket): string[] {
  const json = JSON.stringify(packet);
  const encoded = Buffer.from(json, 'utf8').toString('base64');
  if (encoded.length <= MAX_BLE_WRITE_BYTES) return [encoded];
  const payloadChunks = splitIntoChunks(encoded, MAX_BLE_WRITE_BYTES - 80);
  return payloadChunks.map((chunk, i) => {
    const checksum = crc32(chunk);
    return Buffer.from(
      JSON.stringify({ __frag: true, id: packet.id, i, total: payloadChunks.length, d: chunk, crc: checksum }),
      'utf8'
    ).toString('base64');
  });
}

async function requestAndroidBLEPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const apiLevel = Platform.Version as number;
  if (apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
    );
  } else {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return result === 'granted';
  }
}

// ─── MeshNetworkService ───────────────────────────────────────────────────────
export class MeshNetworkService {
  private bleManager: BleManager;
  private connectedDevices = new Map<string, Device>();
  private characteristicSubs = new Map<string, { remove(): void }>();

  // LRU-backed caches
  private routeCache = new LRUCache<string, MeshRoute>(ROUTE_LRU_CAPACITY);
  private deduplicationCache = new LRUCache<string, DeduplicationEntry>(DEDUP_LRU_CAPACITY);

  private routeSaveSnapshot = new Map<string, RouteSnapshot>();
  private pendingPackets = new Map<string, PendingEntry[]>();

  // Fragment reassembly: packetId → Map<fragIndex, data>
  private fragBuffers = new Map<string, Map<number, string>>();
  private fragMeta = new Map<string, { total: number }>();
  private fragTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Chunk reassembly: transferId → Map<chunkIndex, data>
  private chunkBuffers = new Map<string, Map<number, string>>();
  private chunkMeta = new Map<string, { fileName: string; totalChunks: number; fileSize: number }>();

  private connectingDevices = new Set<string>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private btStateSubscription: { remove(): void } | null = null;
  private currentDeviceId = '';
  private isDestroyed = false;
  private isScanning = false;
  private isAdvertising = false;
  private scanLock = false;

  // ── Congestion control: per-device write queues + windows ─────────────────
  // Each device gets an ordered queue of write entries
  private deviceWriteQueues = new Map<string, WriteQueueEntry[]>();
  // Per-device AIMD congestion window (slots)
  private deviceCongestionWindows = new Map<string, number>();
  // How many writes are currently in-flight per device
  private deviceWriteInFlight = new Map<string, number>();
  // Whether the drain loop is running for a device
  private deviceDraining = new Set<string>();

  // ── Route scoring: RSSI + success rate per next-hop device ────────────────
  private routeScores = new Map<string, RouteScore>();

  // ── Adaptive scan: last density observation ────────────────────────────────
  private lastScanDeviceCount = 0;
  private currentScanDurationMs = SCAN_DURATION_MAX_MS;

  // ── Advertising watchdog ───────────────────────────────────────────────────
  private advertisingWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private lastScanEventAt = 0;

  constructor() {
    this.bleManager = new BleManager();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(deviceId: string): Promise<void> {
    if (this.isDestroyed) throw new Error('MeshNetworkService has been destroyed.');
    this.currentDeviceId = deviceId;

    const granted = await requestAndroidBLEPermissions();
    if (!granted) {
      console.warn('[Mesh] BLE permissions not granted — mesh disabled.');
      useMeshStore.getState().setMeshStatus('error');
      return;
    }

    await useMeshStore.getState().hydrateRoutes(deviceId);
    const storedRoutes = useMeshStore.getState().meshRoutes;
    for (const route of storedRoutes) {
      if (route.isActive && Date.now() - route.lastUsed < ROUTE_TTL_MS) {
        this.routeCache.set(route.toDevice, route);
      }
    }

    this.waitForBluetooth();
    this.startHeartbeat();
    this.startPeriodicCleanup();
    useMeshStore.getState().setMeshActive(true);
    useMeshStore.getState().setMeshStatus('scanning');
  }

  private waitForBluetooth(): void {
    if (this.isDestroyed) return;
    this.btStateSubscription?.remove();
    this.btStateSubscription = this.bleManager.onStateChange((state) => {
      if (this.isDestroyed) return;
      if (state === State.PoweredOn) {
        this.startScanning();
        this.startAdvertising();
      } else if (state === State.PoweredOff) {
        this.stopScanning();
        this.stopAdvertising();
        for (const [id] of this.connectedDevices) {
          this.characteristicSubs.get(id)?.remove();
          this.characteristicSubs.delete(id);
          useMeshStore.getState().removeDevice(id);
        }
        this.connectedDevices.clear();
        this.connectingDevices.clear();
        useMeshStore.getState().setMeshStatus('error');
      } else if (state === State.Unauthorized) {
        console.warn('[Mesh] BLE unauthorized.');
        useMeshStore.getState().setMeshStatus('error');
      }
    }, true);
  }

  destroy(): void {
    this.isDestroyed = true;
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.cleanupTimer) { clearInterval(this.cleanupTimer); this.cleanupTimer = null; }
    if (this.scanTimer) { clearTimeout(this.scanTimer); this.scanTimer = null; }
    if (this.advertisingWatchdogTimer) { clearTimeout(this.advertisingWatchdogTimer); this.advertisingWatchdogTimer = null; }
    for (const [, timer] of this.reconnectTimers) clearTimeout(timer);
    this.reconnectTimers.clear();
    for (const [, timer] of this.fragTimers) clearTimeout(timer);
    this.fragTimers.clear();
    this.btStateSubscription?.remove();
    this.btStateSubscription = null;
    this.stopScanning();
    this.stopAdvertising();
    for (const [, sub] of this.characteristicSubs) sub.remove();
    this.characteristicSubs.clear();
    this.connectedDevices.clear();
    this.connectingDevices.clear();
    this.routeCache.clear();
    this.routeSaveSnapshot.clear();
    this.pendingPackets.clear();
    this.deduplicationCache.clear();
    this.chunkBuffers.clear();
    this.chunkMeta.clear();
    this.fragBuffers.clear();
    this.fragMeta.clear();
    this.deviceWriteQueues.clear();
    this.deviceCongestionWindows.clear();
    this.deviceWriteInFlight.clear();
    this.deviceDraining.clear();
    this.routeScores.clear();
    try { this.bleManager.destroy(); } catch { /* already destroyed */ }
    useMeshStore.getState().setMeshActive(false);
    useMeshStore.getState().setMeshStatus('idle');
  }

  // ── BLE Advertising ────────────────────────────────────────────────────────

  private startAdvertising(): void {
    if (!BLEAdvertiser || this.isAdvertising || this.isDestroyed) return;
    try {
      BLEAdvertiser.setCompanyId(0xffff);
      BLEAdvertiser.broadcast(
        BCHAT_SERVICE_UUID,
        [0x42, 0x43, 0x48, 0x41, 0x54,
          ...Array.from(this.currentDeviceId.slice(0, 4)).map((c) => c.charCodeAt(0))],
        {
          advertiseMode: BLEAdvertiser.ADVERTISE_MODE_LOW_LATENCY,
          txPowerLevel: BLEAdvertiser.ADVERTISE_TX_POWER_HIGH,
          connectable: true,
          includeDeviceName: true,
          includeTxPowerLevel: false,
        }
      )
        .then(() => {
          this.isAdvertising = true;
          this.resetAdvertisingWatchdog();
        })
        .catch((e: any) => {
          console.warn('[Mesh] Advertising failed:', e?.message ?? e);
          this.isAdvertising = false;
          setTimeout(() => { if (!this.isDestroyed) this.startAdvertising(); }, 15_000);
        });
    } catch (e: any) {
      console.warn('[Mesh] startAdvertising error:', e?.message ?? e);
    }
  }

  private stopAdvertising(): void {
    if (!BLEAdvertiser || !this.isAdvertising) return;
    try {
      BLEAdvertiser.stopBroadcast()
        .then(() => { this.isAdvertising = false; })
        .catch((e: any) => console.warn('[Mesh] stopBroadcast error:', e?.message ?? e));
    } catch (e: any) {
      console.warn('[Mesh] stopAdvertising error:', e?.message ?? e);
    }
  }

  // ── Advertising watchdog ───────────────────────────────────────────────────
  /**
   * Resets the advertising watchdog timer. If no scan event arrives within
   * ADVERTISING_WATCHDOG_MS, the watchdog assumes the advertiser has silently
   * stopped and restarts it. This recovers from Android BLE stack glitches
   * where the advertiser stops emitting without firing an error callback.
   */
  private resetAdvertisingWatchdog(): void {
    if (this.advertisingWatchdogTimer) clearTimeout(this.advertisingWatchdogTimer);
    this.advertisingWatchdogTimer = setTimeout(() => {
      if (this.isDestroyed) return;
      const timeSinceLastScan = Date.now() - this.lastScanEventAt;
      if (timeSinceLastScan >= ADVERTISING_WATCHDOG_MS && this.connectedDevices.size === 0) {
        console.warn('[Mesh] Advertising watchdog triggered — restarting advertiser.');
        this.isAdvertising = false;
        this.stopAdvertising();
        setTimeout(() => { if (!this.isDestroyed) this.startAdvertising(); }, 1_000);
      } else {
        // Still getting scan events — reset watchdog for another cycle
        this.resetAdvertisingWatchdog();
      }
    }, ADVERTISING_WATCHDOG_MS);
  }

  // ── Adaptive scanning ──────────────────────────────────────────────────────
  /**
   * Computes scan duration based on device density observed in the previous cycle.
   * High density → shorter scan (less radio time needed, more hops available).
   * Low density  → longer scan (need more time to find sparse peers).
   */
  private computeAdaptiveScanDuration(): number {
    const count = this.lastScanDeviceCount;
    if (count >= 10) return SCAN_DURATION_MIN_MS;
    if (count === 0) return SCAN_DURATION_MAX_MS;
    // Linear interpolation between min and max based on density
    const ratio = Math.min(count / 10, 1);
    return Math.round(
      SCAN_DURATION_MAX_MS - ratio * (SCAN_DURATION_MAX_MS - SCAN_DURATION_MIN_MS)
    );
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  private startScanning(): void {
    if (this.isDestroyed || this.isScanning || this.scanLock) return;
    this.scanLock = true;
    this.isScanning = true;
    useMeshStore.getState().setIsScanning(true);
    useMeshStore.getState().setMeshStatus('scanning');

    let devicesSeenThisCycle = 0;

    this.bleManager.startDeviceScan(
      null,
      { allowDuplicates: false, scanMode: 2 },
      (error, device) => {
        if (this.isDestroyed) return;
        if (error) { this.handleScanError(error); return; }
        if (!device) return;

        // Record scan event time for advertising watchdog
        this.lastScanEventAt = Date.now();

        const hasService = device.serviceUUIDs?.includes(BCHAT_SERVICE_UUID) ?? false;
        const hasName = device.name?.startsWith('BCHAT_') ?? false;
        const hasLocalName = device.localName?.startsWith('BCHAT_') ?? false;

        if (hasService || hasName || hasLocalName) {
          devicesSeenThisCycle++;

          // Update RSSI score for this device
          this.recordRssiSample(device.id, device.rssi ?? -80);

          if (
            !this.connectedDevices.has(device.id) &&
            !this.connectingDevices.has(device.id)
          ) {
            this.connectToDevice(device).catch(() => {});
          }
        }
      }
    );

    this.currentScanDurationMs = this.computeAdaptiveScanDuration();

    this.scanTimer = setTimeout(() => {
      this.lastScanDeviceCount = devicesSeenThisCycle;
      this.stopScanning();
      this.scanLock = false;
      this.scanTimer = setTimeout(() => {
        if (!this.isDestroyed) this.startScanning();
      }, SCAN_PAUSE_MS);
    }, this.currentScanDurationMs);
  }

  private stopScanning(): void {
    this.isScanning = false;
    try { this.bleManager.stopDeviceScan(); } catch { /* safe */ }
    useMeshStore.getState().setIsScanning(false);
  }

  private handleScanError(error: BleError): void {
    console.error('[Mesh] Scan error:', error.errorCode, error.reason);
    this.stopScanning();
    this.scanLock = false;

    if (error.errorCode === 600) {
      this.isScanning = true;
      useMeshStore.getState().setIsScanning(true);
      return;
    }

    useMeshStore.getState().setMeshStatus('error');
    const retryMs = error.errorCode === 601 ? 30_000 : 10_000;
    this.scanTimer = setTimeout(() => {
      if (!this.isDestroyed) this.startScanning();
    }, retryMs);
  }

  // ── Route scoring ──────────────────────────────────────────────────────────

  private recordRssiSample(deviceId: string, rssi: number): void {
    const score = this.routeScores.get(deviceId) ?? {
      rssiSum: 0, rssiSamples: 0, successCount: 0, totalAttempts: 0,
    };
    score.rssiSum += rssi;
    score.rssiSamples++;
    this.routeScores.set(deviceId, score);
  }

  private recordWriteOutcome(deviceId: string, success: boolean): void {
    const score = this.routeScores.get(deviceId) ?? {
      rssiSum: 0, rssiSamples: 0, successCount: 0, totalAttempts: 0,
    };
    score.totalAttempts++;
    if (success) score.successCount++;
    this.routeScores.set(deviceId, score);
  }

  /**
   * Composite route score in [0, 1].
   * Higher is better. Used by routePacket to prefer higher-scoring next-hops.
   * RSSI component: normalize -100..0 dBm → 0..1.
   * Success rate component: successCount / totalAttempts.
   */
  private getRouteScore(deviceId: string): number {
    const score = this.routeScores.get(deviceId);
    if (!score || score.rssiSamples === 0) return 0.5; // neutral default
    const avgRssi = score.rssiSum / score.rssiSamples;
    const rssiNorm = Math.max(0, Math.min(1, (avgRssi + 100) / 100));
    const successRate = score.totalAttempts > 0
      ? score.successCount / score.totalAttempts
      : 0.5;
    return RSSI_SCORE_WEIGHT * rssiNorm + SUCCESS_RATE_WEIGHT * successRate;
  }

  // ── Congestion control ─────────────────────────────────────────────────────

  /**
   * Enqueues a single BLE fragment write for a device and returns a promise
   * that resolves when the write completes (or fails after retries).
   * Applies backpressure: if the queue is full, low-priority entries are
   * dropped first; if still full, the oldest entry is evicted (tail drop).
   */
  private enqueueWrite(
    deviceId: string,
    fragment: string,
    isReliable: boolean,
    packetPriority: MeshPacket['priority']
  ): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const queue = this.deviceWriteQueues.get(deviceId) ?? [];

      // Backpressure: shed load if at capacity
      if (queue.length >= DEVICE_QUEUE_CAPACITY) {
        const lowIdx = queue.findIndex((e) => !e.isReliable);
        if (lowIdx >= 0) {
          queue[lowIdx].resolve(false); // notify dropped entry
          queue.splice(lowIdx, 1);
        } else if (packetPriority === 'low') {
          // New low-priority write dropped immediately — queue is under pressure
          resolve(false);
          return;
        } else {
          // Drop oldest to make room for higher-priority new write
          const dropped = queue.shift();
          dropped?.resolve(false);
        }
      }

      queue.push({ fragment, isReliable, resolve, reject, retries: 0 });
      this.deviceWriteQueues.set(deviceId, queue);

      // Kick off drain if not already running
      if (!this.deviceDraining.has(deviceId)) {
        this.drainDeviceQueue(deviceId).catch(() => {});
      }
    });
  }

  /**
   * Drain loop for a single device's write queue.
   * Respects the per-device congestion window (AIMD):
   *   - On success: window grows by 1 (up to max)
   *   - On failure: window halves (down to min)
   * Retries failed writes with exponential backoff up to WRITE_MAX_RETRIES.
   */
  private async drainDeviceQueue(deviceId: string): Promise<void> {
    if (this.deviceDraining.has(deviceId)) return;
    this.deviceDraining.add(deviceId);

    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      // Device gone — flush queue with failures
      const queue = this.deviceWriteQueues.get(deviceId) ?? [];
      for (const entry of queue) entry.resolve(false);
      this.deviceWriteQueues.delete(deviceId);
      this.deviceDraining.delete(deviceId);
      return;
    }

    while (!this.isDestroyed) {
      const queue = this.deviceWriteQueues.get(deviceId);
      if (!queue || queue.length === 0) break;

      const window = this.deviceCongestionWindows.get(deviceId) ?? CONGESTION_WINDOW_MAX;
      const inFlight = this.deviceWriteInFlight.get(deviceId) ?? 0;
      if (inFlight >= window) {
        // Yield and re-check — in-flight writes will decrement the counter
        await new Promise<void>((r) => setTimeout(r, 10));
        continue;
      }

      const entry = queue.shift()!;
      if (queue.length === 0) this.deviceWriteQueues.delete(deviceId);

      this.deviceWriteInFlight.set(deviceId, inFlight + 1);

      // Execute write with retry + exponential backoff
      this.executeWriteWithRetry(deviceId, device, entry).then((ok) => {
        const cur = this.deviceWriteInFlight.get(deviceId) ?? 1;
        this.deviceWriteInFlight.set(deviceId, Math.max(0, cur - 1));

        // AIMD window adjustment
        if (ok) {
          const w = this.deviceCongestionWindows.get(deviceId) ?? CONGESTION_WINDOW_MAX;
          this.deviceCongestionWindows.set(deviceId, Math.min(CONGESTION_WINDOW_MAX, w + 1));
        } else {
          const w = this.deviceCongestionWindows.get(deviceId) ?? CONGESTION_WINDOW_MAX;
          this.deviceCongestionWindows.set(deviceId, Math.max(CONGESTION_WINDOW_MIN, Math.floor(w / 2)));
        }

        this.recordWriteOutcome(deviceId, ok);
        entry.resolve(ok);
      }).catch((e) => {
        const cur = this.deviceWriteInFlight.get(deviceId) ?? 1;
        this.deviceWriteInFlight.set(deviceId, Math.max(0, cur - 1));
        entry.reject(e);
      });
    }

    this.deviceDraining.delete(deviceId);
  }

  /**
   * Single write attempt with exponential backoff retries.
   */
  private async executeWriteWithRetry(
    deviceId: string,
    device: Device,
    entry: WriteQueueEntry
  ): Promise<boolean> {
    for (let attempt = 0; attempt <= WRITE_MAX_RETRIES; attempt++) {
      try {
        if (entry.isReliable) {
          await device.writeCharacteristicWithResponseForService(
            BCHAT_SERVICE_UUID, BCHAT_CHAR_TX_UUID, entry.fragment
          );
        } else {
          await device.writeCharacteristicWithoutResponseForService(
            BCHAT_SERVICE_UUID, BCHAT_CHAR_TX_UUID, entry.fragment
          );
        }
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const isDisconnect = msg.includes('disconnected') || msg.includes('not connected') || msg.includes('Device');
        if (isDisconnect || attempt === WRITE_MAX_RETRIES) {
          if (isDisconnect) {
            // Surface disconnect so caller can clean up
            this.connectedDevices.delete(deviceId);
            this.characteristicSubs.get(deviceId)?.remove();
            this.characteristicSubs.delete(deviceId);
            useMeshStore.getState().removeDevice(deviceId);
          }
          return false;
        }
        // Exponential backoff before next retry
        const backoffMs = WRITE_RETRY_BASE_MS * Math.pow(2, attempt);
        await new Promise<void>((r) => setTimeout(r, backoffMs));
      }
    }
    return false;
  }

  // ── Connection management ──────────────────────────────────────────────────

  private async connectToDevice(device: Device): Promise<void> {
    if (this.isDestroyed || this.connectingDevices.has(device.id)) return;
    this.connectingDevices.add(device.id);

    try {
      const connectPromise = device.connect({
        autoConnect: false,
        requestMTU: 512,
        refreshGatt: 'OnConnected',
        timeout: CONNECT_TIMEOUT_MS,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS + 1000)
      );

      const connected = await Promise.race([connectPromise, timeoutPromise]);
      const discovered = await connected.discoverAllServicesAndCharacteristics();

      const services = await discovered.services();
      const hasBChatService = services.some(
        (s) => s.uuid.toLowerCase() === BCHAT_SERVICE_UUID.toLowerCase()
      );
      if (!hasBChatService) {
        await connected.cancelConnection().catch(() => {});
        this.connectingDevices.delete(device.id);
        return;
      }

      this.connectedDevices.set(device.id, discovered);
      this.connectingDevices.delete(device.id);

      // Init congestion window at mid-range for new connection
      this.deviceCongestionWindows.set(device.id, Math.floor(CONGESTION_WINDOW_MAX / 2));

      const nearbyDevice: NearbyDevice = {
        id: device.id,
        name: device.name ?? device.localName ?? 'B-Chat Device',
        deviceId: device.id,
        bluetoothId: device.id,
        rssi: device.rssi ?? -80,
        distance: rssiToDistance(device.rssi ?? -80),
        isConnected: true,
        connectionType: 'ble',
        lastSeen: Date.now(),
        capabilities: ['message', 'file', 'relay'],
      };

      await useMeshStore.getState().addOrUpdateDevice(nearbyDevice);
      this.monitorDisconnect(discovered);
      this.subscribeToNotifications(discovered);
      await this.sendDiscovery(device.id);
      await this.deliverPendingPackets(device.id);
      useMeshStore.getState().setMeshStatus('connected');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[Mesh] connectToDevice failed:', msg);
      this.connectedDevices.delete(device.id);
      this.connectingDevices.delete(device.id);
    }
  }

  private monitorDisconnect(device: Device): void {
    device.onDisconnected((error, d) => {
      if (!d) return;
      const id = d.id;
      this.connectedDevices.delete(id);
      this.connectingDevices.delete(id);
      this.characteristicSubs.get(id)?.remove();
      this.characteristicSubs.delete(id);
      useMeshStore.getState().removeDevice(id);
      useMeshStore.getState().invalidateRoutesThrough(id);

      // Flush write queue for disconnected device
      const queue = this.deviceWriteQueues.get(id) ?? [];
      for (const entry of queue) entry.resolve(false);
      this.deviceWriteQueues.delete(id);
      this.deviceCongestionWindows.delete(id);
      this.deviceWriteInFlight.delete(id);

      for (const [key, route] of this.routeCache.entries()) {
        if (route.path.includes(id)) this.routeCache.delete(key);
      }

      if (this.connectedDevices.size === 0) {
        useMeshStore.getState().setMeshStatus('scanning');
      }

      this.scheduleReconnect(id, device, 5_000, 1);
    });
  }

  private scheduleReconnect(deviceId: string, device: Device, delayMs: number, attempt: number): void {
    if (this.isDestroyed || attempt > MAX_RECONNECT_ATTEMPTS) return;
    const existing = this.reconnectTimers.get(deviceId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(deviceId);
      if (
        this.isDestroyed ||
        this.connectedDevices.has(deviceId) ||
        this.connectingDevices.has(deviceId)
      ) return;

      this.connectToDevice(device).catch(() => {
        this.scheduleReconnect(deviceId, device, Math.min(delayMs * 2, 60_000), attempt + 1);
      });
    }, delayMs);

    this.reconnectTimers.set(deviceId, timer);
  }

  // ── BLE notifications ──────────────────────────────────────────────────────

  private subscribeToNotifications(device: Device): void {
    try {
      const sub = device.monitorCharacteristicForService(
        BCHAT_SERVICE_UUID,
        BCHAT_CHAR_RX_UUID,
        (error, characteristic) => {
          if (error) {
            if ((error as any).errorCode !== 3) {
              console.warn('[Mesh] Notification error:', error.reason);
            }
            return;
          }
          if (!characteristic?.value) return;
          this.handleRawIncoming(device.id, characteristic.value).catch((e) =>
            console.error('[Mesh] handleRawIncoming error:', e?.message)
          );
        }
      );
      this.characteristicSubs.set(device.id, sub);
    } catch (e: unknown) {
      console.warn('[Mesh] subscribeToNotifications failed:', (e as Error).message);
    }
  }

  /**
   * Handle incoming base64 BLE value.
   * Fragment envelopes include CRC-32 for corruption detection.
   * Incomplete fragment buffers are cleaned up after FRAG_REASSEMBLY_TIMEOUT_MS.
   */
  private async handleRawIncoming(sourceDeviceId: string, base64Value: string): Promise<void> {
    try {
      const json = Buffer.from(base64Value, 'base64').toString('utf8');
      const parsed = JSON.parse(json);

      // Fragmentation envelope
      if (parsed.__frag === true) {
        const { id: packetId, i: fragIndex, total, d: data, crc } = parsed as {
          id: string; i: number; total: number; d: string; crc?: number; __frag: true;
        };

        // Corruption check: verify CRC-32 if present
        if (crc !== undefined && crc32(data) !== crc) {
          console.warn('[Mesh] Fragment CRC mismatch — dropping fragment', fragIndex, 'of', packetId);
          return;
        }

        if (!this.fragBuffers.has(packetId)) {
          this.fragBuffers.set(packetId, new Map());
          this.fragMeta.set(packetId, { total });

          // Hard timeout: clean up orphaned fragments regardless of completion
          const timer = setTimeout(() => {
            if (this.fragBuffers.has(packetId)) {
              console.warn('[Mesh] Fragment reassembly timeout — discarding', packetId);
              this.fragBuffers.delete(packetId);
              this.fragMeta.delete(packetId);
              this.fragTimers.delete(packetId);
            }
          }, FRAG_REASSEMBLY_TIMEOUT_MS);
          this.fragTimers.set(packetId, timer);
        }

        this.fragBuffers.get(packetId)!.set(fragIndex, data);

        if (this.fragBuffers.get(packetId)!.size === total) {
          // Cancel the timeout — we completed in time
          const timer = this.fragTimers.get(packetId);
          if (timer) { clearTimeout(timer); this.fragTimers.delete(packetId); }

          const sorted: string[] = [];
          for (let k = 0; k < total; k++) {
            const chunk = this.fragBuffers.get(packetId)!.get(k);
            if (!chunk) {
              this.fragBuffers.delete(packetId);
              this.fragMeta.delete(packetId);
              return; // incomplete — discard
            }
            sorted.push(chunk);
          }
          this.fragBuffers.delete(packetId);
          this.fragMeta.delete(packetId);

          const fullBase64 = sorted.join('');
          const fullJson = Buffer.from(fullBase64, 'base64').toString('utf8');
          const packet: MeshPacket = JSON.parse(fullJson);
          if (!packet?.id || !packet?.type) return;
          await this.handleIncomingPacket(packet);
        }
        return;
      }

      // Normal full packet
      const packet: MeshPacket = parsed;
      if (!packet?.id || !packet?.type) {
        console.warn('[Mesh] Malformed packet — missing id or type');
        return;
      }
      await this.handleIncomingPacket(packet);
    } catch (e) {
      console.warn('[Mesh] Failed to parse incoming packet:', e);
    }
  }

  // ── Packet routing ─────────────────────────────────────────────────────────

  async sendMessage(message: Message, targetDeviceId: string): Promise<boolean> {
    if (this.isDestroyed) return false;

    let encryptedContent: string;
    try {
      encryptedContent = await EncryptionService.encryptMessage(
        JSON.stringify(message),
        targetDeviceId
      );
    } catch (e) {
      console.error('[Mesh] Encryption failed:', e);
      return false;
    }

    const checksum = await EncryptionService.generateChecksum(encryptedContent);
    const packet: MeshPacket = {
      id: generatePacketId(),
      type: 'message',
      payload: encryptedContent,
      fromDevice: this.currentDeviceId,
      toDevice: targetDeviceId,
      routePath: [this.currentDeviceId],
      hopCount: 0,
      maxHops: MAX_HOPS,
      timestamp: Date.now(),
      ttl: PACKET_TTL_MS,
      encrypted: true,
      checksum,
      priority: 'high',
    };

    const sent = await this.routePacket(packet);
    if (!sent) {
      await this.queuePacket(packet, targetDeviceId);
      await DatabaseService.enqueuePendingMessage(message, targetDeviceId, 'high');
    }
    return sent;
  }

  private async routePacket(packet: MeshPacket): Promise<boolean> {
    if (packet.hopCount >= packet.maxHops) return false;
    if (Date.now() - packet.timestamp > packet.ttl) return false;
    if (this.isOwnPacket(packet)) return true;

    if (this.isDuplicate(packet.id)) return true;
    this.markSeen(packet.id);

    if (packet.toDevice === this.currentDeviceId) {
      await this.handleIncomingPacket(packet);
      return true;
    }

    if (this.connectedDevices.has(packet.toDevice)) {
      return this.sendDirect(packet.toDevice, packet);
    }

    const route = this.routeCache.get(packet.toDevice);
    if (route?.isActive && route.path.length > 1) {
      const nextHopIndex = route.path.indexOf(this.currentDeviceId) + 1;
      const nextHop = route.path[nextHopIndex];
      if (nextHop && this.connectedDevices.has(nextHop)) {
        const relayed: MeshPacket = {
          ...packet,
          hopCount: packet.hopCount + 1,
          routePath: [...packet.routePath, this.currentDeviceId],
        };
        return this.sendDirect(nextHop, relayed);
      }
    }

    // Controlled flood — prefer higher-scored next-hops
    if (packet.hopCount < 3) {
      // Sort candidate peers by route score descending
      const candidates = Array.from(this.connectedDevices.keys())
        .filter((id) => !packet.routePath.includes(id))
        .sort((a, b) => this.getRouteScore(b) - this.getRouteScore(a));

      let relayed = false;
      for (const deviceId of candidates) {
        const flooded: MeshPacket = {
          ...packet,
          hopCount: packet.hopCount + 1,
          routePath: [...packet.routePath, this.currentDeviceId],
        };
        const ok = await this.sendDirect(deviceId, flooded);
        if (ok) relayed = true;
      }
      return relayed;
    }

    return false;
  }

  /**
   * Sends a packet to a directly connected device via the congestion-controlled
   * write queue. Each BLE fragment is enqueued individually so the per-device
   * queue and window machinery can pace them correctly.
   */
  private async sendDirect(deviceId: string, packet: MeshPacket): Promise<boolean> {
    if (this.isDestroyed) return false;
    const device = this.connectedDevices.get(deviceId);
    if (!device) return false;

    try {
      const fragments = fragmentPacket(packet);
      const isReliable =
        packet.type === 'message' ||
        packet.type === 'file_chunk' ||
        packet.type === 'relay_share';

      let allOk = true;
      for (const fragment of fragments) {
        const ok = await this.enqueueWrite(deviceId, fragment, isReliable, packet.priority);
        if (!ok) { allOk = false; break; }
        // Brief yield between fragments even under the queue to prevent Android saturation
        if (fragments.length > 1) {
          await new Promise<void>((r) => setTimeout(r, 20));
        }
      }

      if (allOk) {
        // Rate-limited route DB write
        const route = this.routeCache.get(packet.toDevice);
        if (route) {
          const newReliability = Math.min(1, route.reliability * 1.02);
          route.lastUsed = Date.now();
          route.reliability = newReliability;
          this.routeCache.set(packet.toDevice, route);

          const snapshot = this.routeSaveSnapshot.get(packet.toDevice);
          const reliabilityDrift = snapshot
            ? Math.abs(newReliability - snapshot.reliability)
            : ROUTE_SAVE_RELIABILITY_DELTA + 1;
          const timeSinceSave = snapshot ? Date.now() - snapshot.lastSaved : Infinity;

          if (reliabilityDrift >= ROUTE_SAVE_RELIABILITY_DELTA || timeSinceSave > 60_000) {
            DatabaseService.saveMeshRoute(route).catch(() => {});
            this.routeSaveSnapshot.set(packet.toDevice, {
              reliability: newReliability,
              lastSaved: Date.now(),
            });
          }
        }
        return true;
      }

      // Write failed — degrade route reliability
      const route = this.routeCache.get(packet.toDevice);
      if (route) {
        route.reliability = Math.max(0.1, route.reliability * 0.8);
        this.routeCache.set(packet.toDevice, route);
      }
      return false;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Mesh] sendDirect failed:', msg);

      if (msg.includes('disconnected') || msg.includes('not connected') || msg.includes('Device')) {
        this.connectedDevices.delete(deviceId);
        this.characteristicSubs.get(deviceId)?.remove();
        this.characteristicSubs.delete(deviceId);
        useMeshStore.getState().removeDevice(deviceId);
      }

      const route = this.routeCache.get(packet.toDevice);
      if (route) {
        route.reliability = Math.max(0.1, route.reliability * 0.8);
        this.routeCache.set(packet.toDevice, route);
      }
      return false;
    }
  }

  // ── Incoming packet handling ───────────────────────────────────────────────

  private async handleIncomingPacket(packet: MeshPacket): Promise<void> {
    if (this.isDestroyed) return;

    if (DB_DEDUP_TYPES.has(packet.type)) {
      const isDup = await DatabaseService.isDuplicatePacket(packet.id);
      if (isDup) return;
    }

    switch (packet.type) {
      case 'message':      await this.handleMessage(packet);      break;
      case 'discovery':    await this.handleDiscovery(packet);    break;
      case 'ack':          this.handleAck(packet);                break;
      case 'heartbeat':    this.handleHeartbeat(packet);          break;
      case 'file_chunk':   await this.handleFileChunk(packet);    break;
      case 'relay_share':  await this.handleRelayShare(packet);   break;
      default:             break;
    }

    if (
      packet.toDevice !== this.currentDeviceId &&
      packet.toDevice !== 'broadcast'
    ) {
      await this.routePacket({
        ...packet,
        hopCount: packet.hopCount + 1,
        routePath: [...packet.routePath, this.currentDeviceId],
      });
    }

    await this.sendAck(packet);
  }

  private async handleMessage(packet: MeshPacket): Promise<void> {
    if (packet.toDevice !== this.currentDeviceId) return;

    try {
      const decrypted = await EncryptionService.decryptMessage(
        packet.payload,
        packet.fromDevice
      );
      const message: Message = JSON.parse(decrypted);

      await DatabaseService.saveMessage({
        ...message,
        status: 'delivered',
        deliveredAt: Date.now(),
      });

      useChatStore.getState().addOrUpdateChat({
        id: message.chatId,
        participants: [message.senderId, message.receiverId],
        lastMessage: { ...message, status: 'delivered' },
        unreadCount: 1,
        isPinned: false,
        isArchived: false,
        isMuted: false,
        isBlocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      useChatStore.getState().incrementUnread(message.chatId);
    } catch (e) {
      console.error('[Mesh] Message decrypt/parse failed:', e);
    }
  }

  private async handleDiscovery(packet: MeshPacket): Promise<void> {
    try {
      const info: { deviceId: string; knownRoutes: string[]; timestamp: number } =
        JSON.parse(packet.payload);

      if (info.deviceId && info.deviceId !== this.currentDeviceId) {
        const existing = useMeshStore.getState().nearbyDevices.find(
          (d) => d.id === packet.fromDevice
        );
        if (existing) {
          await useMeshStore.getState().addOrUpdateDevice({
            ...existing,
            deviceId: info.deviceId,
            lastSeen: Date.now(),
          });
        }
      }

      for (const remoteTarget of info.knownRoutes ?? []) {
        if (remoteTarget === this.currentDeviceId) continue;
        if (!this.routeCache.has(remoteTarget)) {
          const relayRoute: MeshRoute = {
            id: `${this.currentDeviceId}-${remoteTarget}-relay`,
            fromDevice: this.currentDeviceId,
            toDevice: remoteTarget,
            path: [this.currentDeviceId, packet.fromDevice, remoteTarget],
            signalStrength: 60,
            hopCount: 2,
            latency: 150,
            lastUsed: Date.now(),
            reliability: 0.75,
            isActive: true,
          };
          this.routeCache.set(remoteTarget, relayRoute);
          await useMeshStore.getState().addOrUpdateRoute(relayRoute);
        }
      }
    } catch (e) {
      console.warn('[Mesh] Discovery parse failed:', e);
    }
  }

  private handleAck(packet: MeshPacket): void {
    try {
      const { originalPacketId } = JSON.parse(packet.payload) as { originalPacketId: string };
      console.log('[Mesh] ACK received for:', originalPacketId);
    } catch { /* non-critical */ }
  }

  private handleHeartbeat(packet: MeshPacket): void {
    const device = useMeshStore.getState().nearbyDevices.find(
      (d) => d.id === packet.fromDevice
    );
    if (device) {
      useMeshStore.getState().addOrUpdateDevice({ ...device, lastSeen: Date.now() });
    }
  }

  private async handleFileChunk(packet: MeshPacket): Promise<void> {
    try {
      const {
        transferId, chunkIndex, totalChunks, fileName, fileSize, data, checksum,
      } = JSON.parse(packet.payload) as {
        transferId: string; chunkIndex: number; totalChunks: number;
        fileName: string; fileSize: number; data: string; checksum: string;
      };

      const valid = await EncryptionService.verifyChecksum(data, checksum);
      if (!valid) {
        console.warn('[Mesh] File chunk checksum mismatch, dropping chunk', chunkIndex);
        return;
      }

      if (!this.chunkBuffers.has(transferId)) {
        this.chunkBuffers.set(transferId, new Map());
        this.chunkMeta.set(transferId, { fileName, totalChunks, fileSize });
        setTimeout(() => {
          this.chunkBuffers.delete(transferId);
          this.chunkMeta.delete(transferId);
        }, PACKET_TTL_MS * 10);
      }

      const buffer = this.chunkBuffers.get(transferId)!;
      buffer.set(chunkIndex, data);

      const received = buffer.size;
      useMeshStore.getState().updateTransfer(transferId, {
        transferredChunks: received,
        progress: (received / totalChunks) * 100,
      });

      if (received === totalChunks) {
        await this.reassembleFile(transferId);
      }
    } catch (e) {
      console.error('[Mesh] File chunk handling error:', e);
    }
  }

  private async reassembleFile(transferId: string): Promise<void> {
    const buffer = this.chunkBuffers.get(transferId);
    const meta = this.chunkMeta.get(transferId);
    if (!buffer || !meta) return;

    try {
      const sortedChunks: string[] = [];
      for (let i = 0; i < meta.totalChunks; i++) {
        const chunk = buffer.get(i);
        if (!chunk) throw new Error(`Missing chunk ${i}`);
        sortedChunks.push(chunk);
      }

      const fullData = sortedChunks.join('');
      const destDir = `${FileSystem.documentDirectory}bchat/received/`;
      const destPath = `${destDir}${meta.fileName}`;

      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
      await FileSystem.writeAsStringAsync(destPath, fullData, {
        encoding: FileSystem.EncodingType.Base64,
      });

      useMeshStore.getState().updateTransfer(transferId, {
        status: 'completed',
        completedAt: Date.now(),
        localPath: destPath,
        progress: 100,
      });
    } catch (e) {
      console.error('[Mesh] Reassembly failed:', e);
      useMeshStore.getState().updateTransfer(transferId, { status: 'failed' });
    } finally {
      this.chunkBuffers.delete(transferId);
      this.chunkMeta.delete(transferId);
    }
  }

  private async handleRelayShare(packet: MeshPacket): Promise<void> {
    await this.handleFileChunk(packet);

    for (const [deviceId] of this.connectedDevices) {
      if (deviceId !== packet.fromDevice && !packet.routePath.includes(deviceId)) {
        const relayed: MeshPacket = {
          ...packet,
          hopCount: packet.hopCount + 1,
          routePath: [...packet.routePath, this.currentDeviceId],
        };
        await this.sendDirect(deviceId, relayed).catch(() => {});
        await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
    }
  }

  // ── Auto relay share ───────────────────────────────────────────────────────

  async startAutoRelayShare(filePath: string, fileName: string, fileSize: number): Promise<void> {
    const transferId = generatePacketId();

    const fileContent = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const chunks = splitIntoChunks(fileContent, RELAY_CHUNK_SIZE_BYTES);
    const transfer: FileTransfer = {
      id: transferId,
      fileName,
      fileSize,
      fileType: getFileType(fileName),
      senderId: this.currentDeviceId,
      receiverIds: Array.from(this.connectedDevices.keys()),
      chunks: [],
      totalChunks: chunks.length,
      transferredChunks: 0,
      status: 'transferring',
      isAutoRelay: true,
      progress: 0,
      startedAt: Date.now(),
    };

    useMeshStore.getState().addTransfer(transfer);

    for (let i = 0; i < chunks.length; i++) {
      if (this.isDestroyed) break;
      const chunk = chunks[i];
      const checksum = await EncryptionService.generateChecksum(chunk);

      const packet: MeshPacket = {
        id: generatePacketId(),
        type: 'relay_share',
        payload: JSON.stringify({
          transferId, fileName, fileSize,
          chunkIndex: i, totalChunks: chunks.length,
          data: chunk, checksum,
        }),
        fromDevice: this.currentDeviceId,
        toDevice: 'broadcast',
        routePath: [this.currentDeviceId],
        hopCount: 0,
        maxHops: MAX_HOPS,
        timestamp: Date.now(),
        ttl: PACKET_TTL_MS * 5,
        encrypted: false,
        checksum: '',
        priority: 'normal',
      };

      for (const [deviceId] of this.connectedDevices) {
        await this.sendDirect(deviceId, packet).catch(() => {});
        await new Promise<void>((r) => setTimeout(r, 20));
      }

      useMeshStore.getState().updateTransfer(transferId, {
        transferredChunks: i + 1,
        progress: ((i + 1) / chunks.length) * 100,
      });

      await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
    }

    useMeshStore.getState().updateTransfer(transferId, {
      status: 'completed',
      completedAt: Date.now(),
      progress: 100,
    });
    useMeshStore.getState().evictOldTransfers();
  }

  // ── Discovery broadcast ────────────────────────────────────────────────────

  private async sendDiscovery(targetDeviceId: string): Promise<void> {
    const packet: MeshPacket = {
      id: generatePacketId(),
      type: 'discovery',
      payload: JSON.stringify({
        deviceId: this.currentDeviceId,
        knownRoutes: Array.from(this.routeCache.keys()),
        timestamp: Date.now(),
      }),
      fromDevice: this.currentDeviceId,
      toDevice: targetDeviceId,
      routePath: [this.currentDeviceId],
      hopCount: 0,
      maxHops: 1,
      timestamp: Date.now(),
      ttl: PACKET_TTL_MS,
      encrypted: false,
      checksum: '',
      priority: 'high',
    };
    await this.sendDirect(targetDeviceId, packet);
  }

  // ── Pending queue ──────────────────────────────────────────────────────────

  private async queuePacket(packet: MeshPacket, targetDeviceId: string): Promise<void> {
    const existing = this.pendingPackets.get(targetDeviceId) ?? [];
    if (existing.length >= MAX_PENDING_PER_DEVICE) {
      const lowIdx = existing.findIndex((e) => e.packet.priority === 'low');
      if (lowIdx >= 0) existing.splice(lowIdx, 1);
      else existing.shift();
    }
    existing.push({ packet, enqueuedAt: Date.now() });
    this.pendingPackets.set(targetDeviceId, existing);
    useMeshStore.getState().setMeshStatus('relaying');
  }

  private async deliverPendingPackets(deviceId: string): Promise<void> {
    const pending = [...(this.pendingPackets.get(deviceId) ?? [])];
    const dbPending = await DatabaseService.getPendingForDevice(deviceId);

    const memPackets = pending.filter((e) => Date.now() - e.enqueuedAt < PACKET_TTL_MS);
    const delivered: PendingEntry[] = [];

    for (const entry of memPackets) {
      const ok = await this.routePacket(entry.packet).catch(() => false);
      if (ok) delivered.push(entry);
    }

    if (delivered.length > 0) {
      const deliveredIds = new Set(delivered.map((e) => e.packet.id));
      const remaining = (this.pendingPackets.get(deviceId) ?? [])
        .filter((e) => !deliveredIds.has(e.packet.id));
      if (remaining.length === 0) this.pendingPackets.delete(deviceId);
      else this.pendingPackets.set(deviceId, remaining);
    }

    for (const message of dbPending) {
      const sent = await this.sendMessage(message, deviceId);
      if (sent) {
        await DatabaseService.removePendingMessage(message.id);
      } else {
        const backoff = Math.min(1000 * Math.pow(2, 3), 30_000);
        await DatabaseService.incrementRetry(message.id, backoff);
      }
    }
  }

  // ── ACK ────────────────────────────────────────────────────────────────────

  private async sendAck(originalPacket: MeshPacket): Promise<void> {
    if (originalPacket.type === 'ack' || originalPacket.type === 'heartbeat') return;
    if (originalPacket.fromDevice === this.currentDeviceId) return;

    const ack: MeshPacket = {
      id: generatePacketId(),
      type: 'ack',
      payload: JSON.stringify({ originalPacketId: originalPacket.id }),
      fromDevice: this.currentDeviceId,
      toDevice: originalPacket.fromDevice,
      routePath: [this.currentDeviceId],
      hopCount: 0,
      maxHops: MAX_HOPS,
      timestamp: Date.now(),
      ttl: 10_000,
      encrypted: false,
      checksum: '',
      priority: 'high',
    };
    await this.routePacket(ack).catch(() => {});
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (this.isDestroyed) return;
      for (const [deviceId] of this.connectedDevices) {
        const hb: MeshPacket = {
          id: generatePacketId(),
          type: 'heartbeat',
          payload: JSON.stringify({ deviceId: this.currentDeviceId, ts: Date.now() }),
          fromDevice: this.currentDeviceId,
          toDevice: deviceId,
          routePath: [this.currentDeviceId],
          hopCount: 0,
          maxHops: 1,
          timestamp: Date.now(),
          ttl: 5_000,
          encrypted: false,
          checksum: '',
          priority: 'low',
        };
        const ok = await this.sendDirect(deviceId, hb).catch(() => false);
        if (!ok) {
          this.connectedDevices.delete(deviceId);
          this.characteristicSubs.get(deviceId)?.remove();
          this.characteristicSubs.delete(deviceId);
          useMeshStore.getState().removeDevice(deviceId);
          if (this.connectedDevices.size === 0) {
            useMeshStore.getState().setMeshStatus('scanning');
          }
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // ── Periodic cleanup ───────────────────────────────────────────────────────

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      if (this.isDestroyed) return;
      const now = Date.now();

      // LRU caches self-evict at capacity — manual TTL pass for dedup only
      for (const [id, entry] of this.deduplicationCache.entries()) {
        if (now - entry.timestamp > DEDUP_TTL_MS) this.deduplicationCache.delete(id);
      }
      for (const [key, route] of this.routeCache.entries()) {
        if (now - route.lastUsed > ROUTE_TTL_MS) this.routeCache.delete(key);
      }
      for (const [device, packets] of this.pendingPackets) {
        const fresh = packets.filter((e) => now - e.enqueuedAt < PACKET_TTL_MS);
        if (fresh.length === 0) this.pendingPackets.delete(device);
        else this.pendingPackets.set(device, fresh);
      }
      for (const [key] of this.routeSaveSnapshot) {
        if (!this.routeCache.has(key)) this.routeSaveSnapshot.delete(key);
      }
      // Prune route scores for devices no longer seen
      for (const [id] of this.routeScores) {
        if (!this.connectedDevices.has(id) && !this.routeCache.has(id)) {
          this.routeScores.delete(id);
        }
      }

      await DatabaseService.cleanupExpiredData().catch(() => {});
      useMeshStore.getState().evictOldTransfers();
    }, 60_000);
  }

  // ── Deduplication ──────────────────────────────────────────────────────────

  private isDuplicate(packetId: string): boolean {
    return this.deduplicationCache.has(packetId);
  }

  private markSeen(packetId: string): void {
    this.deduplicationCache.set(packetId, { timestamp: Date.now() });
  }

  private isOwnPacket(packet: MeshPacket): boolean {
    return packet.fromDevice === this.currentDeviceId;
  }
}

export const meshNetworkService = new MeshNetworkService();
