import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useMeshStore } from '@/store/meshStore';
import { DatabaseService } from '@/database/DatabaseService';
import { MeshRoute, NearbyDevice } from '@/types';

function StatCard({
  label, value, icon, color, sub,
}: {
  label: string; value: string | number; icon: string; color: string; sub?: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: color + '33' }]}>
      <View style={[styles.statIconWrapper, { backgroundColor: color + '22' }]}>
        <MaterialCommunityIcons name={icon as any} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function RouteCard({ route }: { route: MeshRoute }) {
  const reliabilityColor =
    route.reliability > 0.8 ? COLORS.neonTeal
    : route.reliability > 0.5 ? COLORS.warning
    : COLORS.error;

  return (
    <View style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <View style={styles.routeDevices}>
          <Text style={styles.routeDevice} numberOfLines={1}>
            {route.fromDevice.slice(0, 10)}...
          </Text>
          <MaterialCommunityIcons
            name="arrow-right"
            size={14}
            color={COLORS.textMuted}
          />
          <Text style={styles.routeDevice} numberOfLines={1}>
            {route.toDevice.slice(0, 10)}...
          </Text>
        </View>
        <View style={[
          styles.routeActiveBadge,
          { backgroundColor: route.isActive ? COLORS.neonTeal + '22' : COLORS.error + '22' },
        ]}>
          <View style={[
            styles.routeActiveDot,
            { backgroundColor: route.isActive ? COLORS.neonTeal : COLORS.error },
          ]} />
          <Text style={[
            styles.routeActiveText,
            { color: route.isActive ? COLORS.neonTeal : COLORS.error },
          ]}>
            {route.isActive ? 'Active' : 'Dead'}
          </Text>
        </View>
      </View>

      <View style={styles.routeMeta}>
        <View style={styles.routeMetaItem}>
          <Feather name="git-merge" size={11} color={COLORS.textMuted} />
          <Text style={styles.routeMetaText}>{route.hopCount} hops</Text>
        </View>
        <View style={styles.routeMetaItem}>
          <Feather name="clock" size={11} color={COLORS.textMuted} />
          <Text style={styles.routeMetaText}>{route.latency}ms</Text>
        </View>
        <View style={styles.routeMetaItem}>
          <MaterialCommunityIcons name="signal" size={12} color={COLORS.textMuted} />
          <Text style={styles.routeMetaText}>{route.signalStrength} dBm</Text>
        </View>
      </View>

      {/* Reliability bar */}
      <View style={styles.reliabilityRow}>
        <Text style={styles.reliabilityLabel}>Reliability</Text>
        <View style={styles.reliabilityBar}>
          <View style={[
            styles.reliabilityFill,
            {
              width: `${route.reliability * 100}%` as any,
              backgroundColor: reliabilityColor,
            },
          ]} />
        </View>
        <Text style={[styles.reliabilityValue, { color: reliabilityColor }]}>
          {(route.reliability * 100).toFixed(0)}%
        </Text>
      </View>

      {/* Path */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.pathRow}>
          {route.path.map((node, i) => (
            <React.Fragment key={node}>
              <View style={styles.pathNode}>
                <Text style={styles.pathNodeText}>{node.slice(0, 8)}</Text>
              </View>
              {i < route.path.length - 1 && (
                <MaterialCommunityIcons name="chevron-right" size={14} color={COLORS.textMuted} />
              )}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function DeviceRow({ device }: { device: NearbyDevice }) {
  const strength =
    device.rssi > -60 ? 4 : device.rssi > -75 ? 3 : device.rssi > -85 ? 2 : 1;

  return (
    <View style={styles.deviceRow}>
      <View style={[
        styles.deviceStatusDot,
        { backgroundColor: device.isConnected ? COLORS.neonTeal : COLORS.offline },
      ]} />
      <View style={styles.deviceRowInfo}>
        <Text style={styles.deviceRowName}>{device.name}</Text>
        <Text style={styles.deviceRowMeta}>
          {device.deviceId.slice(0, 16)}... • {device.distance.toFixed(1)}m
        </Text>
      </View>
      <View style={styles.deviceRowRight}>
        <View style={styles.minSignalBars}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.minSignalBar,
                { height: 4 + i * 2 },
                i <= strength ? styles.minSignalBarActive : styles.minSignalBarInactive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.deviceRowRssi}>{device.rssi} dBm</Text>
      </View>
    </View>
  );
}

export default function MeshDiagnostics() {
  const {
    nearbyDevices, meshRoutes, activeTransfers,
    meshStatus, isScanning, connectedCount, isMeshActive,
  } = useMeshStore();

  const [pendingCount, setPendingCount] = useState(0);
  const [dbRouteCount, setDbRouteCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadStats();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    if (isScanning) pulse.start();
    else pulse.stop();
    return () => pulse.stop();
  }, [isScanning, pulseAnim]);

  const loadStats = async () => {
    try {
      const pending = await DatabaseService.getPendingMessages();
      setPendingCount(pending.length);
      const routes = await DatabaseService.getMeshRoutes('all');
      setDbRouteCount(routes.length);
    } catch (e) {
      console.error('[Diagnostics]', e);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const statusColor =
    meshStatus === 'connected' ? COLORS.neonTeal
    : meshStatus === 'scanning' ? COLORS.neonBlue
    : meshStatus === 'error' ? COLORS.error
    : COLORS.textMuted;

  const activeRoutes = meshRoutes.filter((r) => r.isActive);
  const avgReliability = activeRoutes.length > 0
    ? (activeRoutes.reduce((s, r) => s + r.reliability, 0) / activeRoutes.length * 100).toFixed(0)
    : '0';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(0,212,255,0.08)', 'transparent']}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mesh Diagnostics</Text>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <View style={[styles.liveIndicator, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
            <View style={[styles.liveDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.liveText, { color: statusColor }]}>
              {meshStatus.toUpperCase()}
            </Text>
          </View>
        </Animated.View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard label="Devices" value={nearbyDevices.length} icon="devices" color={COLORS.neonBlue} sub="detected" />
          <StatCard label="Connected" value={connectedCount} icon="link-variant" color={COLORS.neonTeal} sub="active" />
          <StatCard label="Routes" value={activeRoutes.length} icon="routes" color={COLORS.primary} sub="active" />
          <StatCard label="Reliability" value={`${avgReliability}%`} icon="chart-line" color={COLORS.neonOrange} />
          <StatCard label="Pending" value={pendingCount} icon="timer-sand" color={COLORS.warning} sub="messages" />
          <StatCard label="Transfers" value={activeTransfers.length} icon="file-send-outline" color={COLORS.neonPurple} />
        </View>

        {/* Mesh health bar */}
        <View style={styles.healthCard}>
          <View style={styles.healthHeader}>
            <MaterialCommunityIcons name="heart-pulse" size={18} color={COLORS.neonTeal} />
            <Text style={styles.healthTitle}>Mesh Health</Text>
          </View>
          <View style={styles.healthBar}>
            <LinearGradient
              colors={[COLORS.neonTeal, COLORS.neonBlue]}
              style={[
                styles.healthFill,
                { width: `${Math.min(100, connectedCount * 20)}%` as any },
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </View>
          <Text style={styles.healthHint}>
            {connectedCount === 0
              ? 'No devices connected. Enable Bluetooth and move closer to other users.'
              : connectedCount < 3
              ? 'Weak mesh. More nearby B-Chat users improve relay capability.'
              : 'Good mesh coverage. Messages can relay effectively.'}
          </Text>
        </View>

        {/* Active transfers */}
        {activeTransfers.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Active Transfers</Text>
            {activeTransfers.map((t) => (
              <View key={t.id} style={styles.transferCard}>
                <View style={styles.transferHeader}>
                  <Feather name="file" size={16} color={COLORS.primary} />
                  <Text style={styles.transferName} numberOfLines={1}>{t.fileName}</Text>
                  <Text style={styles.transferStatus}>{t.status}</Text>
                </View>
                <View style={styles.transferBar}>
                  <View style={[styles.transferFill, { width: `${t.progress}%` as any }]} />
                </View>
                <Text style={styles.transferMeta}>
                  {t.transferredChunks}/{t.totalChunks} chunks •{' '}
                  {(t.fileSize / 1024).toFixed(1)} KB •{' '}
                  {t.isAutoRelay ? 'Auto Relay' : 'Direct'}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* Routes */}
        <Text style={styles.sectionTitle}>
          Mesh Routes ({meshRoutes.length})
        </Text>
        {meshRoutes.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="routes" size={36} color={COLORS.border} />
            <Text style={styles.emptyText}>No routes discovered yet</Text>
            <Text style={styles.emptyHint}>Routes appear as devices connect via mesh</Text>
          </View>
        ) : (
          meshRoutes.slice(0, 10).map((route) => (
            <RouteCard key={route.id} route={route} />
          ))
        )}

        {/* Nearby devices detail */}
        <Text style={styles.sectionTitle}>
          Nearby Devices ({nearbyDevices.length})
        </Text>
        {nearbyDevices.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="radar" size={36} color={COLORS.border} />
            <Text style={styles.emptyText}>No devices detected</Text>
          </View>
        ) : (
          <View style={styles.devicesCard}>
            {nearbyDevices.map((device) => (
              <DeviceRow key={device.id} device={device} />
            ))}
          </View>
        )}

        {/* Info */}
        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.neonBlue} />
          <Text style={styles.infoText}>
            Pull to refresh diagnostics. Route data updates automatically as your mesh changes.
            Data persists between sessions via SQLite.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  liveIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  content: { padding: SPACING.xl, paddingBottom: 60 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.xl },
  statCard: {
    width: '30%', flex: 1, alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg, paddingHorizontal: SPACING.sm,
    borderWidth: 1, minWidth: '28%',
  },
  statIconWrapper: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },
  statSub: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center' },
  healthCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  healthHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  healthTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  healthBar: {
    height: 8, backgroundColor: COLORS.surfaceElevated,
    borderRadius: 4, overflow: 'hidden', marginBottom: SPACING.md,
  },
  healthFill: { height: '100%', borderRadius: 4, minWidth: 12 },
  healthHint: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.textSecondary,
    marginBottom: SPACING.md, marginTop: SPACING.sm,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  transferCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  transferHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  transferName: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  transferStatus: { fontSize: 11, color: COLORS.textMuted, textTransform: 'capitalize' },
  transferBar: {
    height: 6, backgroundColor: COLORS.surfaceElevated,
    borderRadius: 3, overflow: 'hidden', marginBottom: SPACING.sm,
  },
  transferFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3, minWidth: 4 },
  transferMeta: { fontSize: 11, color: COLORS.textMuted },
  routeCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  routeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeDevices: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  routeDevice: { fontSize: 12, color: COLORS.textSecondary, fontFamily: 'monospace' },
  routeActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full,
  },
  routeActiveDot: { width: 5, height: 5, borderRadius: 3 },
  routeActiveText: { fontSize: 10, fontWeight: '700' },
  routeMeta: { flexDirection: 'row', gap: SPACING.lg },
  routeMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  routeMetaText: { fontSize: 11, color: COLORS.textMuted },
  reliabilityRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  reliabilityLabel: { fontSize: 11, color: COLORS.textMuted, width: 64 },
  reliabilityBar: {
    flex: 1, height: 6, backgroundColor: COLORS.surfaceElevated,
    borderRadius: 3, overflow: 'hidden',
  },
  reliabilityFill: { height: '100%', borderRadius: 3, minWidth: 4 },
  reliabilityValue: { fontSize: 11, fontWeight: '700', width: 32, textAlign: 'right' },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pathNode: {
    backgroundColor: COLORS.surfaceElevated, borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  pathNodeText: { fontSize: 10, color: COLORS.textSecondary, fontFamily: 'monospace' },
  devicesCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden',
    marginBottom: SPACING.xl,
  },
  deviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  deviceStatusDot: { width: 8, height: 8, borderRadius: 4 },
  deviceRowInfo: { flex: 1 },
  deviceRowName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  deviceRowMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  deviceRowRight: { alignItems: 'flex-end', gap: 4 },
  minSignalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  minSignalBar: { width: 3, borderRadius: 1 },
  minSignalBarActive: { backgroundColor: COLORS.neonTeal },
  minSignalBarInactive: { backgroundColor: COLORS.borderLight },
  deviceRowRssi: { fontSize: 10, color: COLORS.textMuted },
  emptyCard: {
    alignItems: 'center', gap: SPACING.sm, padding: SPACING.xl,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderLight, marginBottom: SPACING.xl,
  },
  emptyText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  emptyHint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  infoCard: {
    flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start',
    backgroundColor: 'rgba(10,132,255,0.08)', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: 'rgba(10,132,255,0.2)',
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
});
