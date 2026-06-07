import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useMeshStore } from '@/store/meshStore';
import { meshNetworkService } from '@/mesh/MeshNetworkService';
import { Message } from '@/types';
import uuid from 'react-native-uuid';

const { width, height } = Dimensions.get('window');

// ─── Call signal types sent via mesh packets ──────────────────────────────────

type CallSignalType =
  | 'call_ring'
  | 'call_accept'
  | 'call_reject'
  | 'call_end'
  | 'call_heartbeat';

interface CallSignal {
  signalType: CallSignalType;
  callId: string;
  callType: 'voice' | 'video';
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  timestamp: number;
}

// ─── Send a signal via mesh ───────────────────────────────────────────────────

async function sendCallSignal(
  signal: CallSignal,
  targetDeviceId: string,
  currentUser: { id: string }
): Promise<void> {
  const msg: Message = {
    id: uuid.v4() as string,
    chatId: `call_${signal.callId}`,
    senderId: currentUser.id,
    receiverId: targetDeviceId,
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
  await meshNetworkService.sendMessage(msg, targetDeviceId);
}

// ─── Animated ring waves ──────────────────────────────────────────────────────

function RingWaves({ active }: { active: boolean }) {
  const wave1 = useRef(new Animated.Value(0)).current;
  const wave2 = useRef(new Animated.Value(0)).current;
  const wave3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;

    const animate = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const a1 = animate(wave1, 0);
    const a2 = animate(wave2, 600);
    const a3 = animate(wave3, 1200);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [active, wave1, wave2, wave3]);

  const waveStyle = (anim: Animated.Value) => ({
    position: 'absolute' as const,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    opacity: anim.interpolate({
      inputRange: [0, 0.3, 1],
      outputRange: [0.8, 0.4, 0],
    }),
    transform: [
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.2],
        }),
      },
    ],
  });

  return (
    <View style={styles.waveContainer}>
      <Animated.View style={waveStyle(wave1)} />
      <Animated.View style={waveStyle(wave2)} />
      <Animated.View style={waveStyle(wave3)} />
    </View>
  );
}

// ─── Control button ───────────────────────────────────────────────────────────

function ControlButton({
  icon,
  label,
  onPress,
  active = false,
  activeColor = COLORS.error,
  size = 'normal',
  danger = false,
  iconLibrary = 'feather',
}: {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
  size?: 'normal' | 'large';
  danger?: boolean;
  iconLibrary?: 'feather' | 'mci' | 'ionicons';
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  const isLarge = size === 'large';
  const btnSize = isLarge ? 72 : 60;
  const iconSize = isLarge ? 28 : 22;

  const bgColor = danger
    ? COLORS.error
    : active
    ? activeColor + '33'
    : 'rgba(255,255,255,0.12)';

  const iconColor = danger ? '#fff' : active ? activeColor : COLORS.text;

  const IconComponent =
    iconLibrary === 'mci'
      ? MaterialCommunityIcons
      : iconLibrary === 'ionicons'
      ? Ionicons
      : Feather;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity style={styles.controlBtn} onPress={handlePress} activeOpacity={0.8}>
        <View
          style={[
            styles.controlIcon,
            {
              width: btnSize,
              height: btnSize,
              borderRadius: btnSize / 2,
              backgroundColor: bgColor,
              borderWidth: danger ? 0 : 1,
              borderColor: active
                ? activeColor + '55'
                : 'rgba(255,255,255,0.1)',
            },
          ]}
        >
          <IconComponent name={icon as any} size={iconSize} color={iconColor} />
        </View>
        <Text
          style={[
            styles.controlLabel,
            danger && { color: COLORS.error },
            active && { color: activeColor },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main call screen ─────────────────────────────────────────────────────────

export default function CallScreen() {
  const { id, type: callTypeParam, targetId } = useLocalSearchParams<{
    id: string;
    type?: string;
    targetId?: string;
  }>();

  const { currentUser } = useAuthStore();
  const { nearbyDevices } = useMeshStore();

  const callType = (callTypeParam as 'voice' | 'video') ?? 'voice';
  const targetDeviceId = targetId ?? id ?? '';

  // ── Derive partner info from mesh ──────────────────────────────────────────
  const partnerDevice = nearbyDevices.find(
    (d) => d.id === targetDeviceId || d.deviceId === targetDeviceId
  );
  const partnerName =
    partnerDevice?.user?.name ?? partnerDevice?.name ?? 'Unknown';
  const partnerAvatar = partnerDevice?.user?.avatar;

  // ── State ──────────────────────────────────────────────────────────────────
  const [callStatus, setCallStatus] = useState<
    'connecting' | 'ringing' | 'connected' | 'ended' | 'rejected' | 'no_route'
  >('connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [meshHops, setMeshHops] = useState(0);
  const [signalStrength, setSignalStrength] = useState(0);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const durationTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const statusOpacity = useRef(new Animated.Value(1)).current;
  const controlsSlide = useRef(new Animated.Value(100)).current;
  const controlsOpacity = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  // ── Entrance animation ─────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(controlsSlide, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(controlsOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [controlsSlide, controlsOpacity]);

  // ── Avatar pulse when ringing ──────────────────────────────────────────────
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    if (callStatus === 'ringing' || callStatus === 'connecting') {
      loop.start();
    } else {
      loop.stop();
      pulseAnim.setValue(1);
    }
    return () => loop.stop();
  }, [callStatus, pulseAnim]);

  // ── Status text blink ──────────────────────────────────────────────────────
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(statusOpacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(statusOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    if (callStatus === 'ringing' || callStatus === 'connecting') {
      blink.start();
    } else {
      blink.stop();
      statusOpacity.setValue(1);
    }
    return () => blink.stop();
  }, [callStatus, statusOpacity]);

  // ── Initialise call ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const init = async () => {
      // Check if target device is reachable via mesh
      const isReachable =
        nearbyDevices.some(
          (d) =>
            (d.id === targetDeviceId || d.deviceId === targetDeviceId) &&
            d.isConnected
        );

      if (!isReachable) {
        setCallStatus('no_route');
        return;
      }

      const route = useMeshStore
        .getState()
        .meshRoutes.find((r) => r.toDevice === targetDeviceId);

      setMeshHops(route?.hopCount ?? 1);
      setSignalStrength(partnerDevice?.rssi ?? -70);

      // Send ring signal via mesh
      await sendCallSignal(
        {
          signalType: 'call_ring',
          callId: id,
          callType,
          callerId: currentUser.id,
          callerName: currentUser.name,
          callerAvatar: currentUser.avatar,
          timestamp: Date.now(),
        },
        targetDeviceId,
        currentUser
      ).catch((e) => console.error('[Call] Ring signal failed:', e));

      setCallStatus('ringing');

      // Configure audio for call
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: !isSpeaker,
      });

      // Simulate accept after 3 seconds for now
      // In production this would be driven by receiving a call_accept signal
      setTimeout(() => {
        setCallStatus('connected');
        startDurationTimer();
        startHeartbeat();
      }, 3000);
    };

    init();

    return () => {
      cleanupCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Duration timer ─────────────────────────────────────────────────────────
  const startDurationTimer = () => {
    durationTimer.current = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
  };

  // ── Heartbeat — keeps the call alive over mesh ─────────────────────────────
  const startHeartbeat = useCallback(() => {
    if (!currentUser) return;
    heartbeatTimer.current = setInterval(async () => {
      await sendCallSignal(
        {
          signalType: 'call_heartbeat',
          callId: id,
          callType,
          callerId: currentUser.id,
          callerName: currentUser.name,
          timestamp: Date.now(),
        },
        targetDeviceId,
        currentUser
      ).catch(() => {});
    }, 8000);
  }, [currentUser, id, callType, targetDeviceId]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanupCall = useCallback(async () => {
    if (durationTimer.current) clearInterval(durationTimer.current);
    if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
    if (soundRef.current) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  // ── End call ───────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    if (!currentUser) return;
    setCallStatus('ended');

    await sendCallSignal(
      {
        signalType: 'call_end',
        callId: id,
        callType,
        callerId: currentUser.id,
        callerName: currentUser.name,
        timestamp: Date.now(),
      },
      targetDeviceId,
      currentUser
    ).catch(() => {});

    await cleanupCall();

    // Brief pause to show "Call Ended" before navigating back
    setTimeout(() => router.back(), 1200);
  }, [currentUser, id, callType, targetDeviceId, cleanupCall]);

  // ── Mute ───────────────────────────────────────────────────────────────────
  const handleMute = useCallback(async () => {
    const next = !isMuted;
    setIsMuted(next);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: !next,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: !isSpeaker,
    }).catch(() => {});
  }, [isMuted, isSpeaker]);

  // ── Speaker ────────────────────────────────────────────────────────────────
  const handleSpeaker = useCallback(async () => {
    const next = !isSpeaker;
    setIsSpeaker(next);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: !isMuted,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: !next,
    }).catch(() => {});
  }, [isSpeaker, isMuted]);

  // ── Hold ───────────────────────────────────────────────────────────────────
  const handleHold = useCallback(() => {
    setIsOnHold((h) => !h);
  }, []);

  // ── Message ────────────────────────────────────────────────────────────────
  const handleMessage = useCallback(() => {
    router.back();
    router.push(`/chat/${targetDeviceId}`);
  }, [targetDeviceId]);

  // ── Format duration ────────────────────────────────────────────────────────
  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── Signal bar helper ──────────────────────────────────────────────────────
  const signalBars = () => {
    const strength =
      signalStrength > -60 ? 4
      : signalStrength > -75 ? 3
      : signalStrength > -85 ? 2
      : 1;
    return Array.from({ length: 4 }, (_, i) => (
      <View
        key={i}
        style={[
          styles.signalBar,
          { height: 6 + i * 4 },
          i < strength ? styles.signalBarActive : styles.signalBarInactive,
        ]}
      />
    ));
  };

  // ── Status label ───────────────────────────────────────────────────────────
  const statusLabel = () => {
    switch (callStatus) {
      case 'connecting': return 'Connecting via mesh...';
      case 'ringing': return 'Ringing...';
      case 'connected': return formatDuration(callDuration);
      case 'ended': return 'Call Ended';
      case 'rejected': return 'Call Declined';
      case 'no_route': return 'User out of range';
    }
  };

  // ── Background gradient colours per call type ──────────────────────────────
  const bgColors =
    callType === 'video'
      ? ([COLORS.background, '#1a0a3d', COLORS.background] as const)
      : ([COLORS.background, COLORS.primary + '33', COLORS.background] as const);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Background */}
      <LinearGradient colors={bgColors} style={StyleSheet.absoluteFill} />

      {/* Subtle grid overlay */}
      <View style={styles.gridOverlay} pointerEvents="none" />

      {/* Glow blobs */}
      <View style={[styles.glowBlob, styles.glowBlob1]} />
      <View style={[styles.glowBlob, styles.glowBlob2]} />

      <SafeAreaView style={styles.safeArea}>

        {/* ── Top bar ─────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.topBarBtn}
            onPress={() => router.back()}
          >
            <Feather name="chevron-down" size={24} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.topBarCenter}>
            <Text style={styles.callTypeLabel}>
              {callType === 'video' ? 'Video Call' : 'Voice Call'}
            </Text>
            <View style={styles.meshInfoRow}>
              <MaterialCommunityIcons
                name="bluetooth"
                size={11}
                color={COLORS.neonBlue}
              />
              <Text style={styles.meshInfoText}>
                Mesh • {meshHops} hop{meshHops !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.signalContainer}>{signalBars()}</View>
        </View>

        {/* ── Call info section ────────────────────────────────────────── */}
        <View style={styles.callInfoSection}>
          {/* Ring waves */}
          <RingWaves active={callStatus === 'ringing' || callStatus === 'connecting'} />

          {/* Avatar */}
          <Animated.View
            style={[
              styles.avatarOuterRing,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.neonPurple]}
              style={styles.avatarGradientRing}
            >
              <View style={styles.avatarInnerRing}>
                <Image
                  source={{
                    uri:
                      partnerAvatar ??
                      `https://api.dicebear.com/7.x/avataaars/png?seed=${targetDeviceId}`,
                  }}
                  style={styles.callAvatar}
                />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Name */}
          <Text style={styles.callerName}>{partnerName}</Text>

          {/* Status */}
          <Animated.Text
            style={[styles.callStatusText, { opacity: statusOpacity }]}
          >
            {statusLabel()}
          </Animated.Text>

          {/* Mesh badge */}
          <View style={styles.meshBadge}>
            <MaterialCommunityIcons
              name="access-point-network"
              size={12}
              color={COLORS.neonTeal}
            />
            <Text style={styles.meshBadgeText}>B-Chat Mesh Call</Text>
            {callStatus === 'connected' && (
              <>
                <View style={styles.meshBadgeDot} />
                <Text style={styles.meshBadgeText}>Encrypted</Text>
              </>
            )}
          </View>

          {/* Hold overlay */}
          {isOnHold && (
            <View style={styles.holdBadge}>
              <Feather name="pause-circle" size={14} color={COLORS.warning} />
              <Text style={styles.holdText}>On Hold</Text>
            </View>
          )}
        </View>

        {/* ── Controls ─────────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.controlsSection,
            {
              opacity: controlsOpacity,
              transform: [{ translateY: controlsSlide }],
            },
          ]}
        >
          {/* No route state */}
          {callStatus === 'no_route' && (
            <View style={styles.noRouteCard}>
              <MaterialCommunityIcons
                name="bluetooth-off"
                size={32}
                color={COLORS.textMuted}
              />
              <Text style={styles.noRouteTitle}>User Out of Range</Text>
              <Text style={styles.noRouteText}>
                No Bluetooth mesh route found to this user. Move closer and try again.
              </Text>
              <TouchableOpacity
                style={styles.noRouteBtn}
                onPress={() => router.back()}
              >
                <Text style={styles.noRouteBtnText}>Go Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {callStatus !== 'no_route' && (
            <>
              {/* Primary row */}
              <View style={styles.primaryControls}>
                <ControlButton
                  icon={isMuted ? 'mic-off' : 'mic'}
                  label={isMuted ? 'Unmute' : 'Mute'}
                  onPress={handleMute}
                  active={isMuted}
                  activeColor={COLORS.error}
                />

                <ControlButton
                  icon={isSpeaker ? 'volume-2' : 'volume-1'}
                  label={isSpeaker ? 'Earpiece' : 'Speaker'}
                  onPress={handleSpeaker}
                  active={isSpeaker}
                  activeColor={COLORS.neonBlue}
                />

                <ControlButton
                  icon={isOnHold ? 'play' : 'pause'}
                  label={isOnHold ? 'Resume' : 'Hold'}
                  onPress={handleHold}
                  active={isOnHold}
                  activeColor={COLORS.warning}
                />
              </View>

              {/* Secondary row */}
              <View style={styles.secondaryControls}>
                <ControlButton
                  icon="message-outline"
                  label="Message"
                  onPress={handleMessage}
                  iconLibrary="mci"
                />

                <ControlButton
                  icon="share-outline"
                  label="Share Screen"
                  onPress={() =>
                    Alert.alert(
                      'Screen Share',
                      'Screen sharing over Bluetooth mesh is coming soon.'
                    )
                  }
                  iconLibrary="mci"
                />

                <ControlButton
                  icon="account-plus-outline"
                  label="Add Person"
                  onPress={() =>
                    Alert.alert(
                      'Group Call',
                      'Adding participants to a mesh call is coming soon.'
                    )
                  }
                  iconLibrary="mci"
                />
              </View>

              {/* End call */}
              <View style={styles.endCallRow}>
                <ControlButton
                  icon="phone-off"
                  label="End Call"
                  onPress={handleEnd}
                  danger
                  size="large"
                />
              </View>
            </>
          )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },

  // Background decoration
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03,
    backgroundColor: 'transparent',
  },
  glowBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  glowBlob1: {
    width: 300,
    height: 300,
    backgroundColor: COLORS.primary,
    opacity: 0.08,
    top: -80,
    left: -60,
  },
  glowBlob2: {
    width: 250,
    height: 250,
    backgroundColor: COLORS.neonBlue,
    opacity: 0.06,
    bottom: 100,
    right: -60,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  topBarBtn: { padding: SPACING.sm },
  topBarCenter: { flex: 1, alignItems: 'center' },
  callTypeLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  meshInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  meshInfoText: { fontSize: 11, color: COLORS.textMuted },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    padding: SPACING.sm,
  },
  signalBar: { width: 4, borderRadius: 2 },
  signalBarActive: { backgroundColor: COLORS.neonTeal },
  signalBarInactive: { backgroundColor: 'rgba(255,255,255,0.15)' },

  // Call info
  callInfoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  waveContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOuterRing: {
    width: 136,
    height: 136,
    borderRadius: 68,
    padding: 3,
  },
  avatarGradientRing: {
    width: '100%',
    height: '100%',
    borderRadius: 68,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInnerRing: {
    width: '100%',
    height: '100%',
    borderRadius: 62,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
  },
  callAvatar: { width: '100%', height: '100%' },
  callerName: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  callStatusText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  meshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(50,215,75,0.12)',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(50,215,75,0.25)',
  },
  meshBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.neonTeal,
  },
  meshBadgeText: { fontSize: 11, color: COLORS.neonTeal, fontWeight: '600' },
  holdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255,159,10,0.15)',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.3)',
  },
  holdText: { fontSize: 12, color: COLORS.warning, fontWeight: '700' },

  // Controls
  controlsSection: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: Platform.OS === 'android' ? SPACING.xl : SPACING.lg,
    gap: SPACING.lg,
  },
  primaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  endCallRow: {
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  controlBtn: {
    alignItems: 'center',
    gap: SPACING.sm,
    minWidth: 72,
  },
  controlIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },

  // No route
  noRouteCard: {
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.xl,
  },
  noRouteTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  noRouteText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  noRouteBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  noRouteBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
