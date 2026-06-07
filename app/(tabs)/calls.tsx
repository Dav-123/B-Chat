import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, Animated, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useMeshStore } from '@/store/meshStore';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';
import { callService } from '@/services/CallService';
import { meshNetworkService } from '@/mesh/MeshNetworkService';
import { Call, NearbyDevice, Message } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import uuid from 'react-native-uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function getCallDirection(
  call: Call,
  currentUserId: string
): 'incoming' | 'outgoing' | 'missed' {
  if (call.callerId === currentUserId) return 'outgoing';
  if (call.status === 'missed') return 'missed';
  return 'incoming';
}

// ─── Incoming call banner ─────────────────────────────────────────────────────

function IncomingCallBanner({
  call,
  onAccept,
  onReject,
}: {
  call: Call;
  onAccept: () => void;
  onReject: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0, tension: 60, friction: 8, useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [slideAnim, pulseAnim]);

  return (
    <Animated.View style={[styles.incomingBanner, { transform: [{ translateY: slideAnim }] }]}>
      <LinearGradient
        colors={[COLORS.surface, COLORS.card]}
        style={styles.incomingBannerInner}
      >
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Image
            source={{ uri: `https://api.dicebear.com/7.x/avataaars/png?seed=${call.callerId}` }}
            style={styles.incomingAvatar}
          />
        </Animated.View>
        <View style={styles.incomingInfo}>
          <Text style={styles.incomingName} numberOfLines={1}>
            Incoming {call.type === 'video' ? 'Video' : 'Voice'} Call
          </Text>
          <View style={styles.incomingMeta}>
            <MaterialCommunityIcons name="bluetooth" size={11} color={COLORS.neonBlue} />
            <Text style={styles.incomingMetaText}>via Bluetooth mesh</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.rejectBtn} onPress={onReject}>
          <Feather name="phone-off" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
          <Feather name="phone" size={18} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Call log item ────────────────────────────────────────────────────────────

function CallLogItem({
  call,
  currentUserId,
  onCallBack,
}: {
  call: Call;
  currentUserId: string;
  onCallBack: (targetId: string, type: 'voice' | 'video') => void;
}) {
  const direction = getCallDirection(call, currentUserId);
  const participantId =
    call.callerId === currentUserId ? call.receiverId : call.callerId;

  const directionColor =
    direction === 'missed' ? COLORS.error
    : direction === 'incoming' ? COLORS.neonTeal
    : COLORS.neonBlue;

  const directionIcon =
    direction === 'incoming' ? 'phone-incoming'
    : direction === 'outgoing' ? 'phone-outgoing'
    : 'phone-missed';

  const statusLabel =
    direction === 'missed' ? 'Missed'
    : call.status === 'ended' ? 'Ended'
    : call.status === 'rejected' ? 'Declined'
    : direction === 'incoming' ? 'Received'
    : 'Called';

  return (
    <View style={styles.callItem}>
      <TouchableOpacity
        onPress={() => router.push(`/user-profile/${participantId}`)}
      >
        <View style={styles.callAvatarWrapper}>
          <Image
            source={{ uri: `https://api.dicebear.com/7.x/avataaars/png?seed=${participantId}` }}
            style={styles.callAvatar}
          />
          <View style={[styles.callTypeDot, {
            backgroundColor: call.type === 'video' ? COLORS.neonBlue : COLORS.neonTeal,
          }]}>
            <Feather
              name={call.type === 'video' ? 'video' : 'phone'}
              size={8}
              color="#fff"
            />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.callInfo}>
        <Text style={styles.callName} numberOfLines={1}>
          {participantId.slice(0, 14)}
        </Text>
        <View style={styles.callMeta}>
          <MaterialCommunityIcons
            name={directionIcon as any}
            size={13}
            color={directionColor}
          />
          <Text style={[styles.callMetaText, { color: directionColor }]}>
            {statusLabel}
          </Text>
          {call.duration ? (
            <Text style={styles.callDuration}>
              · {formatDuration(call.duration)}
            </Text>
          ) : null}
        </View>
        <Text style={styles.callTime}>
          {formatDistanceToNow(
            call.startedAt ?? call.endedAt ?? Date.now(),
            { addSuffix: true }
          )}
        </Text>
      </View>

      <View style={styles.callActions}>
        <TouchableOpacity
          style={styles.callActionBtn}
          onPress={() => onCallBack(participantId, 'voice')}
        >
          <Feather name="phone" size={17} color={COLORS.neonTeal} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.callActionBtn}
          onPress={() => onCallBack(participantId, 'video')}
        >
          <Feather name="video" size={17} color={COLORS.neonBlue} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Quick call device card ───────────────────────────────────────────────────

function QuickCallCard({
  device,
  onVoiceCall,
  onVideoCall,
}: {
  device: NearbyDevice;
  onVoiceCall: () => void;
  onVideoCall: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const name = device.user?.name ?? device.name ?? 'Unknown';
  const avatar = device.user?.avatar ??
    `https://api.dicebear.com/7.x/avataaars/png?seed=${device.deviceId}`;

  const rssiQuality =
    device.rssi > -60 ? 'Excellent'
    : device.rssi > -75 ? 'Good'
    : device.rssi > -85 ? 'Fair'
    : 'Weak';

  const rssiColor =
    device.rssi > -60 ? COLORS.neonTeal
    : device.rssi > -75 ? COLORS.neonBlue
    : device.rssi > -85 ? COLORS.warning
    : COLORS.error;

  return (
    <View style={styles.quickCard}>
      <View style={styles.quickAvatarWrapper}>
        <Animated.View style={[styles.quickAvatarRing, {
          transform: [{ scale: pulseAnim }],
          borderColor: rssiColor,
        }]}>
          <Image source={{ uri: avatar }} style={styles.quickAvatar} />
        </Animated.View>
        <View style={[styles.quickOnlineDot, { backgroundColor: COLORS.online }]} />
      </View>

      <Text style={styles.quickName} numberOfLines={1}>{name.split(' ')[0]}</Text>

      <View style={[styles.quickSignalBadge, { backgroundColor: rssiColor + '22' }]}>
        <Text style={[styles.quickSignalText, { color: rssiColor }]}>
          {rssiQuality}
        </Text>
      </View>

      <Text style={styles.quickDistance}>
        ~{device.distance.toFixed(1)}m
      </Text>

      <View style={styles.quickBtns}>
        <TouchableOpacity style={styles.quickVoiceBtn} onPress={onVoiceCall}>
          <LinearGradient
            colors={[COLORS.neonTeal, COLORS.primary]}
            style={styles.quickBtnGradient}
          >
            <Feather name="phone" size={15} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickVideoBtn} onPress={onVideoCall}>
          <LinearGradient
            colors={[COLORS.neonBlue, COLORS.primary]}
            style={styles.quickBtnGradient}
          >
            <Feather name="video" size={15} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main calls tab ───────────────────────────────────────────────────────────

export default function CallsTab() {
  const { nearbyDevices, isMeshActive } = useMeshStore();
  const { currentUser } = useAuthStore();

  const [calls, setCalls] = useState<Call[]>([]);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  const connectedDevices = nearbyDevices.filter((d) => d.isConnected);

  // ── Load call history from DB ─────────────────────────────────────────────

  const loadCalls = useCallback(async () => {
    try {
      const stored = await DatabaseService.getCalls(currentUser?.id ?? '');
      setCalls(stored);
    } catch (e) {
      console.error('[Calls] Load failed:', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  // ── Listen for incoming calls via callService ─────────────────────────────

  useEffect(() => {
    loadCalls();

    const unsubscribe = callService.on(async (event) => {
      if (event.type === 'incoming' && event.call) {
        setIncomingCall(event.call);

        // Persist incoming call to DB immediately
        await DatabaseService.saveCall({
          ...event.call,
          status: 'ringing',
        });
      }

      if (event.type === 'ended' || event.type === 'rejected') {
        setIncomingCall(null);
        setActiveCallId(null);
        // Reload call history to get updated status/duration
        await loadCalls();
      }

      if (event.type === 'accepted') {
        setIncomingCall(null);
      }
    });

    return () => unsubscribe();
  }, [loadCalls]);

  // ── Initiate an outgoing call ─────────────────────────────────────────────

  const initiateCall = useCallback(
    async (targetDeviceId: string, type: 'voice' | 'video') => {
      if (!currentUser) return;

      if (!isMeshActive) {
        Alert.alert(
          'Mesh Offline',
          'Bluetooth mesh is not active. Enable Bluetooth to make calls.',
          [{ text: 'OK' }]
        );
        return;
      }

      const targetDevice = nearbyDevices.find(
        (d) => d.deviceId === targetDeviceId || d.id === targetDeviceId
      );

      if (!targetDevice?.isConnected) {
        Alert.alert(
          'User Out of Range',
          'This user is not currently connected via Bluetooth mesh. They will be notified when in range.',
          [{ text: 'OK' }]
        );
        return;
      }

      try {
        const callId = uuid.v4() as string;

        const newCall: Call = {
          id: callId,
          type,
          callerId: currentUser.id,
          receiverId: targetDeviceId,
          status: 'ringing',
          startedAt: Date.now(),
          meshRoute: [targetDeviceId],
        };

        // Save to DB before navigation
        await DatabaseService.saveCall(newCall);
        setCalls((prev) => [newCall, ...prev]);
        setActiveCallId(callId);

        // Use callService with mesh signalling
        await callService.initiateCall(
          currentUser.id,
          targetDeviceId,
          type,
          targetDeviceId,
          async (targetId, signal) => {
            const signalMsg: Message = {
              id: uuid.v4() as string,
              chatId: `call_${callId}`,
              senderId: currentUser.id,
              receiverId: targetId,
              content: JSON.stringify(signal),
              type: 'call',
              timestamp: Date.now(),
              status: 'sent',
              encrypted: true,
              hopCount: 0,
              routePath: [],
              reactions: [],
              readBy: [],
            };
            await meshNetworkService.sendMessage(signalMsg, targetId);
          }
        );

        router.push(`/call/${callId}?type=${type}&targetId=${targetDeviceId}`);
      } catch (e) {
        console.error('[Calls] Initiate failed:', e);
        Alert.alert('Call Failed', 'Could not start the call. Please try again.');
        setActiveCallId(null);
      }
    },
    [currentUser, isMeshActive, nearbyDevices]
  );

  // ── Accept incoming call ──────────────────────────────────────────────────

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall || !currentUser) return;

    try {
      await DatabaseService.updateCallStatus(incomingCall.id, 'accepted');

      await callService.acceptCall(
        incomingCall.id,
        incomingCall.callerId,
        async (targetId, signal) => {
          const signalMsg: Message = {
            id: uuid.v4() as string,
            chatId: `call_${incomingCall.id}`,
            senderId: currentUser.id,
            receiverId: targetId,
            content: JSON.stringify(signal),
            type: 'call',
            timestamp: Date.now(),
            status: 'sent',
            encrypted: true,
            hopCount: 0,
            routePath: [],
            reactions: [],
            readBy: [],
          };
          await meshNetworkService.sendMessage(signalMsg, targetId);
        }
      );

      setActiveCallId(incomingCall.id);
      setIncomingCall(null);

      router.push(
        `/call/${incomingCall.id}?type=${incomingCall.type}&targetId=${incomingCall.callerId}`
      );
    } catch (e) {
      console.error('[Calls] Accept failed:', e);
      Alert.alert('Error', 'Could not accept the call.');
      setIncomingCall(null);
    }
  }, [incomingCall, currentUser]);

  // ── Reject incoming call ──────────────────────────────────────────────────

  const rejectIncomingCall = useCallback(async () => {
    if (!incomingCall || !currentUser) return;

    try {
      await DatabaseService.updateCallStatus(incomingCall.id, 'rejected');

      await callService.rejectCall(
        incomingCall.id,
        incomingCall.callerId,
        async (targetId, signal) => {
          const signalMsg: Message = {
            id: uuid.v4() as string,
            chatId: `call_${incomingCall.id}`,
            senderId: currentUser.id,
            receiverId: targetId,
            content: JSON.stringify(signal),
            type: 'call',
            timestamp: Date.now(),
            status: 'sent',
            encrypted: true,
            hopCount: 0,
            routePath: [],
            reactions: [],
            readBy: [],
          };
          await meshNetworkService.sendMessage(signalMsg, targetId);
        }
      );
    } catch (e) {
      console.error('[Calls] Reject failed:', e);
    } finally {
      setIncomingCall(null);
      await loadCalls();
    }
  }, [incomingCall, currentUser, loadCalls]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCalls();
    setRefreshing(false);
  };

  const clearCallHistory = () => {
    Alert.alert(
      'Clear Call History',
      'Delete all call logs? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await DatabaseService.clearCalls(currentUser?.id ?? '');
            setCalls([]);
          },
        },
      ]
    );
  };

  // ── Group calls by date ───────────────────────────────────────────────────

  const groupedCalls = calls.reduce<{ title: string; data: Call[] }[]>((acc, call) => {
    const date = new Date(call.startedAt ?? Date.now());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let title: string;
    if (date.toDateString() === today.toDateString()) title = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) title = 'Yesterday';
    else title = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

    const existing = acc.find((g) => g.title === title);
    if (existing) existing.data.push(call);
    else acc.push({ title, data: [call] });
    return acc;
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(123,94,167,0.12)', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Incoming call banner */}
      {incomingCall && (
        <IncomingCallBanner
          call={incomingCall}
          onAccept={acceptIncomingCall}
          onReject={rejectIncomingCall}
        />
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calls</Text>
        <View style={styles.headerActions}>
          <View style={[
            styles.meshStatusChip,
            { borderColor: isMeshActive ? COLORS.neonTeal + '55' : COLORS.error + '55' },
          ]}>
            <MaterialCommunityIcons
              name={isMeshActive ? 'bluetooth-connect' : 'bluetooth-off'}
              size={12}
              color={isMeshActive ? COLORS.neonTeal : COLORS.error}
            />
            <Text style={[
              styles.meshStatusText,
              { color: isMeshActive ? COLORS.neonTeal : COLORS.error },
            ]}>
              {isMeshActive ? `${connectedDevices.length} nearby` : 'Offline'}
            </Text>
          </View>
          {calls.length > 0 && (
            <TouchableOpacity style={styles.headerBtn} onPress={clearCallHistory}>
              <MaterialCommunityIcons
                name="delete-sweep-outline"
                size={20}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={groupedCalls}
        keyExtractor={(item) => item.title}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
        ListHeaderComponent={() => (
          <View>
            {/* Quick call strip */}
            {connectedDevices.length > 0 && (
              <View style={styles.quickSection}>
                <View style={styles.quickHeader}>
                  <View style={styles.quickHeaderLeft}>
                    <View style={styles.quickLiveDot} />
                    <Text style={styles.quickTitle}>
                      {connectedDevices.length} Available Now
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => router.push('/(tabs)/nearby')}>
                    <Text style={styles.quickSeeAll}>See all</Text>
                  </TouchableOpacity>
                </View>

                <FlatList
                  horizontal
                  data={connectedDevices}
                  keyExtractor={(item) => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickList}
                  renderItem={({ item }) => (
                    <QuickCallCard
                      device={item}
                      onVoiceCall={() => initiateCall(item.deviceId, 'voice')}
                      onVideoCall={() => initiateCall(item.deviceId, 'video')}
                    />
                  )}
                />
              </View>
            )}

            {/* Offline state */}
            {!isMeshActive && (
              <View style={styles.offlineBanner}>
                <MaterialCommunityIcons
                  name="bluetooth-off"
                  size={16}
                  color={COLORS.warning}
                />
                <Text style={styles.offlineBannerText}>
                  Bluetooth mesh is offline. Enable Bluetooth to make and receive calls.
                </Text>
              </View>
            )}

            {/* Active call banner */}
            {activeCallId && (
              <TouchableOpacity
                style={styles.activeCallBanner}
                onPress={() => router.push(`/call/${activeCallId}`)}
              >
                <LinearGradient
                  colors={[COLORS.neonTeal + '22', COLORS.primary + '22']}
                  style={styles.activeCallBannerInner}
                >
                  <MaterialCommunityIcons
                    name="phone-in-talk"
                    size={18}
                    color={COLORS.neonTeal}
                  />
                  <Text style={styles.activeCallText}>Active call — tap to return</Text>
                  <Feather name="chevron-right" size={16} color={COLORS.neonTeal} />
                </LinearGradient>
              </TouchableOpacity>
            )}

            {groupedCalls.length > 0 && (
              <Text style={styles.sectionLabel}>Call History</Text>
            )}
          </View>
        )}
        renderItem={({ item: group }) => (
          <View>
            <Text style={styles.dateLabel}>{group.title}</Text>
            {group.data.map((call) => (
              <CallLogItem
                key={call.id}
                call={call}
                currentUserId={currentUser?.id ?? ''}
                onCallBack={initiateCall}
              />
            ))}
          </View>
        )}
        ListEmptyComponent={() => (
          !isLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="phone-outline"
                size={64}
                color={COLORS.border}
              />
              <Text style={styles.emptyTitle}>No Call History</Text>
              <Text style={styles.emptySubtitle}>
                Voice and video calls via Bluetooth mesh will appear here
              </Text>
              {connectedDevices.length > 0 ? (
                <TouchableOpacity
                  style={styles.startCallBtn}
                  onPress={() => initiateCall(connectedDevices[0].deviceId, 'voice')}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
                    style={styles.startCallGradient}
                  >
                    <Feather name="phone" size={16} color="#fff" />
                    <Text style={styles.startCallText}>
                      Call {connectedDevices[0].user?.name ?? 'Nearby User'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.startCallBtn}
                  onPress={() => router.push('/(tabs)/nearby')}
                >
                  <LinearGradient
                    colors={COLORS.gradientPrimary as [string, string]}
                    style={styles.startCallGradient}
                  >
                    <MaterialCommunityIcons
                      name="bluetooth-connect"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.startCallText}>Find Nearby Users</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        )}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },

  // Incoming banner
  incomingBanner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 20,
  },
  incomingBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  incomingAvatar: { width: 44, height: 44, borderRadius: 22 },
  incomingInfo: { flex: 1 },
  incomingName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  incomingMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  incomingMetaText: { fontSize: 11, color: COLORS.neonBlue },
  rejectBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center',
  },
  acceptBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.neonTeal, alignItems: 'center', justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerBtn: { padding: SPACING.sm },
  meshStatusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1,
    backgroundColor: COLORS.card,
  },
  meshStatusText: { fontSize: 11, fontWeight: '700' },

  // Quick call
  quickSection: { marginBottom: SPACING.xl },
  quickHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.md,
  },
  quickHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  quickLiveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.neonTeal,
  },
  quickTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  quickSeeAll: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  quickList: { paddingHorizontal: SPACING.xl, gap: SPACING.md },
  quickCard: {
    width: 100, alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  quickAvatarWrapper: { position: 'relative' },
  quickAvatarRing: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2,
    padding: 2, alignItems: 'center', justifyContent: 'center',
  },
  quickAvatar: { width: 50, height: 50, borderRadius: 25 },
  quickOnlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: COLORS.card,
  },
  quickName: { fontSize: 12, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  quickSignalBadge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  quickSignalText: { fontSize: 9, fontWeight: '700' },
  quickDistance: { fontSize: 10, color: COLORS.textMuted },
  quickBtns: { flexDirection: 'row', gap: SPACING.sm },
  quickVoiceBtn: { borderRadius: 16, overflow: 'hidden' },
  quickVideoBtn: { borderRadius: 16, overflow: 'hidden' },
  quickBtnGradient: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // Offline + active banners
  offlineBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    backgroundColor: COLORS.warning + '15', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.warning + '33',
  },
  offlineBannerText: { flex: 1, fontSize: 13, color: COLORS.warning, lineHeight: 18 },
  activeCallBanner: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg, overflow: 'hidden',
  },
  activeCallBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.neonTeal + '44',
    borderRadius: BORDER_RADIUS.lg,
  },
  activeCallText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.neonTeal },

  // List
  listContent: { paddingBottom: 100 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm,
  },
  dateLabel: {
    fontSize: 12, fontWeight: '600', color: COLORS.textMuted,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },

  // Call item
  callItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  callAvatarWrapper: { position: 'relative' },
  callAvatar: { width: 50, height: 50, borderRadius: 25 },
  callTypeDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  callInfo: { flex: 1 },
  callName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  callMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  callMetaText: { fontSize: 12, fontWeight: '600' },
  callDuration: { fontSize: 12, color: COLORS.textMuted },
  callTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  callActions: { flexDirection: 'row', gap: SPACING.sm },
  callActionBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.borderLight,
  },

  // Empty state
  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.xxxl,
    gap: SPACING.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: {
    fontSize: 14, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 21,
  },
  startCallBtn: { borderRadius: BORDER_RADIUS.full, overflow: 'hidden', marginTop: SPACING.sm },
  startCallGradient: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  startCallText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
