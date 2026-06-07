import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { useMeshStore } from '@/store/meshStore';
import { DatabaseService } from '@/database/DatabaseService';
import { Chat } from '@/types';

export default function ArchivedChats() {
  const { chats, addOrUpdateChat } = useChatStore();
  const { currentUser } = useAuthStore();
  const { nearbyDevices } = useMeshStore();
  const [archivedChats, setArchivedChats] = useState<Chat[]>([]);

  const loadArchived = useCallback(async () => {
    try {
      const all = await DatabaseService.getChats({ includeArchived: true });
      setArchivedChats(all.filter((c) => c.isArchived));
    } catch (e) {
      console.error('[ArchivedChats] Load failed:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadArchived();
    }, [loadArchived])
  );

  const handleUnarchive = async (chat: Chat) => {
    Alert.alert('Unarchive Chat', 'Move this chat back to your inbox?', [
      {
        text: 'Unarchive',
        onPress: async () => {
          try {
            await DatabaseService.saveChat({
              ...chat,
              isArchived: false,
              updatedAt: Date.now(),
            });
            addOrUpdateChat({ ...chat, isArchived: false, updatedAt: Date.now() });
            setArchivedChats((prev) => prev.filter((c) => c.id !== chat.id));
          } catch (e) {
            Alert.alert('Error', 'Could not unarchive chat.');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const getAvatar = (chat: Chat) => {
    const otherUserId = chat.participants.find((p) => p !== currentUser?.id);
    const device = nearbyDevices.find(
      (d) => d.id === otherUserId || d.deviceId === otherUserId
    );
    if (device?.user?.avatar) return device.user.avatar;
    const name = device?.user?.name ?? otherUserId ?? 'U';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7B5EA7&color=fff&size=128`;
  };

  const getName = (chat: Chat) => {
    const otherUserId = chat.participants.find((p) => p !== currentUser?.id);
    const device = nearbyDevices.find(
      (d) => d.id === otherUserId || d.deviceId === otherUserId
    );
    return device?.user?.name ?? device?.name ?? otherUserId?.slice(0, 12) ?? 'Unknown';
  };

  const getPreview = (chat: Chat) => {
    const msg = chat.lastMessage;
    if (!msg) return 'No messages';
    switch (msg.type) {
      case 'voiceNote': return 'Voice note';
      case 'image': return 'Photo';
      case 'video': return 'Video';
      case 'file':
      case 'document': return msg.fileName ?? 'File';
      default: return msg.content ?? 'No messages';
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Archived Chats</Text>
        <View style={{ width: 40 }} />
      </View>

      {archivedChats.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons name="archive-outline" size={64} color={COLORS.border} />
          <Text style={styles.emptyTitle}>No Archived Chats</Text>
          <Text style={styles.emptySubtitle}>Chats you archive will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={archivedChats}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const otherUserId = item.participants.find((p) => p !== currentUser?.id);
            return (
              <TouchableOpacity
                style={styles.chatItem}
                onPress={() => router.push(`/chat/${item.id}`)}
                onLongPress={() => handleUnarchive(item)}
                activeOpacity={0.7}
              >
                <Image
                  source={{ uri: getAvatar(item) }}
                  style={styles.avatar}
                />
                <View style={styles.chatInfo}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {getName(item)}
                    </Text>
                    <Text style={styles.chatTime}>
                      {item.lastMessage
                        ? formatDistanceToNow(item.lastMessage.timestamp, { addSuffix: false })
                        : ''}
                    </Text>
                  </View>
                  <View style={styles.chatFooter}>
                    <Text style={styles.lastMessage} numberOfLines={1}>
                      {getPreview(item)}
                    </Text>
                    <View style={styles.archiveBadge}>
                      <MaterialCommunityIcons
                        name="archive-outline"
                        size={12}
                        color={COLORS.textMuted}
                      />
                    </View>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.unarchiveBtn}
                  onPress={() => handleUnarchive(item)}
                >
                  <MaterialCommunityIcons
                    name="archive-arrow-up-outline"
                    size={20}
                    color={COLORS.primary}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.hint}>Long press or tap the icon to unarchive</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  backBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
  hint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  listContent: { paddingBottom: 40 },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.card,
  },
  chatInfo: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  chatName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  chatTime: { fontSize: 12, color: COLORS.textMuted },
  chatFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  archiveBadge: { marginLeft: SPACING.sm },
  unarchiveBtn: { padding: SPACING.sm },
});
