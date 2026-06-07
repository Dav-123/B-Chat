import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Animated,
  Modal,
  Keyboard,
  Clipboard,
  ToastAndroid,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { Message, MessageStatus, Chat } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { useMeshStore } from '@/store/meshStore';
import { callService } from '@/services/CallService';
import { meshNetworkService } from '@/mesh/MeshNetworkService';
import { DatabaseService } from '@/database/DatabaseService';
import uuid from 'react-native-uuid';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showToast(msg: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  }
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// ─── Animated waveform ────────────────────────────────────────────────────────

function VoiceWaveform({
  isPlaying,
  isSent,
  barCount = 20,
}: {
  isPlaying: boolean;
  isSent: boolean;
  barCount?: number;
}) {
  const anims = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.4))
  ).current;

  useEffect(() => {
    if (!isPlaying) {
      anims.forEach((a) => a.setValue(0.4));
      return;
    }
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 40),
          Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.timing(a, { toValue: 0.3, duration: 220, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [isPlaying]);

  const maxH = 24;
  const minH = 6;
  const heights = Array.from(
    { length: barCount },
    (_, i) => minH + Math.round(Math.sin((i / barCount) * Math.PI) * (maxH - minH))
  );

  return (
    <View style={waveStyles.row}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            waveStyles.bar,
            {
              height: heights[i],
              backgroundColor: isSent
                ? 'rgba(255,255,255,0.75)'
                : COLORS.primaryLight,
              transform: [{ scaleY: anim }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    height: 28,
  },
  bar: { width: 3, borderRadius: 2 },
});

// ─── Voice note player bubble ─────────────────────────────────────────────────

function VoiceNotePlayer({
  message,
  isSent,
}: {
  message: Message;
  isSent: boolean;
}) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(message.duration ?? 0);
  const [volumeOff, setVolumeOff] = useState(false);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sound?.unloadAsync().catch(() => {});
    };
  }, [sound]);

  const togglePlay = async () => {
    if (!message.fileUrl) return;

    try {
      if (sound && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
        startTracking(sound);
        return;
      }

      setLoading(true);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound: newSound, status } = await Audio.Sound.createAsync(
        { uri: message.fileUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 }
      );

      // Check if volume/silent mode is an issue (iOS only)
      // We set playsInSilentModeIOS: true so this mainly catches errors
      if (!status.isLoaded) {
        setVolumeOff(true);
        setLoading(false);
        return;
      }

      if (status.isLoaded && status.durationMillis) {
        setDuration(Math.round(status.durationMillis / 1000));
      }

      newSound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded) return;
        if (s.didJustFinish) {
          setIsPlaying(false);
          setPosition(0);
          if (intervalRef.current) clearInterval(intervalRef.current);
          newSound.setPositionAsync(0).catch(() => {});
        }
      });

      setSound(newSound);
      setIsPlaying(true);
      setLoading(false);
      startTracking(newSound);
    } catch (e: any) {
      setLoading(false);
      // Android volume off or audio focus lost
      if (
        e?.message?.includes('volume') ||
        e?.message?.includes('focus') ||
        e?.message?.includes('silent')
      ) {
        setVolumeOff(true);
      } else {
        console.error('[VoiceNote] Playback error:', e);
      }
    }
  };

  const startTracking = (snd: Audio.Sound) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      try {
        const status = await snd.getStatusAsync();
        if (status.isLoaded) {
          setPosition(Math.round((status.positionMillis ?? 0) / 1000));
        }
      } catch (_) {}
    }, 200);
  };

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={vnStyles.container}>
      {loading ? (
        <ActivityIndicator size="small" color={isSent ? '#fff' : COLORS.primary} />
      ) : (
        <TouchableOpacity onPress={togglePlay} style={vnStyles.playBtn}>
          <Feather
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            color={isSent ? '#fff' : COLORS.primary}
          />
        </TouchableOpacity>
      )}

      <View style={vnStyles.waveWrap}>
        <VoiceWaveform isPlaying={isPlaying} isSent={isSent} barCount={20} />
        <View style={vnStyles.progressTrack}>
          <View style={[vnStyles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
      </View>

      <Text style={[vnStyles.time, { color: isSent ? 'rgba(255,255,255,0.7)' : COLORS.textSecondary }]}>
        {formatDuration(isPlaying ? position : duration)}
      </Text>

      {volumeOff && (
        <View style={vnStyles.volumeWarn}>
          <MaterialCommunityIcons name="volume-off" size={12} color={COLORS.warning} />
          <Text style={vnStyles.volumeWarnText}>Turn on volume</Text>
        </View>
      )}
    </View>
  );
}


const vnStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minWidth: 180,
    paddingVertical: 4,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveWrap: { flex: 1, gap: 3 },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 1,
  },
  time: { fontSize: 11, minWidth: 32, textAlign: 'right' },
  volumeWarn: {
    position: 'absolute',
    bottom: -16,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  volumeWarnText: { fontSize: 10, color: COLORS.warning },
});

// ─── Voice note preview before sending ───────────────────────────────────────

function VoiceNotePreview({
  uri,
  duration,
  onSend,
  onDiscard,
  bottomInset = 0,
}: {
  uri: string;
  duration: number;
  onSend: () => void;
  onDiscard: () => void;
  bottomInset?: number;
}) {
  const previewMsg: Message = {
    id: 'preview',
    chatId: '',
    senderId: '',
    receiverId: '',
    content: '',
    type: 'voiceNote',
    timestamp: Date.now(),
    status: 'sending',
    encrypted: false,
    hopCount: 0,
    routePath: [],
    reactions: [],
    readBy: [],
    fileUrl: uri,
    duration,
  };

  return (
   <View style={[pvStyles.container, { paddingBottom: SPACING.md + bottomInset }]}>
      <TouchableOpacity onPress={onDiscard} style={pvStyles.discard}>
        <Feather name="trash-2" size={20} color={COLORS.error} />
      </TouchableOpacity>
      <View style={pvStyles.player}>
        <VoiceNotePlayer message={previewMsg} isSent={false} />
      </View>
      <TouchableOpacity onPress={onSend} style={pvStyles.send}>
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={pvStyles.sendGrad}
        >
          <Feather name="send" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const pvStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  discard: { padding: SPACING.xs },
  player: { flex: 1 },
  send: { borderRadius: 20, overflow: 'hidden' },
  sendGrad: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── Read receipts ────────────────────────────────────────────────────────────

function ReadReceipts({
  message,
  currentUserId,
}: {
  message: Message;
  currentUserId: string;
}) {
  if (message.senderId !== currentUserId) return null;
  const receipts = message.readBy ?? [];
  if (receipts.length === 0) return null;
  return (
    <View style={styles.receiptsRow}>
      {receipts.slice(0, 3).map((r: any) => (
        <Image
          key={r.userId}
          source={{
            uri:
              r.avatar ||
              `https://api.dicebear.com/7.x/avataaars/png?seed=${r.userId}`,
          }}
          style={styles.receiptAvatar}
        />
      ))}
    </View>
  );
}

// ─── Status indicator ─────────────────────────────────────────────────────────

function MessageStatusIndicator({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sending':
      return <Feather name="clock" size={12} color="rgba(255,255,255,0.4)" />;
    case 'sent':
      return (
        <MaterialCommunityIcons name="check" size={14} color="rgba(255,255,255,0.5)" />
      );
    case 'delivered':
      return (
        <MaterialCommunityIcons name="check-all" size={14} color="rgba(255,255,255,0.5)" />
      );
    case 'read':
      return (
        <MaterialCommunityIcons name="check-all" size={14} color={COLORS.neonBlue} />
      );
    case 'failed':
      return <Feather name="alert-circle" size={12} color={COLORS.error} />;
    case 'pending':
    case 'queued':
      return (
        <MaterialCommunityIcons name="timer-sand" size={12} color={COLORS.warning} />
      );
    default:
      return null;
  }
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  message,
  currentUserId,
  onLongPress,
  replyTarget,
}: {
  message: Message;
  currentUserId: string;
  onLongPress: (msg: Message) => void;
  replyTarget?: Message;
}) {
  const isSent = message.senderId === currentUserId;
  const [imgError, setImgError] = useState(false);

  const renderContent = () => {
    if (message.isDeleted) {
      return <Text style={styles.deletedText}>This message was deleted</Text>;
    }

    switch (message.type) {
      case 'image':
        return (
          <View>
            {!imgError && message.fileUrl ? (
              <Image
                source={{ uri: message.fileUrl }}
                style={styles.messageImage}
                onError={() => setImgError(true)}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.messageImage, styles.imageFallback]}>
                <MaterialCommunityIcons
                  name="image-broken-variant"
                  size={32}
                  color={COLORS.textMuted}
                />
              </View>
            )}
            {message.content ? (
              <Text style={styles.imageCaption}>{message.content}</Text>
            ) : null}
          </View>
        );

      case 'video':
        return (
          <View style={styles.videoContainer}>
            {message.thumbnail && !imgError ? (
              <Image
                source={{ uri: message.thumbnail }}
                style={styles.videoThumb}
                onError={() => setImgError(true)}
              />
            ) : (
              <View style={styles.videoThumbFallback}>
                <MaterialCommunityIcons
                  name="video-outline"
                  size={36}
                  color={COLORS.textMuted}
                />
              </View>
            )}
            <View style={styles.playOverlay}>
              <View style={styles.playCircle}>
                <Feather name="play" size={18} color="#fff" />
              </View>
            </View>
            {message.duration ? (
              <Text style={styles.videoDuration}>
                {formatDuration(message.duration)}
              </Text>
            ) : null}
          </View>
        );

      case 'voiceNote':
        return <VoiceNotePlayer message={message} isSent={isSent} />;

      case 'file':
      case 'document':
        return (
          <View style={styles.fileContainer}>
            <View style={styles.fileIcon}>
              <MaterialCommunityIcons
                name="file-outline"
                size={28}
                color={isSent ? '#fff' : COLORS.primaryLight}
              />
            </View>
            <View style={styles.fileInfo}>
              <Text
                style={[styles.fileName, isSent ? styles.textSent : styles.textReceived]}
                numberOfLines={2}
              >
                {message.fileName ?? 'File'}
              </Text>
              <Text
                style={[
                  styles.fileSize,
                  isSent ? styles.textSentMuted : styles.textReceivedMuted,
                ]}
              >
                {message.fileSize
                  ? message.fileSize > 1024 * 1024
                    ? `${(message.fileSize / (1024 * 1024)).toFixed(1)} MB`
                    : `${(message.fileSize / 1024).toFixed(1)} KB`
                  : ''}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="download"
              size={20}
              color={isSent ? 'rgba(255,255,255,0.6)' : COLORS.textMuted}
            />
          </View>
        );

      default:
        return (
          <Text
            style={[
              styles.messageText,
              isSent ? styles.textSent : styles.textReceived,
            ]}
          >
            {message.content}
          </Text>
        );
    }
  };

  return (
<View style={[
  styles.bubbleWrapper,
  isSent ? styles.bubbleWrapperSent : styles.bubbleWrapperReceived,
]}>
      <TouchableOpacity
        onLongPress={() => onLongPress(message)}
        style={[
          styles.bubble,
          isSent ? styles.bubbleSent : styles.bubbleReceived,
          message.isDeleted && styles.bubbleDeleted,
        ]}
        activeOpacity={0.85}
      >
        {/* Reply preview */}
        {message.replyTo && replyTarget && (
          <View style={styles.replyPreview}>
            <View style={styles.replyBar} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyName} numberOfLines={1}>
                {replyTarget.senderId === currentUserId ? 'You' : 'Them'}
              </Text>
              <Text style={styles.replyText} numberOfLines={2}>
{replyTarget.type === 'voiceNote' ? (
                <View style={styles.replyMediaRow}>
                  <MaterialCommunityIcons name="microphone" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.replyText}>Voice note</Text>
                </View>
              ) : replyTarget.type === 'image' ? (
                <View style={styles.replyMediaRow}>
                  <MaterialCommunityIcons name="image-outline" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.replyText}>Photo</Text>
                </View>
              ) : replyTarget.type === 'video' ? (
                <View style={styles.replyMediaRow}>
                  <MaterialCommunityIcons name="video-outline" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.replyText}>Video</Text>
                </View>
              ) : (
                <Text style={styles.replyText} numberOfLines={2}>{replyTarget.content}</Text>
              )}
            </Text>
            </View>
          </View>
        )}

        {renderContent()}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <View style={styles.reactionsRow}>
            {Object.entries(
              message.reactions.reduce<Record<string, number>>((acc, r: any) => {
                acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                return acc;
              }, {})
            ).map(([emoji, count]) => (
              <View key={emoji} style={styles.reaction}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {Number(count) > 1 && (
                  <Text style={styles.reactionCount}>{count}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={styles.messageFooter}>
          <Text
            style={[
              styles.messageTime,
              isSent ? styles.timeSent : styles.timeReceived,
            ]}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          {isSent && <MessageStatusIndicator status={message.status} />}
        </View>
      </TouchableOpacity>

      <ReadReceipts message={message} currentUserId={currentUserId} />
    </View>
  );
}

// ─── Chat options menu ────────────────────────────────────────────────────────

function ChatOptionsMenu({
  visible,
  onClose,
  onArchive,
  onBlock,
  onDelete,
  onChangeTheme,
}: {
  visible: boolean;
  onClose: () => void;
  onArchive: () => void;
  onBlock: () => void;
  onDelete: () => void;
  onChangeTheme: () => void;
}) {
  const options = [
    { icon: 'archive', label: 'Archive Chat', action: onArchive, color: COLORS.text },
    { icon: 'slash', label: 'Block User', action: onBlock, color: COLORS.warning },
    { icon: 'palette', label: 'Change Theme', action: onChangeTheme, color: COLORS.neonPurple },
    { icon: 'trash-2', label: 'Delete Chat', action: onDelete, color: COLORS.error },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.optionsMenu}>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={styles.optionItem}
              onPress={() => {
                onClose();
                opt.action();
              }}
            >
              <Feather name={opt.icon as any} size={17} color={opt.color} />
              <Text style={[styles.optionLabel, { color: opt.color }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Forward modal ─────────────────────────────────────────────────────────────

function ForwardModal({
  visible,
  onClose,
  nearbyDevices,
  onForward,
}: {
  visible: boolean;
  onClose: () => void;
  nearbyDevices: any[];
  onForward: (deviceId: string) => void;
}) {
  const connected = nearbyDevices.filter((d) => d.isConnected);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.forwardSheet}>
          <Text style={styles.forwardTitle}>Forward to</Text>
          {connected.length === 0 ? (
            <Text style={styles.forwardEmpty}>No connected chats available for forwarding</Text>
          ) : (
            connected.map((device) => (
              <TouchableOpacity
                key={device.id}
                style={styles.forwardDevice}
                onPress={() => {
                  onClose();
                  onForward(device.id ?? device.deviceId);
                }}
              >
                <Image
                  source={{
                    uri:
                      device.user?.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/png?seed=${device.id}`,
                  }}
                  style={styles.forwardAvatar}
                />
                <Text style={styles.forwardName}>
                  {device.user?.name ?? device.name ?? 'Unknown'}
                </Text>
                <Feather name="send" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main chat screen ──────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser } = useAuthStore();
  const { addOrUpdateChat, updateLastMessage, markAsRead } = useChatStore();
  const { nearbyDevices, isMeshActive } = useMeshStore();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [pendingVoice, setPendingVoice] = useState<{ uri: string; duration: number } | null>(null);

  // UI state
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isAutoRelaying, setIsAutoRelaying] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerAvatar, setPartnerAvatar] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [chatWallpaper, setChatWallpaper] = useState<string | undefined>(undefined);
  const [chatTheme, setChatTheme] = useState<any>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordAnim = useRef(new Animated.Value(1)).current;

  const chatPartnerId = id ?? '';

  // Build a message map for reply lookups
  const messageMap = useRef<Record<string, Message>>({});
  useEffect(() => {
    messages.forEach((m) => { messageMap.current[m.id] = m; });
  }, [messages]);

  // ── Keyboard ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ── Partner info ────────────────────────────────────────────────────────────

  useEffect(() => {
    const device = nearbyDevices.find(
      (d) => d.id === chatPartnerId || d.deviceId === chatPartnerId
    );
    setPartnerName(device?.user?.name ?? device?.name ?? chatPartnerId.slice(0, 10));
    setPartnerAvatar(
      device?.user?.avatar ||
      `https://api.dicebear.com/7.x/avataaars/png?seed=${chatPartnerId}`
    );
  }, [nearbyDevices, chatPartnerId]);

  // ── Load messages (normal + queued) ────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const [stored, queued] = await Promise.all([
          DatabaseService.getMessages(id, { limit: 80 }),
          DatabaseService.getPendingMessages(),
        ]);
        const pendingForThisChat = queued.filter(
          (m) => m.chatId === id && !stored.find((s) => s.id === m.id)
        );
        const all = [...stored, ...pendingForThisChat].sort(
          (a, b) => a.timestamp - b.timestamp
        );
        setMessages(all);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      } catch (e) {
        console.error('[Chat] Load error:', e);
      }
    };
    load();
    markAsRead(id);
  }, [id, markAsRead]);

  // ── Load chat wallpaper ─────────────────────────────────────────────────────
  useFocusEffect(
  useCallback(() => {
    if (!id) return;
    DatabaseService.getChats({ includeArchived: true }).then((chats) => {
      const chat = chats.find((c) => c.id === id);
      if (chat?.wallpaper) setChatWallpaper(chat.wallpaper);
      if (chat?.theme) setChatTheme(chat.theme);
      setIsBlocked(chat?.isBlocked ?? false);
    }).catch(() => {});
  }, [id])
);


  useEffect(() => {
    if (!id) return;
    DatabaseService.getChats({ includeArchived: true }).then((chats) => {
      const chat = chats.find((c) => c.id === id);
      if (chat?.wallpaper) setChatWallpaper(chat.wallpaper);
    }).catch(() => {});
  }, [id]);

  // ── Ensure chat record ──────────────────────────────────────────────────────

  useEffect(() => {
  if (!currentUser || !id) return;
  const ensure = async () => {
    const existing = await DatabaseService.getChats({ includeArchived: true });
    const alreadyExists = existing.find((c) => c.id === id);
    if (!alreadyExists) {
      const chat: Chat = {
        id,
        participants: [currentUser.id, chatPartnerId],
        unreadCount: 0,
        isPinned: false,
        isArchived: false,
        isMuted: false,
        isBlocked: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await DatabaseService.saveChat(chat);
      addOrUpdateChat(chat);
    }
  };
  ensure().catch(() => {});
}, [id, currentUser?.id]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  // ── Send ────────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (
      content: string,
      type: Message['type'] = 'text',
      extras: Partial<Message> = {}
    ) => {
      if (!currentUser) return;

      const msg: Message = {
        id: uuid.v4() as string,
        chatId: id,
        senderId: currentUser.id,
        receiverId: chatPartnerId,
        content,
        type,
        timestamp: Date.now(),
        status: 'sending',
        encrypted: true,
        hopCount: 0,
        routePath: [],
        reactions: [],
        readBy: [],
        ...extras,
      };

      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        await DatabaseService.saveMessage(msg);
        await DatabaseService.updateChatLastMessage(id, msg);
      } catch (e) {
        console.error('[Chat] DB save error:', e);
      }

      updateLastMessage(id, msg);

      let sent = false;
      if (isMeshActive) {
        try {
          sent = await meshNetworkService.sendMessage(msg, chatPartnerId);
        } catch (e) {
          console.error('[Chat] Mesh send error:', e);
        }
      }

      const nextStatus: MessageStatus = sent ? 'sent' : 'queued';
      const updated = { ...msg, status: nextStatus };
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? updated : m)));

      try {
        await DatabaseService.updateMessageStatus(msg.id, nextStatus);
      } catch (_) {}

      if (!sent) {
        await DatabaseService.enqueuePendingMessage(msg, chatPartnerId, 'high');
      }

      if (sent) {
        setTimeout(async () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, status: 'delivered' } : m))
          );
          await DatabaseService.updateMessageStatus(msg.id, 'delivered', {
            deliveredAt: Date.now(),
          });
        }, 2000);
      }
    },
    [currentUser, id, chatPartnerId, isMeshActive, updateLastMessage]
  );

  const handleSend = () => {
    if (!inputText.trim()) return;
    sendMessage(inputText.trim(), 'text', replyTo ? { replyTo: replyTo.id } : {});
    setInputText('');
    setIsTyping(false);
    setReplyTo(null);
  };

  // ── Recording ───────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Microphone access needed to record voice notes.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
          Animated.timing(recordAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
      recordingTimer.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch (e) {
      console.error('[Chat] Record start:', e);
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
  try {
    if (!recordingRef.current) return;
    // Get URI BEFORE stopping
    const uri = recordingRef.current.getURI();
    const dur = recordingDuration;
    await recordingRef.current.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    recordingRef.current = null;
    setIsRecording(false);
    recordAnim.stopAnimation();
    recordAnim.setValue(1);
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    if (uri && dur >= 1) {
      setPendingVoice({ uri, duration: dur });
    }
  } catch (e) {
    console.error('[Chat] Record stop:', e);
    setIsRecording(false);
    recordAnim.setValue(1);
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
  }
};

  const cancelRecording = async () => {
    if (recordingRef.current) {
      await recordingRef.current.stopAndUnloadAsync().catch(() => {});
      recordingRef.current = null;
    }
    setIsRecording(false);
    setPendingVoice(null);
    recordAnim.setValue(1);
    if (recordingTimer.current) { clearInterval(recordingTimer.current); recordingTimer.current = null; }
  };

  const sendPendingVoice = async () => {
    if (!pendingVoice) return;
    await sendMessage('Voice note', 'voiceNote', {
      fileUrl: pendingVoice.uri,
      duration: pendingVoice.duration,
    });
    setPendingVoice(null);
  };

  // ── Media pickers ───────────────────────────────────────────────────────────

  const pickImage = async () => {
    setShowAttachmentModal(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as any,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        await sendMessage('', 'image', { fileUrl: a.uri, fileSize: a.fileSize, fileName: a.fileName ?? 'photo.jpg' });
      }
    } catch (e) { console.error('[Chat] Image picker:', e); }
  };

  const pickVideo = async () => {
    setShowAttachmentModal(false);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos' as any,
        quality: 0.7,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        await sendMessage('', 'video', {
          fileUrl: a.uri,
          fileSize: a.fileSize,
          fileName: a.fileName ?? 'video.mp4',
          duration: a.duration ? Math.floor(a.duration) : undefined,
        });
      }
    } catch (e) { console.error('[Chat] Video picker:', e); }
  };

  const pickDocument = async () => {
    setShowAttachmentModal(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const f = result.assets[0];
        await sendMessage('', 'file', { fileUrl: f.uri, fileName: f.name, fileSize: f.size });
      }
    } catch (e) { console.error('[Chat] Doc picker:', e); }
  };

  const openCamera = async () => {
    setShowAttachmentModal(false);
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images' as any, quality: 0.8 });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        await sendMessage('', 'image', { fileUrl: a.uri, fileSize: a.fileSize, fileName: a.fileName ?? 'camera.jpg' });
      }
    } catch (e) { console.error('[Chat] Camera:', e); }
  };

  // ── Message actions ─────────────────────────────────────────────────────────

  const handleLongPress = (msg: Message) => {
    setSelectedMessage(msg);
    setShowActionModal(true);
  };

  const handleCopy = () => {
    if (!selectedMessage || selectedMessage.type !== 'text') return;
    Clipboard.setString(selectedMessage.content);
    showToast('Message copied successfully');
    setShowActionModal(false);
    setSelectedMessage(null);
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyTo(selectedMessage);
    setShowActionModal(false);
    setSelectedMessage(null);
    inputRef.current?.focus();
  };

  const handleForwardOpen = () => {
    setShowActionModal(false);
    setShowForwardModal(true);
  };

  const handleForward = async (targetDeviceId: string) => {
    if (!selectedMessage || !currentUser) return;
    await sendMessage(selectedMessage.content, selectedMessage.type, {
      fileUrl: selectedMessage.fileUrl,
      fileName: selectedMessage.fileName,
      fileSize: selectedMessage.fileSize,
      duration: selectedMessage.duration,
      isForwarded: true,
      receiverId: targetDeviceId,
    });
    setSelectedMessage(null);
  };

  const handleDelete = async () => {
    if (!selectedMessage) return;
    const softDeleted = { ...selectedMessage, isDeleted: true, content: '' };
    setMessages((prev) => prev.map((m) => (m.id === selectedMessage.id ? softDeleted : m)));
    await DatabaseService.softDeleteMessage(selectedMessage.id).catch(() => {});
    setShowActionModal(false);
    setSelectedMessage(null);
  };

  // ── Emoji reactions (one per user, replaces previous) ──────────────────────

  const addReaction = async (emoji: string) => {
    if (!selectedMessage || !currentUser) return;
    const reactions = (selectedMessage.reactions ?? []).filter(
      (r: any) => r.userId !== currentUser.id
    );
    reactions.push({ emoji, userId: currentUser.id, timestamp: Date.now() });
    const updated = { ...selectedMessage, reactions };
    setMessages((prev) => prev.map((m) => (m.id === selectedMessage.id ? updated : m)));
    await DatabaseService.saveMessage(updated).catch(() => {});
    setShowActionModal(false);
    setSelectedMessage(null);
  };

  // ── Chat options actions ─────────────────────────────────────────────────────

  const handleArchive = async () => {
  try {
    const chats = await DatabaseService.getChats({ includeArchived: true });
    const existing = chats.find((c) => c.id === id);
    if (existing) {
      await DatabaseService.saveChat({
        ...existing,
        isArchived: true,
        updatedAt: Date.now(),
      });
    }
    addOrUpdateChat({ ...(existing ?? { id, participants: [currentUser?.id ?? '', chatPartnerId], unreadCount: 0, isPinned: false, isMuted: false, isBlocked: false, createdAt: Date.now() }), isArchived: true, updatedAt: Date.now() });
    showToast('Chat archived');
    router.back();
  } catch (e) {
    console.error('[Chat] Archive failed:', e);
    Alert.alert('Error', 'Could not archive chat.');
  }
};

  const handleBlock = async () => {
  Alert.alert('Block User', 'Block this user? They will not be able to message you.', [
    {
      text: 'Block',
      style: 'destructive',
      onPress: async () => {
        try {
          await DatabaseService.blockUser({
            userId: currentUser?.id ?? '',
            blockedUserId: chatPartnerId,
            blockedAt: Date.now(),
          });
          // Also update the chat record to mark as blocked
          const chats = await DatabaseService.getChats({ includeArchived: true });
          const chat = chats.find((c) => c.id === id);
          if (chat) {
            await DatabaseService.saveChat({
              ...chat,
              isBlocked: true,
              updatedAt: Date.now(),
            });
          }
          showToast('User blocked');
          router.back();
        } catch (e) {
          console.error('[Chat] Block failed:', e);
          Alert.alert('Error', 'Could not block user.');
        }
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
};
  const handleUnblock = async () => {
  try {
    await DatabaseService.unblockUser(currentUser?.id ?? '', chatPartnerId);
    const chats = await DatabaseService.getChats({ includeArchived: true });
    const chat = chats.find((c) => c.id === id);
    if (chat) {
      await DatabaseService.saveChat({ ...chat, isBlocked: false, updatedAt: Date.now() });
    }
    setIsBlocked(false);
    showToast('User unblocked');
  } catch (e) {
    Alert.alert('Error', 'Could not unblock user.');
  }
};

  const handleDeleteChat = async () => {
    Alert.alert('Delete Chat', 'This will permanently delete all messages. Continue?', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Soft-delete all messages in this chat via DB
          const msgs = await DatabaseService.getMessages(id, { limit: 1000 }).catch(() => []);
          for (const m of msgs) {
            await DatabaseService.softDeleteMessage(m.id).catch(() => {});
          }
          setMessages([]);
          showToast('Chat deleted');
          router.back();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  
  const handleChangeTheme = () => {
     router.push(`/theme-picker?chatId=${id}`);
  };

  // ── Auto relay ──────────────────────────────────────────────────────────────

  const handleAutoRelay = async () => {
    setShowAttachmentModal(false);

  if (!isMeshActive) {
    Alert.alert(
      'Bluetooth Required',
      'Auto Relay needs Bluetooth to be active. Please enable Bluetooth and make sure the mesh is running.',
      [{ text: 'OK' }]
    );
    return;
  }

        try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        setIsAutoRelaying(true);
        Alert.alert(
          'Auto Relay Share',
          `"${file.name}" will be sent to all ${nearbyDevices.length} nearby devices.`,
          [
            {
              text: 'Send to All',
              onPress: async () => {
                try {
                  await meshNetworkService.startAutoRelayShare(file.uri, file.name, file.size ?? 0);
                  await sendMessage('', 'file', { fileUrl: file.uri, fileName: file.name, fileSize: file.size });
                  Alert.alert(
  'Relay Complete',
  `"${file.name}" was successfully sent to ${nearbyDevices.length} nearby device${nearbyDevices.length !== 1 ? 's' : ''} via mesh.`
);
                } catch (e: any) {
                  Alert.alert(
  'Relay Failed',
  `Could not relay "${file.name}" — ${e?.message ?? 'No devices in range or mesh inactive'}. Make sure Bluetooth is on and devices are nearby.`
);
                } finally {
                  setIsAutoRelaying(false);
                }
              },
            },
            { text: 'Cancel', style: 'cancel', onPress: () => setIsAutoRelaying(false) },
          ]
        );
      }
    } catch (_) {
      setIsAutoRelaying(false);
    }
  };

  // ── Calls ───────────────────────────────────────────────────────────────────

  const initiateCall = async (type: 'voice' | 'video') => {
    if (!currentUser) return;
    const target = nearbyDevices.find((d) => d.id === chatPartnerId || d.deviceId === chatPartnerId);
    if (!target?.isConnected) {
      Alert.alert('Out of Range', 'User is not reachable via mesh right now.');
      return;
    }
    try {
      const call = await callService.initiateCall(
        currentUser.id,
        chatPartnerId,
        type,
        chatPartnerId,
        async (targetId, signal) => {
          const signalMsg: Message = {
            id: uuid.v4() as string,
            chatId: id,
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
      router.push(`/call/${call.id}`);
    } catch (e) {
      Alert.alert('Error', 'Could not start call.');
    }
  };

  // ── Attachment items ────────────────────────────────────────────────────────

  const attachmentItems = [
    { icon: 'image-outline', label: 'Gallery', action: pickImage, color: COLORS.neonPurple },
    { icon: 'video-outline', label: 'Video', action: pickVideo, color: COLORS.neonBlue },
    { icon: 'camera-outline', label: 'Camera', action: openCamera, color: COLORS.neonTeal },
    { icon: 'file-outline', label: 'Document', action: pickDocument, color: COLORS.primary },
    { icon: 'access-point', label: 'Auto Relay', action: handleAutoRelay, color: COLORS.neonOrange },
    {
      icon: 'store-outline', label: 'Marketplace', color: COLORS.warning,
      action: () => { setShowAttachmentModal(false); router.push('/marketplace'); },
    },
  ];

  const inputBarBottomPadding = keyboardVisible
    ? 0
    : Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);

  const isTextMessage = selectedMessage?.type === 'text';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.container, chatWallpaper ? { backgroundColor: 'transparent' } : null]}
      edges={['top']}
    >
      {chatWallpaper && (
        <Image source={{ uri: chatWallpaper }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => router.push(`/user-profile/${chatPartnerId}`)}
        >
          <Image source={{ uri: partnerAvatar }} style={styles.headerAvatar} />
          <View>
            <Text style={styles.headerName}>{partnerName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {isMeshActive && (
                <MaterialCommunityIcons name="bluetooth" size={10} color={COLORS.neonTeal} />
              )}
              <Text style={styles.headerStatus}>
                {isTyping ? 'typing...' : isMeshActive ? 'Online via mesh' : 'Offline — queued'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => initiateCall('video')}>
            <Feather name="video" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => initiateCall('voice')}>
            <Feather name="phone" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={() => setShowOptionsMenu(true)}>
            <Feather name="more-vertical" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Offline banner */}
      {!isMeshActive && (
        <View style={styles.offlineBanner}>
          <MaterialCommunityIcons name="timer-sand" size={14} color={COLORS.warning} />
          <Text style={styles.offlineBannerText}>Messages send when in range</Text>
        </View>
      )}

      {isAutoRelaying && (
        <View style={styles.relayBanner}>
          <MaterialCommunityIcons name="access-point" size={14} color={COLORS.neonTeal} />
          <Text style={styles.relayBannerText}>Relaying to all nearby devices...</Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              currentUserId={currentUser?.id ?? ''}
              onLongPress={handleLongPress}
              replyTarget={item.replyTo ? messageMap.current[item.replyTo] : undefined}
            />
          )}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListEmptyComponent={() => (
            <View style={styles.emptyChat}>
              <MaterialCommunityIcons name="lock-outline" size={32} color={COLORS.border} />
              <Text style={styles.emptyChatText}>Messages are end-to-end encrypted</Text>
            </View>
          )}
        />

        {/* Recording bar */}
       {isRecording && (
  <View style={[styles.recordingBar, { paddingBottom: SPACING.md + inputBarBottomPadding }]}>
    <TouchableOpacity onPress={cancelRecording}>
      <Feather name="trash-2" size={20} color={COLORS.error} />
    </TouchableOpacity>
    <Animated.View style={[styles.recordingDot, { transform: [{ scale: recordAnim }] }]} />
    <Text style={styles.recordingText}>
      Recording... {formatDuration(recordingDuration)}
    </Text>
    <TouchableOpacity onPress={stopRecording}>
      <View style={styles.stopRecordingBtn}>
        <Feather name="stop-circle" size={32} color={COLORS.primary} />
      </View>
    </TouchableOpacity>
  </View>
)}

        {/* Voice preview before sending */}
        {pendingVoice && !isRecording && (
<VoiceNotePreview
  uri={pendingVoice.uri}
  duration={pendingVoice.duration}
  onSend={sendPendingVoice}
  onDiscard={() => setPendingVoice(null)}
  bottomInset={inputBarBottomPadding}
/>
        )}

        {/* Reply preview bar */}
        {replyTo && !isRecording && !pendingVoice && (
          <View style={styles.replyBar2}>
            <View style={styles.replyBarAccent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarName}>Replying to</Text>
<View style={styles.replyMediaRow}>
                {replyTo.type === 'voiceNote' && (
                  <MaterialCommunityIcons name="microphone" size={12} color={COLORS.textMuted} />
                )}
                {replyTo.type === 'image' && (
                  <MaterialCommunityIcons name="image-outline" size={12} color={COLORS.textMuted} />
                )}
                {replyTo.type === 'video' && (
                  <MaterialCommunityIcons name="video-outline" size={12} color={COLORS.textMuted} />
                )}
                <Text style={styles.replyBarContent} numberOfLines={1}>
                  {replyTo.type === 'voiceNote'
                    ? 'Voice note'
                    : replyTo.type === 'image'
                    ? 'Photo'
                    : replyTo.type === 'video'
                    ? 'Video'
                    : replyTo.content}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)}>
              <Feather name="x" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
{!isRecording && !pendingVoice && !isBlocked && (
  <View style={[styles.inputBar, { paddingBottom: inputBarBottomPadding + SPACING.sm }]}>
    <TouchableOpacity style={styles.inputAction} onPress={() => setShowAttachmentModal(true)}>
      <Feather name="plus-circle" size={24} color={COLORS.textSecondary} />
    </TouchableOpacity>

    <TouchableOpacity style={styles.inputAction} onPress={pickImage}>
      <MaterialCommunityIcons name="image-outline" size={24} color={COLORS.textSecondary} />
    </TouchableOpacity>

    <TextInput
      ref={inputRef}
      style={styles.textInput}
      placeholder="Message..."
      placeholderTextColor={COLORS.textMuted}
      value={inputText}
      onChangeText={(t) => { setInputText(t); setIsTyping(t.length > 0); }}
      multiline
      maxLength={2000}
      textAlignVertical="top"
    />

    {inputText.trim().length > 0 ? (
      <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={styles.sendGradient}
        >
          <Feather name="send" size={18} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        style={styles.micButton}
        onPress={isRecording ? stopRecording : startRecording}
      >
        <Feather
          name="mic"
          size={24}
          color={isRecording ? COLORS.error : COLORS.textSecondary}
        />
      </TouchableOpacity>
    )}
  </View>
)}

{isBlocked && (
  <View style={styles.blockedBar}>
    <MaterialCommunityIcons name="block-helper" size={18} color={COLORS.error} />
    <Text style={styles.blockedText}>You blocked this user</Text>
    <TouchableOpacity style={styles.unblockBtn} onPress={handleUnblock}>
      <Text style={styles.unblockBtnText}>Unblock</Text>
    </TouchableOpacity>
  </View>
)}
</KeyboardAvoidingView>

      {/* Attachment modal */}
      <Modal visible={showAttachmentModal} transparent animationType="slide" onRequestClose={() => setShowAttachmentModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowAttachmentModal(false)} activeOpacity={1}>
          <View style={[styles.attachmentSheet, { paddingBottom: insets.bottom + SPACING.xl }]}>
            <Text style={styles.attachmentTitle}>Share</Text>
            <View style={styles.attachmentGrid}>
              {attachmentItems.map((item) => (
                <TouchableOpacity key={item.label} style={styles.attachmentItem} onPress={item.action}>
                  <View style={[styles.attachmentIcon, { backgroundColor: item.color + '22' }]}>
                    <MaterialCommunityIcons name={item.icon as any} size={26} color={item.color} />
                  </View>
                  <Text style={styles.attachmentLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Action / reaction modal */}
      <Modal visible={showActionModal} transparent animationType="fade" onRequestClose={() => setShowActionModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowActionModal(false)} activeOpacity={1}>
          <View style={[styles.reactionSheet, { paddingBottom: insets.bottom + SPACING.xl }]}>
            <View style={styles.reactionRow}>
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => addReaction(emoji)}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.messageActions}>
              <TouchableOpacity style={styles.messageActionBtn} onPress={handleReply}>
                <Feather name="reply" size={18} color={COLORS.text} />
                <Text style={styles.messageActionLabel}>Reply</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.messageActionBtn} onPress={handleForwardOpen}>
                <Feather name="share-2" size={18} color={COLORS.text} />
                <Text style={styles.messageActionLabel}>Forward</Text>
              </TouchableOpacity>

              {isTextMessage && (
                <TouchableOpacity style={styles.messageActionBtn} onPress={handleCopy}>
                  <Feather name="copy" size={18} color={COLORS.text} />
                  <Text style={styles.messageActionLabel}>Copy</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.messageActionBtn} onPress={handleDelete}>
                <Feather name="trash-2" size={18} color={COLORS.error} />
                <Text style={[styles.messageActionLabel, { color: COLORS.error }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 3-dot options menu */}
      <ChatOptionsMenu
        visible={showOptionsMenu}
        onClose={() => setShowOptionsMenu(false)}
        onArchive={handleArchive}
        onBlock={handleBlock}
        onDelete={handleDeleteChat}
        onChangeTheme={handleChangeTheme}
      />

      {/* Forward modal */}
      <ForwardModal
        visible={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        nearbyDevices={nearbyDevices}
        onForward={handleForward}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  backButton: { padding: SPACING.sm, marginRight: SPACING.xs },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  headerStatus: { fontSize: 12, color: COLORS.neonTeal },
  headerActions: { flexDirection: 'row' },
  headerBtn: { padding: SPACING.sm },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(255,159,10,0.12)',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,159,10,0.2)',
  },
  offlineBannerText: { fontSize: 12, color: COLORS.warning, fontWeight: '600' },
  relayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(50,215,75,0.12)',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(50,215,75,0.2)',
  },
  relayBannerText: { fontSize: 12, color: COLORS.neonTeal, fontWeight: '600' },
  messageList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    paddingBottom: 12,
    flexGrow: 1,
  },
  bubbleWrapper: { marginVertical: 2, maxWidth: '75%' },
  bubbleWrapperSent: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapperReceived: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: 60,
  },
  bubbleSent: {
    backgroundColor: COLORS.messageSent,
    borderWidth: 1,
    borderColor: COLORS.messageSentBorder,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: COLORS.messageReceived,
    borderWidth: 1,
    borderColor: COLORS.messageReceivedBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleDeleted: { opacity: 0.5 },
  replyPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.xs,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    padding: SPACING.xs,
    gap: SPACING.sm,
  },
  replyBar: { width: 3, alignSelf: 'stretch', backgroundColor: COLORS.primary, borderRadius: 2 },
  replyName: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  replyText: { fontSize: 12, color: COLORS.textSecondary },
  deletedText: { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic' },
  messageText: { fontSize: 15, lineHeight: 22 },
  textSent: { color: '#fff' },
  textReceived: { color: COLORS.text },
  textSentMuted: { color: 'rgba(255,255,255,0.6)' },
  textReceivedMuted: { color: COLORS.textSecondary },
  messageImage: { width: SCREEN_WIDTH * 0.55, height: 200, borderRadius: BORDER_RADIUS.md },
fileContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.sm,
  paddingVertical: 4,
  maxWidth: 200,
},
  imageFallback: { backgroundColor: COLORS.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  imageCaption: { fontSize: 13, color: '#fff', marginTop: 4 },
  videoContainer: { position: 'relative', width: SCREEN_WIDTH * 0.55, height: 200 },
  videoThumb: { width: '100%', height: '100%', borderRadius: BORDER_RADIUS.md },
  videoThumbFallback: {
    width: '100%',
    height: '100%',
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedBar: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACING.md,
  backgroundColor: COLORS.surfaceElevated,
  paddingVertical: SPACING.lg,
  paddingHorizontal: SPACING.xl,
  borderTopWidth: 1,
  borderTopColor: COLORS.borderLight,
},
blockedText: { color: COLORS.textMuted, fontSize: 14, flex: 1 },
unblockBtn: {
  backgroundColor: COLORS.primary,
  paddingHorizontal: SPACING.lg,
  paddingVertical: SPACING.sm,
  borderRadius: BORDER_RADIUS.full,
},
unblockBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  videoDuration: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },

  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 13, fontWeight: '600' },
  fileSize: { fontSize: 11, marginTop: 2 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 2,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: COLORS.textSecondary },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 3,
  },
  messageTime: { fontSize: 10 },
  timeSent: { color: 'rgba(255,255,255,0.5)' },
  timeReceived: { color: COLORS.textMuted },
  receiptsRow: { flexDirection: 'row', marginTop: 2, gap: 2, justifyContent: 'flex-end' },
  receiptAvatar: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: COLORS.background },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: SPACING.md },
  emptyChatText: { fontSize: 13, color: COLORS.textMuted },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  recordingDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.error },
  recordingText: { flex: 1, color: COLORS.text, fontSize: 14 },
  replyBar2: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  replyBarAccent: { width: 3, height: 36, backgroundColor: COLORS.primary, borderRadius: 2 },
  replyBarName: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  replyBarContent: { fontSize: 12, color: COLORS.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  inputAction: { padding: SPACING.xs, justifyContent: 'center', alignSelf: 'flex-end', paddingBottom: 10 },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    color: COLORS.text,
    fontSize: 15,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  sendButton: { borderRadius: 20, overflow: 'hidden', alignSelf: 'flex-end', marginBottom: 4 },
  sendGradient: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  micButton: { padding: SPACING.xs, alignSelf: 'flex-end', paddingBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'flex-end' },
  attachmentSheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
  },
  stopRecordingBtn: {
  alignItems: 'center',
  justifyContent: 'center',
},
  attachmentTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xl },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg, justifyContent: 'space-around' },
  attachmentItem: { alignItems: 'center', gap: SPACING.sm },
  attachmentIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  attachmentLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  reactionSheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
  },
  reactionRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: SPACING.xl },
  reactionBtn: { padding: SPACING.sm },
  messageActions: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: SPACING.md },
  messageActionBtn: { alignItems: 'center', gap: SPACING.xs, minWidth: 56 },
  messageActionLabel: { fontSize: 12, color: COLORS.textSecondary },
  optionsMenu: {
    position: 'absolute',
    top: 80,
    right: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minWidth: 200,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  optionLabel: { fontSize: 15, fontWeight: '600' },
  forwardSheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
    maxHeight: '60%',
  },
  forwardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  forwardEmpty: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: SPACING.xl },
  forwardDevice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  forwardAvatar: { width: 40, height: 40, borderRadius: 20 },
  forwardName: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  replyMediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
