import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useMeshStore } from '@/store/meshStore';
import { DatabaseService } from '@/database/DatabaseService';
import { User, MarketplaceItem } from '@/types';
import { formatDistanceToNow } from 'date-fns';

export default function UserProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { currentUser } = useAuthStore();
  const { nearbyDevices } = useMeshStore();

  const [user, setUser] = useState<User | null>(null);
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showImageModal, setShowImageModal] = useState(false);

  const isOwnProfile = userId === currentUser?.id;

  const loadProfile = useCallback(async () => {
    if (!userId || !currentUser) return;
    setIsLoading(true);
    try {
      // Try to load from nearby devices first (live mesh data)
      const device = nearbyDevices.find(
        (d) => d.deviceId === userId || d.id === userId
      );

      if (device?.user) {
        setUser(device.user);
      } else {
        // Fall back to DB
        const dbUser = await DatabaseService.getUserByDeviceId(userId);
        if (dbUser) setUser(dbUser);
      }

      // Load their marketplace items
      const items = await DatabaseService.getMarketplaceItems(userId);
      setMarketplaceItems(items);

      // Check if blocked
      const blocked = await DatabaseService.isUserBlocked(currentUser.id, userId);
      setIsBlocked(blocked);
    } catch (e) {
      console.error('[UserProfile]', e);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentUser, nearbyDevices]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleStartChat = () => {
    router.back();
    router.push(`/chat/${userId}`);
  };

  const handleBlock = () => {
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? 'Allow this user to contact you again?'
        : 'Block this user? They will not be able to send you messages.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            if (!currentUser || !userId) return;
            try {
              if (isBlocked) {
                await DatabaseService.unblockUser(currentUser.id, userId);
              } else {
                await DatabaseService.blockUser({
                  userId: currentUser.id,
                  blockedUserId: userId,
                  blockedAt: Date.now(),
                  reason: 'Blocked from profile',
                });
              }
              setIsBlocked(!isBlocked);
            } catch (e) {
              Alert.alert('Error', 'Action failed. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteChat = () => {
    Alert.alert(
      'Delete Chat',
      'Delete all messages in this chat? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Chat deletion logic — remove from store and DB
            router.back();
          },
        },
      ]
    );
  };

  const displayUser = user ?? {
    id: userId ?? '',
    name: userId?.slice(0, 12) ?? 'Unknown User',
    avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${userId}`,
    about: undefined,
    isOnline: nearbyDevices.some((d) => d.deviceId === userId && d.isConnected),
    lastSeen: Date.now() - 60000,
    level: 1,
    xp: 0,
    deviceId: userId ?? '',
    publicKey: '',
  };

  const isOnline = nearbyDevices.some(
    (d) => (d.deviceId === userId || d.id === userId) && d.isConnected
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        {!isOwnProfile && (
          <TouchableOpacity onPress={handleBlock}>
            <MaterialCommunityIcons
              name={isBlocked ? 'account-check-outline' : 'block-helper'}
              size={20}
              color={isBlocked ? COLORS.neonTeal : COLORS.error}
            />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Avatar + gradient header */}
        <LinearGradient
          colors={[COLORS.primary + '33', 'transparent']}
          style={styles.profileGradient}
        />

        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => setShowImageModal(true)}>
            <View style={styles.avatarWrapper}>
              <Image source={{ uri: displayUser.avatar }} style={styles.avatar} />
              <View style={[
                styles.onlineRing,
                { borderColor: isOnline ? COLORS.neonTeal : 'transparent' },
              ]} />
              {isOnline && <View style={styles.onlineDot} />}
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{displayUser.name}</Text>
          <View style={styles.onlineStatus}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.neonTeal : COLORS.offline }]} />
            <Text style={[styles.statusText, { color: isOnline ? COLORS.neonTeal : COLORS.textMuted }]}>
              {isOnline ? 'Online via mesh' : `Last seen ${formatDistanceToNow(displayUser.lastSeen, { addSuffix: true })}`}
            </Text>
          </View>

          {/* Mesh badge */}
          {isOnline && (
            <View style={styles.meshBadge}>
              <MaterialCommunityIcons name="bluetooth" size={11} color={COLORS.neonBlue} />
              <Text style={styles.meshBadgeText}>Connected via B-Chat mesh</Text>
            </View>
          )}
        </View>

        {/* About */}
        {displayUser.about && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <View style={styles.aboutCard}>
              <Text style={styles.aboutText}>{displayUser.about}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        {!isOwnProfile && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleStartChat}>
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                style={styles.actionBtnGradient}
              >
                <Feather name="message-circle" size={18} color="#fff" />
                <Text style={styles.actionBtnText}>Message</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={() => router.push(`/call/${userId}?type=voice&targetId=${userId}`)}
            >
              <Feather name="phone" size={18} color={COLORS.text} />
              <Text style={styles.actionBtnTextSecondary}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={() => router.push(`/call/${userId}?type=video&targetId=${userId}`)}
            >
              <Feather name="video" size={18} color={COLORS.text} />
              <Text style={styles.actionBtnTextSecondary}>Video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Marketplace items */}
        {marketplaceItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>
                {isOwnProfile ? 'Your Listings' : `${displayUser.name.split(' ')[0]}'s Listings`}
              </Text>
              <TouchableOpacity onPress={() => router.push('/marketplace')}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.itemsRow}>
                {marketplaceItems.slice(0, 5).map((item) => (
                  <TouchableOpacity key={item.id} style={styles.itemCard}>
                    <Image
                      source={{ uri: item.images[0] ?? `https://api.dicebear.com/7.x/shapes/png?seed=${item.id}` }}
                      style={styles.itemImage}
                    />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.itemPrice}>
                        {item.currency} {item.price.toLocaleString()}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Danger zone — not own profile */}
        {!isOwnProfile && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Actions</Text>
            <View style={styles.dangerGroup}>
              <TouchableOpacity style={styles.dangerRow} onPress={handleBlock}>
                <MaterialCommunityIcons
                  name={isBlocked ? 'account-check-outline' : 'block-helper'}
                  size={18}
                  color={isBlocked ? COLORS.neonTeal : COLORS.error}
                />
                <Text style={[styles.dangerText, isBlocked && { color: COLORS.neonTeal }]}>
                  {isBlocked ? 'Unblock User' : 'Block User'}
                </Text>
              </TouchableOpacity>
              <View style={styles.dangerSeparator} />
              <TouchableOpacity style={styles.dangerRow} onPress={handleDeleteChat}>
                <Feather name="trash-2" size={18} color={COLORS.error} />
                <Text style={styles.dangerText}>Delete Chat</Text>
              </TouchableOpacity>
              <View style={styles.dangerSeparator} />
              <TouchableOpacity
                style={styles.dangerRow}
                onPress={() => Alert.alert('Report', 'Report functionality coming soon.')}
              >
                <Feather name="flag" size={18} color={COLORS.warning} />
                <Text style={[styles.dangerText, { color: COLORS.warning }]}>Report User</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Device ID — technical info */}
        <View style={styles.techInfo}>
          <MaterialCommunityIcons name="identifier" size={12} color={COLORS.textMuted} />
          <Text style={styles.techInfoText}>
            ID: {displayUser.deviceId.slice(0, 32)}
          </Text>
        </View>
      </ScrollView>

      {/* Full-screen avatar modal */}
      <Modal
        visible={showImageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <TouchableOpacity
          style={styles.imageModal}
          onPress={() => setShowImageModal(false)}
          activeOpacity={1}
        >
          <Image
            source={{ uri: displayUser.avatar }}
            style={styles.fullAvatar}
            resizeMode="contain"
          />
          <TouchableOpacity
            style={styles.imageModalClose}
            onPress={() => setShowImageModal(false)}
          >
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.imageModalCaption}>
            <MaterialCommunityIcons name="bluetooth" size={12} color={COLORS.neonBlue} />
            <Text style={styles.imageModalCaptionText}>
              Downloaded via Bluetooth mesh
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  content: { paddingBottom: 60 },
  profileGradient: { height: 120, position: 'absolute', top: 0, left: 0, right: 0 },
  avatarSection: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.md },
  avatarWrapper: { position: 'relative' },
  avatar: { width: 110, height: 110, borderRadius: 55 },
  onlineRing: {
    position: 'absolute', top: -4, left: -4,
    width: 118, height: 118, borderRadius: 59, borderWidth: 3,
  },
  onlineDot: {
    position: 'absolute', bottom: 4, right: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.neonTeal,
    borderWidth: 3, borderColor: COLORS.background,
  },
  userName: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  onlineStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  meshBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(10,132,255,0.12)', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(10,132,255,0.25)',
  },
  meshBadgeText: { fontSize: 11, color: COLORS.neonBlue, fontWeight: '600' },
  section: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.md,
  },
  seeAllText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  aboutCard: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  aboutText: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22 },
  actionsRow: {
    flexDirection: 'row', gap: SPACING.md,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl,
  },
  actionBtn: { flex: 2, borderRadius: BORDER_RADIUS.full, overflow: 'hidden' },
  actionBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actionBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  actionBtnTextSecondary: { color: COLORS.text, fontWeight: '600', fontSize: 13 },
  itemsRow: { flexDirection: 'row', gap: SPACING.md },
  itemCard: {
    width: 130, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderLight,
  },
  itemImage: { width: '100%', height: 90 },
  itemInfo: { padding: SPACING.sm },
  itemTitle: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  itemPrice: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  dangerGroup: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden',
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.lg,
  },
  dangerText: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
  dangerSeparator: { height: 1, backgroundColor: COLORS.borderLight, marginLeft: SPACING.xl + 18 + SPACING.md },
  techInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl,
  },
  techInfoText: { fontSize: 10, color: COLORS.textMuted, fontFamily: 'monospace' },
  imageModal: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  fullAvatar: { width: '90%', height: '70%' },
  imageModalClose: {
    position: 'absolute', top: 60, right: 24,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  imageModalCaption: {
    position: 'absolute', bottom: 60,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  imageModalCaptionText: { fontSize: 12, color: '#fff' },
});
