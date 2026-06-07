import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useMeshStore } from '@/store/meshStore';
import { useAuthStore } from '@/store/authStore';
import { meshNetworkService } from '@/mesh/MeshNetworkService';
import { NearbyDevice } from '@/types';

function SignalBars({ rssi }: { rssi: number }) {
  const strength =
    rssi > -60 ? 4 : rssi > -75 ? 3 : rssi > -85 ? 2 : 1;
  return (
    <View style={styles.signalBars}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.signalBar,
            { height: 5 + i * 3 },
            i <= strength ? styles.signalBarActive : styles.signalBarInactive,
          ]}
        />
      ))}
    </View>
  );
}

function DeviceCard({
  device,
  onConnect,
}: {
  device: NearbyDevice;
  onConnect: (device: NearbyDevice) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 400, useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const distanceLabel =
    device.distance < 1
      ? `${(device.distance * 100).toFixed(0)} cm`
      : `${device.distance.toFixed(1)} m`;

  return (
    <Animated.View style={[styles.deviceCard, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={[COLORS.card, COLORS.surfaceElevated]}
        style={styles.deviceCardInner}
      >
        <View style={styles.deviceLeft}>
          <View style={styles.deviceAvatarWrapper}>
            <Image
              source={{
                uri: device.user?.avatar ??
                  `https://api.dicebear.com/7.x/avataaars/png?seed=${device.deviceId}`,
              }}
              style={styles.deviceAvatar}
            />
            <View style={[
              styles.deviceStatusDot,
              { backgroundColor: device.isConnected ? COLORS.online : COLORS.offline },
            ]} />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>
              {device.user?.name ?? device.name}
            </Text>
            <View style={styles.deviceMetaRow}>
              <MaterialCommunityIcons name="bluetooth" size={11} color={COLORS.neonBlue} />
              <Text style={styles.deviceMeta}>{device.connectionType.toUpperCase()}</Text>
              <View style={styles.metaDot} />
              <Feather name="navigation" size={10} color={COLORS.textMuted} />
              <Text style={styles.deviceMeta}>{distanceLabel}</Text>
            </View>
            {device.isConnected && (
              <View style={styles.connectedBadge}>
                <View style={styles.connectedDot} />
                <Text style={styles.connectedText}>Connected</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.deviceRight}>
          <SignalBars rssi={device.rssi} />
          <TouchableOpacity
            style={[
              styles.connectBtn,
              device.isConnected && styles.connectBtnSecondary,
            ]}
            onPress={() => onConnect(device)}
          >
            <Text style={[
              styles.connectBtnText,
              device.isConnected && styles.connectBtnTextSecondary,
            ]}>
              {device.isConnected ? 'Chat' : 'Connect'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function NearbyTab() {
  const { nearbyDevices, isScanning, meshStatus, connectedCount, isMeshActive } =
    useMeshStore();
  const { currentUser } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);

  const radarRotate = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.8)).current;

  // Radar sweep animation
  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(radarRotate, {
        toValue: 1, duration: 3000, useNativeDriver: true,
      })
    );
    if (isScanning) sweep.start();
    else sweep.stop();
    return () => sweep.stop();
  }, [isScanning, radarRotate]);

  // Pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.8, duration: 1000, useNativeDriver: true }),
      ])
    );
    if (isScanning) pulse.start();
    else { pulse.stop(); pulseAnim.setValue(1); }
    return () => pulse.stop();
  }, [isScanning, pulseAnim]);

  const radarSpin = radarRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleConnect = (device: NearbyDevice) => {
    if (device.isConnected) {
      router.push(`/chat/${device.deviceId}`);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 2000);
  };

  const statusColor =
    meshStatus === 'connected' ? COLORS.neonTeal
    : meshStatus === 'scanning' ? COLORS.neonBlue
    : meshStatus === 'error' ? COLORS.error
    : COLORS.textMuted;

  const statusLabel =
    meshStatus === 'connected' ? 'Mesh Active'
    : meshStatus === 'scanning' ? 'Scanning...'
    : meshStatus === 'relaying' ? 'Relaying'
    : meshStatus === 'error' ? 'Error'
    : 'Idle';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(0,212,255,0.08)', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Nearby</Text>
          <Text style={styles.headerSubtitle}>
            {nearbyDevices.length} device{nearbyDevices.length !== 1 ? 's' : ''} detected
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, { borderColor: statusColor + '44' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>

      {/* Radar */}
      <View style={styles.radarSection}>
        {/* Rings */}
        {[80, 120, 160].map((size, i) => (
          <Animated.View
            key={size}
            style={[
              styles.radarRing,
              {
                width: size * 2,
                height: size * 2,
                borderRadius: size,
                opacity: isScanning ? (0.5 - i * 0.12) : 0.1,
                transform: isScanning ? [{ scale: pulseAnim }] : [],
              },
            ]}
          />
        ))}

        {/* Sweep line */}
        {isScanning && (
          <Animated.View
            style={[styles.radarSweep, { transform: [{ rotate: radarSpin }] }]}
          >
            <LinearGradient
              colors={['transparent', COLORS.neonTeal + '44', COLORS.neonTeal]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.radarSweepLine}
            />
          </Animated.View>
        )}

        {/* Center */}
        <View style={styles.radarCenter}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.neonBlue]}
            style={styles.radarCenterGradient}
          >
            <MaterialCommunityIcons name="bluetooth" size={26} color="#fff" />
          </LinearGradient>
        </View>

        {/* Connected count */}
        <Text style={styles.radarLabel}>
          {connectedCount} connected
        </Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Detected', value: nearbyDevices.length, icon: 'radar', color: COLORS.neonBlue },
          { label: 'Connected', value: connectedCount, icon: 'link', color: COLORS.neonTeal },
          { label: 'Mesh Hops', value: useMeshStore.getState().meshRoutes.length, icon: 'git-merge', color: COLORS.primary },
        ].map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Feather name={stat.icon as any} size={16} color={stat.color} />
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Device list */}
      {nearbyDevices.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="radar" size={56} color={COLORS.border} />
          <Text style={styles.emptyTitle}>No Devices Nearby</Text>
          <Text style={styles.emptySubtitle}>
            Make sure Bluetooth is enabled and others are running B-Chat nearby
          </Text>
        </View>
      ) : (
        <FlatList
          data={nearbyDevices.sort((a, b) => b.rssi - a.rssi)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DeviceCard device={item} onConnect={handleConnect} />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  headerSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  headerRight: { paddingTop: 4 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700' },
  radarSection: {
    height: 220, alignItems: 'center', justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  radarRing: {
    position: 'absolute', borderWidth: 1.5, borderColor: COLORS.neonBlue,
    backgroundColor: 'transparent',
  },
  radarSweep: {
    position: 'absolute', width: 160, height: 160,
    alignItems: 'flex-end', justifyContent: 'center',
  },
  radarSweepLine: { width: 80, height: 2, borderRadius: 1 },
  radarCenter: { borderRadius: 36 },
  radarCenterGradient: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  radarLabel: {
    position: 'absolute', bottom: 8,
    fontSize: 12, color: COLORS.neonTeal, fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: SPACING.xl,
    gap: SPACING.md, marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  listContent: { paddingHorizontal: SPACING.xl, paddingBottom: 100 },
  deviceCard: { marginBottom: SPACING.md, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  deviceCardInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  deviceLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  deviceAvatarWrapper: { position: 'relative' },
  deviceAvatar: { width: 50, height: 50, borderRadius: 25 },
  deviceStatusDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: COLORS.card,
  },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  deviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  deviceMeta: { fontSize: 11, color: COLORS.textMuted },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: COLORS.textMuted },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
  },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.neonTeal },
  connectedText: { fontSize: 11, color: COLORS.neonTeal, fontWeight: '600' },
  deviceRight: { alignItems: 'flex-end', gap: SPACING.sm },
  signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  signalBar: { width: 4, borderRadius: 2 },
  signalBarActive: { backgroundColor: COLORS.neonTeal },
  signalBarInactive: { backgroundColor: COLORS.borderLight },
  connectBtn: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 6,
  },
  connectBtnSecondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary },
  connectBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  connectBtnTextSecondary: { color: COLORS.primary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.sm, textAlign: 'center' },
});
