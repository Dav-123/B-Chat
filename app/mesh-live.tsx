import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, FlatList, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useMeshStore } from '@/store/meshStore';
import { DatabaseService } from '@/database/DatabaseService';
import { FileTransfer, MeshRoute, NearbyDevice } from '@/types';

// ─── BLE packet log entry ─────────────────────────────────────────────────────
interface PacketLog {
  id: string;
  timestamp: number;
  type: string;
  fromDevice: string;
  toDevice: string;
  hopCount: number;
  size: number;
  status: 'sent' | 'received' | 'relayed' | 'dropped';
}

// ─── Signal history for sparkline ────────────────────────────────────────────
interface SignalPoint { time: number; rssi: number; deviceId: string }

// ─── Animated signal bar ──────────────────────────────────────────────────────
function SignalSparkline({
  points, color,
}: { points: number[]; color: string }) {
  const max = Math.max(...points, -40);
  const min = Math.min(...points, -100);
  const range = max - min || 1;
  const H = 40;
  const W = 8;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 2 }}>
      {points.slice(-20).map((rssi, i) => {
        const normalized = Math.max(0, (rssi - min) / range);
        const barH = Math.max(3, normalized * H);
        return (
          <View
            key={i}
            style={{
              width: W, height: barH, borderRadius: 2,
              backgroundColor: normalized > 0.6 ? COLORS.neonTeal
                : normalized > 0.3 ? COLORS.warning : COLORS.error,
              opacity: 0.6 + normalized * 0.4,
            }}
          />
        );
      })}
    </View>
  );
}

// ─── Single device live card ──────────────────────────────────────────────────
function DeviceLiveCard({
  device, signalHistory,
}: { device: NearbyDevice; signalHistory: number[] }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const quality =
    device.rssi > -60 ? 'Excellent'
    : device.rssi > -75 ? 'Good'
    : device.rssi > -85 ? 'Fair'
    : 'Poor';

  const qualityColor =
    device.rssi > -60 ? COLORS.neonTeal
    : device.rssi > -75 ? COLORS.neonBlue
    : device.rssi > -85 ? COLORS.warning
    : COLORS.error;

  const eta = device.distance < 1
    ? 'Immediate'
    : `~${(device.distance * 0.05).toFixed(1)}s`;

  return (
    <View style={styles.deviceLiveCard}>
      <LinearGradient
        colors={[COLORS.card, COLORS.surfaceElevated]}
        style={styles.deviceLiveCardInner}
      >
        {/* Header row */}
        <View style={styles.dlHeader}>
          <View style={styles.dlHeaderLeft}>
            <Animated.View style={[styles.dlPulse, {
              backgroundColor: qualityColor,
              opacity: device.isConnected ? pulseAnim : 0.2,
            }]} />
            <View>
              <Text style={styles.dlName}>
                {device.user?.name ?? device.name}
              </Text>
              <Text style={styles.dlId}>
                {device.deviceId.slice(0, 20)}...
              </Text>
            </View>
          </View>
          <View style={[styles.dlQualityBadge, { borderColor: qualityColor + '55', backgroundColor: qualityColor + '15' }]}>
            <Text style={[styles.dlQualityText, { color: qualityColor }]}>{quality}</Text>
          </View>
        </View>

        {/* Live metrics */}
        <View style={styles.dlMetrics}>
          {[
            { label: 'RSSI', value: `${device.rssi} dBm`, color: qualityColor },
            { label: 'Distance', value: `${device.distance.toFixed(1)}m`, color: COLORS.neonBlue },
            { label: 'Protocol', value: device.connectionType.toUpperCase(), color: COLORS.primary },
            { label: 'TX ETA', value: eta, color: COLORS.neonOrange },
          ].map((m) => (
            <View key={m.label} style={styles.dlMetric}>
              <Text style={[styles.dlMetricValue, { color: m.color }]}>{m.value}</Text>
              <Text style={styles.dlMetricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>

        {/* Signal sparkline */}
        <View style={styles.dlSparkline}>
          <Text style={styles.dlSparklineLabel}>Signal History</Text>
          <SignalSparkline points={signalHistory} color={qualityColor} />
        </View>

        {/* Connection status bar */}
        <View style={styles.dlStatusBar}>
          <View style={styles.dlStatusItem}>
            <MaterialCommunityIcons
              name={device.isConnected ? 'bluetooth-connect' : 'bluetooth-off'}
              size={13}
              color={device.isConnected ? COLORS.neonTeal : COLORS.textMuted}
            />
            <Text style={[styles.dlStatusText, { color: device.isConnected ? COLORS.neonTeal : COLORS.textMuted }]}>
              {device.isConnected ? 'Connected' : 'Not Connected'}
            </Text>
          </View>
          <Text style={styles.dlLastSeen}>
            Last seen {Math.floor((Date.now() - device.lastSeen) / 1000)}s ago
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

// ─── File transfer row ────────────────────────────────────────────────────────
function TransferLiveRow({ transfer }: { transfer: FileTransfer }) {
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: transfer.progress / 100,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [transfer.progress, progressAnim]);

  const statusColor =
    transfer.status === 'completed' ? COLORS.neonTeal
    : transfer.status === 'failed' ? COLORS.error
    : transfer.status === 'transferring' ? COLORS.neonBlue
    : COLORS.warning;

  const elapsed = (Date.now() - transfer.startedAt) / 1000;
  const speed = transfer.transferredChunks > 0
    ? ((transfer.transferredChunks * 400) / elapsed / 1024).toFixed(1)
    : '0';

  const etaSeconds = transfer.progress > 0 && transfer.progress < 100
    ? ((100 - transfer.progress) / transfer.progress * elapsed).toFixed(0)
    : null;

  return (
    <View style={styles.transferLiveRow}>
      <View style={styles.tlHeader}>
        <View style={styles.tlIcon}>
          <MaterialCommunityIcons
            name={transfer.isAutoRelay ? 'access-point' : 'file-send-outline'}
            size={18}
            color={statusColor}
          />
        </View>
        <View style={styles.tlInfo}>
          <Text style={styles.tlName} numberOfLines={1}>{transfer.fileName}</Text>
          <Text style={styles.tlMeta}>
            {(transfer.fileSize / 1024).toFixed(1)} KB •{' '}
            {transfer.isAutoRelay ? 'Auto Relay' : 'Direct'} •{' '}
            {transfer.transferredChunks}/{transfer.totalChunks} chunks
          </Text>
        </View>
        <View style={[styles.tlStatus, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.tlStatusText, { color: statusColor }]}>
            {transfer.status}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.tlProgressBg}>
        <Animated.View
          style={[
            styles.tlProgressFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }) as any,
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      {/* Speed and ETA */}
      <View style={styles.tlFooter}>
        <Text style={styles.tlFooterText}>{transfer.progress.toFixed(1)}%</Text>
        <Text style={styles.tlFooterText}>{speed} KB/s</Text>
        {etaSeconds && (
          <Text style={styles.tlFooterText}>ETA: {etaSeconds}s</Text>
        )}
        {transfer.completedAt && (
          <Text style={[styles.tlFooterText, { color: COLORS.neonTeal }]}>
            Done in {((transfer.completedAt - transfer.startedAt) / 1000).toFixed(1)}s
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Packet log row ───────────────────────────────────────────────────────────
function PacketLogRow({ log }: { log: PacketLog }) {
  const color =
    log.status === 'received' ? COLORS.neonTeal
    : log.status === 'sent' ? COLORS.neonBlue
    : log.status === 'relayed' ? COLORS.neonOrange
    : COLORS.error;

  return (
    <View style={styles.packetRow}>
      <View style={[styles.packetTypeBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.packetType, { color }]}>
          {log.type.slice(0, 4).toUpperCase()}
        </Text>
      </View>
      <View style={styles.packetInfo}>
        <Text style={styles.packetRoute}>
          {log.fromDevice.slice(0, 8)} → {log.toDevice.slice(0, 8)}
        </Text>
        <Text style={styles.packetMeta}>
          {log.hopCount}h • {log.size}B • {log.status}
        </Text>
      </View>
      <Text style={styles.packetTime}>
        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
type TabType = 'devices' | 'transfers' | 'packets' | 'routes';

export default function MeshLive() {
  const { nearbyDevices, activeTransfers, meshRoutes, meshStatus, connectedCount } = useMeshStore();
  const [activeTab, setActiveTab] = useState<TabType>('devices');
  const [packetLogs] = useState<PacketLog[]>([]);
  const [signalHistory, setSignalHistory] = useState<Record<string, number[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const tickAnim = useRef(new Animated.Value(0)).current;

  // Update signal history every 2 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSignalHistory((prev) => {
        const next = { ...prev };
        for (const device of nearbyDevices) {
          const history = next[device.id] ?? [];
          next[device.id] = [...history.slice(-29), device.rssi];
        }
        return next;
      });

      // Tick animation
      Animated.sequence([
        Animated.timing(tickAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(tickAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]).start();
    }, 2000);

    return () => clearInterval(interval);
  }, [nearbyDevices, tickAnim]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const tabs: { id: TabType; label: string; icon: string; count: number }[] = [
    { id: 'devices', label: 'Devices', icon: 'bluetooth', count: nearbyDevices.length },
    { id: 'transfers', label: 'Transfers', icon: 'file-send-outline', count: activeTransfers.length },
    { id: 'packets', label: 'Packets', icon: 'package-variant', count: packetLogs.length },
    { id: 'routes', label: 'Routes', icon: 'routes', count: meshRoutes.length },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(0,212,255,0.1)', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Live Mesh Monitor</Text>
          <Animated.View style={[styles.liveChip, { opacity: tickAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </Animated.View>
        </View>
        <View style={styles.connectedChip}>
          <MaterialCommunityIcons name="bluetooth-connect" size={13} color={COLORS.neonTeal} />
          <Text style={styles.connectedChipText}>{connectedCount}</Text>
        </View>
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <MaterialCommunityIcons name="access-point-network" size={14} color={COLORS.neonBlue} />
          <Text style={styles.statusItemText}>{meshStatus}</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <MaterialCommunityIcons name="bluetooth" size={14} color={COLORS.neonTeal} />
          <Text style={styles.statusItemText}>{connectedCount} connected</Text>
        </View>
        <View style={styles.statusDivider} />
        <View style={styles.statusItem}>
          <MaterialCommunityIcons name="routes" size={14} color={COLORS.primary} />
          <Text style={styles.statusItemText}>{meshRoutes.filter((r) => r.isActive).length} routes</Text>
        </View>
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <MaterialCommunityIcons
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.id ? '#fff' : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[styles.tabBadge, activeTab === tab.id && styles.tabBadgeActive]}>
                <Text style={styles.tabBadgeText}>{tab.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.neonBlue}
            colors={[COLORS.neonBlue]}
          />
        }
      >
        {/* Devices tab */}
        {activeTab === 'devices' && (
          nearbyDevices.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="bluetooth-off" size={52} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No Devices Detected</Text>
              <Text style={styles.emptySub}>Enable Bluetooth and scan for nearby B-Chat users</Text>
            </View>
          ) : (
            nearbyDevices.map((device) => (
              <DeviceLiveCard
                key={device.id}
                device={device}
                signalHistory={signalHistory[device.id] ?? [device.rssi]}
              />
            ))
          )
        )}

        {/* Transfers tab */}
        {activeTab === 'transfers' && (
          activeTransfers.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="file-send-outline" size={52} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No Active Transfers</Text>
              <Text style={styles.emptySub}>File transfers will appear here in real-time</Text>
            </View>
          ) : (
            activeTransfers.map((t) => (
              <TransferLiveRow key={t.id} transfer={t} />
            ))
          )
        )}

        {/* Packets tab */}
        {activeTab === 'packets' && (
          packetLogs.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="package-variant-closed" size={52} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No Packet Logs</Text>
              <Text style={styles.emptySub}>
                BLE packet activity appears here. Send a message to generate traffic.
              </Text>
            </View>
          ) : (
            <View style={styles.packetLog}>
              {packetLogs.slice(-50).reverse().map((log) => (
                <PacketLogRow key={log.id} log={log} />
              ))}
            </View>
          )
        )}

        {/* Routes tab */}
        {activeTab === 'routes' && (
          meshRoutes.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="routes" size={52} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No Routes Cached</Text>
              <Text style={styles.emptySub}>Routes are discovered as devices connect</Text>
            </View>
          ) : (
            meshRoutes.map((route) => (
              <View key={route.id} style={styles.routeLiveCard}>
                <View style={styles.routeLiveHeader}>
                  <Text style={styles.routeLivePath}>
                    {route.path.map((p) => p.slice(0, 8)).join(' → ')}
                  </Text>
                  <View style={[
                    styles.routeLiveStatus,
                    { backgroundColor: route.isActive ? COLORS.neonTeal + '22' : COLORS.error + '22' },
                  ]}>
                    <Text style={[
                      styles.routeLiveStatusText,
                      { color: route.isActive ? COLORS.neonTeal : COLORS.error },
                    ]}>
                      {route.isActive ? 'LIVE' : 'DEAD'}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeLiveMeta}>
                  <View style={styles.routeLiveMetaItem}>
                    <Feather name="git-merge" size={11} color={COLORS.textMuted} />
                    <Text style={styles.routeLiveMetaText}>{route.hopCount} hops</Text>
                  </View>
                  <View style={styles.routeLiveMetaItem}>
                    <Feather name="clock" size={11} color={COLORS.textMuted} />
                    <Text style={styles.routeLiveMetaText}>{route.latency}ms latency</Text>
                  </View>
                  <View style={styles.routeLiveMetaItem}>
                    <Feather name="activity" size={11} color={COLORS.textMuted} />
                    <Text style={styles.routeLiveMetaText}>
                      {(route.reliability * 100).toFixed(0)}% reliable
                    </Text>
                  </View>
                  <View style={styles.routeLiveMetaItem}>
                    <MaterialCommunityIcons name="signal" size={12} color={COLORS.textMuted} />
                    <Text style={styles.routeLiveMetaText}>{route.signalStrength} dBm</Text>
                  </View>
                </View>
                <View style={styles.routeReliabilityBar}>
                  <View style={[
                    styles.routeReliabilityFill,
                    {
                      width: `${route.reliability * 100}%` as any,
                      backgroundColor: route.reliability > 0.7 ? COLORS.neonTeal
                        : route.reliability > 0.4 ? COLORS.warning : COLORS.error,
                    },
                  ]} />
                </View>
              </View>
            ))
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg, gap: SPACING.md,
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  liveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.error + '22', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.error },
  liveText: { fontSize: 9, fontWeight: '800', color: COLORS.error, letterSpacing: 0.5 },
  connectedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.neonTeal + '22', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.neonTeal + '44',
  },
  connectedChipText: { fontSize: 13, fontWeight: '700', color: COLORS.neonTeal },
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surfaceElevated,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, justifyContent: 'center' },
  statusItemText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },
  statusDivider: { width: 1, height: 14, backgroundColor: COLORS.borderLight },
  tabsRow: {
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabBadge: {
    backgroundColor: COLORS.borderLight, borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 10, color: COLORS.text, fontWeight: '700' },
  content: { padding: SPACING.xl, paddingBottom: 60 },
  emptyState: {
    alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl,
    gap: SPACING.md, marginTop: SPACING.xxl,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 19 },
  // Device live card
  deviceLiveCard: {
    marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden',
  },
  deviceLiveCardInner: {
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.xl, gap: SPACING.md,
  },
  dlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dlHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  dlPulse: { width: 10, height: 10, borderRadius: 5 },
  dlName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  dlId: { fontSize: 10, color: COLORS.textMuted, fontFamily: 'monospace', marginTop: 1 },
  dlQualityBadge: {
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1,
  },
  dlQualityText: { fontSize: 11, fontWeight: '700' },
  dlMetrics: { flexDirection: 'row', justifyContent: 'space-between' },
  dlMetric: { alignItems: 'center', gap: 2 },
  dlMetricValue: { fontSize: 14, fontWeight: '800' },
  dlMetricLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  dlSparkline: { gap: SPACING.xs },
  dlSparklineLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  dlStatusBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  dlStatusItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dlStatusText: { fontSize: 12, fontWeight: '600' },
  dlLastSeen: { fontSize: 11, color: COLORS.textMuted },
  // Transfer live row
  transferLiveRow: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.sm,
  },
  tlHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  tlIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center',
  },
  tlInfo: { flex: 1 },
  tlName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tlMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  tlStatus: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  tlStatusText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  tlProgressBg: {
    height: 6, backgroundColor: COLORS.surfaceElevated,
    borderRadius: 3, overflow: 'hidden',
  },
  tlProgressFill: { height: '100%', borderRadius: 3, minWidth: 4 },
  tlFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  tlFooterText: { fontSize: 11, color: COLORS.textMuted },
  // Packet log
  packetLog: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden',
  },
  packetRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  packetTypeBadge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm, minWidth: 44, alignItems: 'center',
  },
  packetType: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, fontFamily: 'monospace' },
  packetInfo: { flex: 1 },
  packetRoute: { fontSize: 11, color: COLORS.text, fontFamily: 'monospace' },
  packetMeta: { fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  packetTime: { fontSize: 10, color: COLORS.textMuted, fontFamily: 'monospace' },
  // Route live card
  routeLiveCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  routeLiveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeLivePath: { fontSize: 12, color: COLORS.text, fontFamily: 'monospace', flex: 1 },
  routeLiveStatus: {
    paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full,
  },
  routeLiveStatusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  routeLiveMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  routeLiveMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  routeLiveMetaText: { fontSize: 11, color: COLORS.textMuted },
  routeReliabilityBar: {
    height: 5, backgroundColor: COLORS.surfaceElevated, borderRadius: 3, overflow: 'hidden',
  },
  routeReliabilityFill: { height: '100%', borderRadius: 3, minWidth: 4 },
});
