import { create } from 'zustand';
import { NearbyDevice, MeshRoute, FileTransfer } from '@/types';
import { DatabaseService } from '@/database/DatabaseService';

// Retain at most this many completed transfers in memory
const MAX_COMPLETED_TRANSFERS = 20;

interface MeshState {
  nearbyDevices: NearbyDevice[];
  meshRoutes: MeshRoute[];
  activeTransfers: FileTransfer[];
  isScanning: boolean;
  isMeshActive: boolean;
  meshStatus: 'idle' | 'scanning' | 'connected' | 'relaying' | 'error';
  connectedCount: number;

  // Devices
  setNearbyDevices: (devices: NearbyDevice[]) => void;
  addOrUpdateDevice: (device: NearbyDevice) => Promise<void>;
  removeDevice: (deviceId: string) => void;

  // Routes
  setMeshRoutes: (routes: MeshRoute[]) => void;
  addOrUpdateRoute: (route: MeshRoute) => Promise<void>;
  invalidateRoutesThrough: (deviceId: string) => Promise<void>;
  hydrateRoutes: (fromDevice: string) => Promise<void>;

  // Status
  setIsScanning: (scanning: boolean) => void;
  setMeshActive: (active: boolean) => void;
  setMeshStatus: (status: MeshState['meshStatus']) => void;

  // Transfers
  addTransfer: (transfer: FileTransfer) => void;
  updateTransfer: (id: string, updates: Partial<FileTransfer>) => void;
  evictOldTransfers: () => void;
}

function computeConnectedCount(devices: NearbyDevice[]): number {
  return devices.filter((d) => d.isConnected).length;
}

export const useMeshStore = create<MeshState>((set, get) => ({
  nearbyDevices: [],
  meshRoutes: [],
  activeTransfers: [],
  isScanning: false,
  isMeshActive: false,
  meshStatus: 'idle',
  connectedCount: 0,

  // ── Devices ───────────────────────────────────────────────────────────────

  setNearbyDevices: (devices) =>
    set({ nearbyDevices: devices, connectedCount: computeConnectedCount(devices) }),

  addOrUpdateDevice: async (device) => {
    set((state) => {
      const exists = state.nearbyDevices.some((d) => d.id === device.id);
      const devices = exists
        ? state.nearbyDevices.map((d) => (d.id === device.id ? device : d))
        : [...state.nearbyDevices, device];
      return { nearbyDevices: devices, connectedCount: computeConnectedCount(devices) };
    });
    try {
      await DatabaseService.saveNearbyDevice(device);
    } catch (e) {
      console.error('[MeshStore] saveNearbyDevice failed:', e);
    }
  },

  removeDevice: (deviceId) =>
    set((state) => {
      const devices = state.nearbyDevices.filter((d) => d.id !== deviceId);
      return { nearbyDevices: devices, connectedCount: computeConnectedCount(devices) };
    }),

  // ── Routes ────────────────────────────────────────────────────────────────

  setMeshRoutes: (routes) => set({ meshRoutes: routes }),

  addOrUpdateRoute: async (route) => {
    set((state) => ({
      meshRoutes: state.meshRoutes.some((r) => r.id === route.id)
        ? state.meshRoutes.map((r) => (r.id === route.id ? route : r))
        : [...state.meshRoutes, route],
    }));
    try {
      await DatabaseService.saveMeshRoute(route);
    } catch (e) {
      console.error('[MeshStore] saveMeshRoute failed:', e);
    }
  },

  invalidateRoutesThrough: async (deviceId) => {
    set((state) => ({
      meshRoutes: state.meshRoutes.map((r) =>
        r.path.includes(deviceId) ? { ...r, isActive: false } : r
      ),
    }));
    try {
      await DatabaseService.invalidateRoutesThrough(deviceId);
    } catch (e) {
      console.error('[MeshStore] invalidateRoutesThrough failed:', e);
    }
  },

  hydrateRoutes: async (fromDevice) => {
    try {
      const routes = await DatabaseService.getMeshRoutes(fromDevice);
      set({ meshRoutes: routes });
    } catch (e) {
      console.error('[MeshStore] hydrateRoutes failed:', e);
    }
  },

  // ── Status ────────────────────────────────────────────────────────────────

  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setMeshActive: (active) => set({ isMeshActive: active }),
  setMeshStatus: (status) => set({ meshStatus: status }),

  // ── Transfers ─────────────────────────────────────────────────────────────

  addTransfer: (transfer) =>
    set((state) => {
      const next = [...state.activeTransfers, transfer];
      return { activeTransfers: next };
    }),

  updateTransfer: (id, updates) =>
    set((state) => ({
      activeTransfers: state.activeTransfers.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  evictOldTransfers: () =>
    set((state) => {
      const active = state.activeTransfers.filter(
        (t) => t.status === 'transferring' || t.status === 'preparing' || t.status === 'paused'
      );
      const completed = state.activeTransfers
        .filter((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, MAX_COMPLETED_TRANSFERS);
      return { activeTransfers: [...active, ...completed] };
    }),
}));