import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Image, KeyboardAvoidingView, Platform,
  Alert, ActivityIndicator, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';
import { EncryptionService } from '@/services/EncryptionService';
import { Group, Message } from '@/types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeader(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── MessageBubble ─────────────────────────────────────────────────────────────

const MessageBubble = React.memo(({
  message,
  isMine,
  isAdmin,
}: {
  message: Message;
  isMine: boolean;
  isAdmin: boolean;
}) => {
  const scale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1, useNativeDriver: true,
      tension: 100, friction: 8,
    }).start();
  }, []);

  return (
    <Animated.View style={[
      styles.bubbleRow,
      isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
      { transform: [{ scale }] },
    ]}>
      {!isMine && (
        <View style={styles.bubbleAvatar}>
          <MaterialCommunityIcons name="account" size={16} color={COLORS.textMuted} />
        </View>
      )}
      <View style={[
        styles.bubble,
        isMine ? styles.bubbleMine : styles.bubbleTheirs,
      ]}>
        {!isMine && (
          <Text style={styles.bubbleSender}>
            {isAdmin ? '👑 ' : ''}{message.senderId.slice(0, 8)}
          </Text>
        )}
        <Text style={styles.bubbleText}>{message.content}</Text>
        <View style={styles.bubbleMeta}>
          {message.encrypted && (
            <Feather name="lock" size={9} color={isMine ? 'rgba(255,255,255,0.45)' : COLORS.textMuted} />
          )}
          <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
            {formatTime(message.timestamp)}
          </Text>
          {isMine && (
            <Feather
              name={message.status === 'read' ? 'check-circle' : 'check'}
              size={11}
              color={message.status === 'read' ? COLORS.neonTeal : 'rgba(255,255,255,0.4)'}
            />
          )}
        </View>
      </View>
    </Animated.View>
  );
});

// ─── MemberSheet ───────────────────────────────────────────────────────────────

const MemberSheet = ({
  group,
  currentUserId,
  onClose,
}: {
  group: Group;
  currentUserId: string;
  onClose: () => void;
}) => {
  const isAdmin = group.admins.includes(currentUserId);

  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>Members ({group.members.length})</Text>
      <FlatList
        data={group.members}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => {
          const memberIsAdmin = group.admins.includes(item.userId);
          return (
            <View style={styles.memberRow}>
              <LinearGradient
                colors={memberIsAdmin
                  ? [COLORS.primary, COLORS.neonPurple]
                  : [COLORS.card, COLORS.surfaceElevated]}
                style={styles.memberAvatar}
              >
                <MaterialCommunityIcons
                  name={memberIsAdmin ? 'crown' : 'account'}
                  size={20}
                  color={memberIsAdmin ? '#fff' : COLORS.textMuted}
                />
              </LinearGradient>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {item.userId.slice(0, 12)}...
                  {item.userId === currentUserId ? ' (You)' : ''}
                </Text>
                <Text style={styles.memberRole}>
                  {memberIsAdmin ? '👑 Admin' : `Member · joined ${formatDateHeader(item.joinedAt)}`}
                </Text>
              </View>
              {isAdmin && item.userId !== currentUserId && (
                <TouchableOpacity style={styles.memberAction}>
                  <Feather name="more-vertical" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
      <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
        <Text style={styles.sheetCloseText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser } = useAuthStore();

  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [encryptionReady, setEncryptionReady] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const chatId = `group:${id}`;

  // ── Load group & messages ────────────────────────────────────────────────

  useEffect(() => {
  (async () => {
    try {
      const pubKey = await EncryptionService.getPublicKey();
      if (!pubKey) await EncryptionService.generateIdentityKeyPair();
      setEncryptionReady(true);

      const loadedGroup = await DatabaseService.getGroup(id!);
      if (!loadedGroup) {
        Alert.alert('Error', 'Group not found.');
        router.back();
        return;
      }
      setGroup(loadedGroup);

      const stored = await DatabaseService.getMessages(chatId, { limit: 80 });

      const decrypted = await Promise.all(
        stored.map(async (m) => {
          if (!m.encrypted || m.senderId === currentUser?.id) return m;
          try {
            const plain = await EncryptionService.decryptMessage(m.content, m.senderId);
            return { ...m, content: plain };
          } catch {
            return { ...m, content: '[Encrypted message]' };
          }
        })
      );

      setMessages(decrypted);
    } catch (e) {
      console.error('[GroupScreen] load error', e);
      Alert.alert('Error', 'Failed to load group.');
    } finally {
      setIsLoading(false);
    }
  })();
}, [id]);

  // ── Mark read on enter ───────────────────────────────────────────────────

  useEffect(() => {
    if (currentUser && chatId) {
      DatabaseService.resetUnreadCount(chatId).catch(() => {});
    }
  }, [chatId, currentUser]);

  // ── Send message ─────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !currentUser || isSending) return;

    // Check who can send
    if (group?.settings.whoCanSendMessages === 'admins' &&
        !group.admins.includes(currentUser.id)) {
      Alert.alert('Restricted', 'Only admins can send messages in this group.');
      return;
    }

    setIsSending(true);
    setInputText('');

    try {
      const pubKey = await EncryptionService.getPublicKey();

      // Encrypt for group (using group id as the "recipient" public key seed)
      const groupKeyMaterial = await EncryptionService.generateChecksum(id! + 'group-key');
      const encrypted = pubKey
        ? await EncryptionService.encryptMessage(text, groupKeyMaterial).catch(() => null)
        : null;

      const message: Message = {
        id: uuid.v4() as string,
        chatId,
        senderId: currentUser.id,
        receiverId: chatId,
        content: encrypted ?? text,
        type: 'text',
        timestamp: Date.now(),
        status: 'sent',
        encrypted: !!encrypted,
        hopCount: 0,
        routePath: [],
        reactions: [],
        readBy: [{ userId: currentUser.id, avatar: currentUser.avatar, readAt: Date.now() }],
      };

      // Save encrypted to DB, show plaintext in UI
      await DatabaseService.saveMessage(message);
      await DatabaseService.updateChatLastMessage(chatId, message);

      const displayMessage: Message = { ...message, content: text };
      setMessages((prev) => [...prev, displayMessage]);

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.error('[GroupScreen] send error', e);
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  }, [inputText, currentUser, isSending, group, id, chatId]);

  // ── Render ───────────────────────────────────────────────────────────────

  const isAdmin = currentUser ? (group?.admins.includes(currentUser.id) ?? false) : false;
  const canSend = group?.settings.whoCanSendMessages === 'everyone' || isAdmin;

  const renderItem = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMine = item.senderId === currentUser?.id;
    const prev = messages[index - 1];
    const showDateHeader = !prev ||
      new Date(item.timestamp).toDateString() !== new Date(prev.timestamp).toDateString();

    return (
      <View>
        {showDateHeader && (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{formatDateHeader(item.timestamp)}</Text>
          </View>
        )}
        <MessageBubble
          message={item}
          isMine={isMine}
          isAdmin={isAdmin}
        />
      </View>
    );
  }, [messages, currentUser, isAdmin]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['rgba(123,94,167,0.15)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading group...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(123,94,167,0.1)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: 200 }]}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerInfo}
          onPress={() => setShowMembers(true)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: group?.avatar ?? `https://api.dicebear.com/7.x/identicon/png?seed=${id}` }}
            style={styles.headerAvatar}
          />
          <View>
            <Text style={styles.headerName} numberOfLines={1}>
              {group?.name ?? 'Group'}
            </Text>
            <Text style={styles.headerSub}>
              {group?.members.length ?? 0} members
              {encryptionReady ? ' · 🔒 E2E' : ''}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          {isAdmin && (
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => Alert.alert('Settings', 'Group settings coming soon.')}
            >
              <Feather name="settings" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setShowMembers(true)}
          >
            <MaterialCommunityIcons name="account-group" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <LinearGradient
                colors={[COLORS.primary + '22', 'transparent']}
                style={styles.emptyGlow}
              />
              <MaterialCommunityIcons name="account-group-outline" size={56} color={COLORS.primary + '66'} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyHint}>
                {canSend
                  ? 'Be the first to say something!'
                  : 'Only admins can send messages here.'}
              </Text>
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputBar}>
          {canSend ? (
            <>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Message..."
                  placeholderTextColor={COLORS.textMuted}
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                  maxLength={2000}
                  returnKeyType="default"
                />
                {encryptionReady && (
                  <Feather name="lock" size={14} color={COLORS.primary + '88'} style={styles.lockIcon} />
                )}
              </View>
              <TouchableOpacity
                style={[styles.sendBtn, (!inputText.trim() || isSending) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!inputText.trim() || isSending}
              >
                <LinearGradient
                  colors={inputText.trim()
                    ? COLORS.gradientPrimary as [string, string]
                    : [COLORS.card, COLORS.card]}
                  style={styles.sendBtnGradient}
                >
                  {isSending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Feather name="send" size={18} color={inputText.trim() ? '#fff' : COLORS.textMuted} />
                  }
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.restrictedBar}>
              <Feather name="lock" size={16} color={COLORS.textMuted} />
              <Text style={styles.restrictedText}>Only admins can send messages</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Members overlay */}
      {showMembers && group && currentUser && (
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowMembers(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <MemberSheet
              group={group}
              currentUserId={currentUser.id}
              onClose={() => setShowMembers(false)}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', gap: SPACING.lg,
  },
  loadingText: { color: COLORS.textSecondary, fontSize: 15 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  headerBtn: { padding: SPACING.sm },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerName: { fontSize: 16, fontWeight: '700', color: COLORS.text, maxWidth: 180 },
  headerSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  headerActions: { flexDirection: 'row' },

  // Messages
  messageList: { padding: SPACING.md, paddingBottom: SPACING.lg },
  dateHeader: {
    alignItems: 'center', marginVertical: SPACING.lg,
  },
  dateHeaderText: {
    fontSize: 11, color: COLORS.textMuted, fontWeight: '600',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  bubbleRow: { flexDirection: 'row', marginBottom: SPACING.sm, alignItems: 'flex-end' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubbleAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.xs, marginBottom: 2,
  },
  bubble: {
    maxWidth: '78%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  bubbleMine: {
    backgroundColor: COLORS.messageSent,
    borderWidth: 1, borderColor: COLORS.messageSentBorder,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: COLORS.messageReceived,
    borderWidth: 1, borderColor: COLORS.messageReceivedBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleSender: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  bubbleMeta: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, marginTop: 4, justifyContent: 'flex-end',
  },
  bubbleTime: { fontSize: 10, color: COLORS.textMuted },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.45)' },

  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: SPACING.sm },
  emptyGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary },
  emptyHint: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
    backgroundColor: COLORS.background, gap: SPACING.sm,
  },
  inputWrapper: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  textInput: { flex: 1, color: COLORS.text, fontSize: 15, maxHeight: 120, lineHeight: 21 },
  lockIcon: { marginLeft: SPACING.xs },
  sendBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  restrictedBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  restrictedText: { color: COLORS.textMuted, fontSize: 14 },

  // Members sheet
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,16,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl, maxHeight: '70%',
    borderTopWidth: 1, borderColor: COLORS.borderLight,
  },
  sheetHandle: {
    width: 36, height: 4, backgroundColor: COLORS.borderLight,
    borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.lg },
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, gap: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  memberAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  memberRole: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  memberAction: { padding: SPACING.sm },
  sheetClose: {
    marginTop: SPACING.xl, alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  sheetCloseText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },
});
