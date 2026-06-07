import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';
import { BlockedUser } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface BlockedUserDisplay extends BlockedUser {
  name: string;
  avatar: string;
}

export default function BlockedUsers() {
  const { currentUser } = useAuthStore();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBlockedUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
      const blocked = await DatabaseService.getBlockedUsers(currentUser.id);
      // Enrich with display info
      const enriched: BlockedUserDisplay[] = blocked.map((b) => ({
        ...b,
        name: b.blockedUserId.slice(0, 10),
        avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${b.blockedUserId}`,
      }));
      setBlockedUsers(enriched);
    } catch (e) {
      console.error('[BlockedUsers]', e);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { loadBlockedUsers(); }, [loadBlockedUsers]);

  const handleUnblock = (blockedUserId: string, name: string) => {
    Alert.alert(
      'Unblock User',
      `Unblock ${name}? They will be able to send you messages again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await DatabaseService.unblockUser(currentUser!.id, blockedUserId);
              setBlockedUsers((prev) =>
                prev.filter((u) => u.blockedUserId !== blockedUserId)
              );
            } catch (e) {
              Alert.alert('Error', 'Failed to unblock user.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(255,69,58,0.08)', 'transparent']}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : blockedUsers.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons
            name="account-check-outline"
            size={64}
            color={COLORS.border}
          />
          <Text style={styles.emptyTitle}>No Blocked Users</Text>
          <Text style={styles.emptySubtitle}>
            Users you block will appear here. You can unblock them at any time.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.countBanner}>
            <MaterialCommunityIcons
              name="block-helper"
              size={14}
              color={COLORS.error}
            />
            <Text style={styles.countText}>
              {blockedUsers.length} user{blockedUsers.length !== 1 ? 's' : ''} blocked
            </Text>
          </View>

          <FlatList
            data={blockedUsers}
            keyExtractor={(item) => item.blockedUserId}
            renderItem={({ item }) => (
              <View style={styles.userCard}>
                <Image source={{ uri: item.avatar }} style={styles.userAvatar} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.name}</Text>
                  <Text style={styles.userMeta}>
                    Blocked {formatDistanceToNow(item.blockedAt, { addSuffix: true })}
                  </Text>
                  {item.reason ? (
                    <Text style={styles.userReason} numberOfLines={1}>
                      {item.reason}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.unblockBtn}
                  onPress={() => handleUnblock(item.blockedUserId, item.name)}
                >
                  <Text style={styles.unblockText}>Unblock</Text>
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.md,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  emptySubtitle: {
    fontSize: 14, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 21,
  },
  countBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.error + '12', paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm, borderBottomWidth: 1,
    borderBottomColor: COLORS.error + '22',
  },
  countText: { fontSize: 13, color: COLORS.error, fontWeight: '600' },
  listContent: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: 60 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  userAvatar: {
    width: 50, height: 50, borderRadius: 25,
    opacity: 0.5,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
  userMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  userReason: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontStyle: 'italic' },
  unblockBtn: {
    backgroundColor: COLORS.error + '15', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.error + '33',
  },
  unblockText: { color: COLORS.error, fontSize: 13, fontWeight: '700' },
  separator: { height: SPACING.md },
});
