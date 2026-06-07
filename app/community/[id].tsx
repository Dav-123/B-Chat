import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Image, ScrollView, Alert, ActivityIndicator, Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS, SHADOWS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';
import { EncryptionService } from '@/services/EncryptionService';
import { Community, Group } from '@/types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  Education: 'school-outline',
  Technology: 'chip',
  Sports: 'run',
  Arts: 'palette-outline',
  Business: 'briefcase-outline',
  Health: 'heart-pulse',
  Social: 'account-group-outline',
  Other: 'shape-outline',
};

function formatMemberCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─── GroupCard ─────────────────────────────────────────────────────────────────

const GroupCard = ({
  group,
  onPress,
  isAdmin,
}: {
  group: Group;
  onPress: () => void;
  isAdmin: boolean;
}) => (
  <TouchableOpacity style={styles.groupCard} onPress={onPress} activeOpacity={0.75}>
    <Image
      source={{ uri: group.avatar ?? `https://api.dicebear.com/7.x/identicon/png?seed=${group.id}` }}
      style={styles.groupCardAvatar}
    />
    <View style={styles.groupCardInfo}>
      <View style={styles.groupCardNameRow}>
        <Text style={styles.groupCardName} numberOfLines={1}>{group.name}</Text>
        {group.isPublic
          ? <MaterialCommunityIcons name="earth" size={13} color={COLORS.neonBlue} />
          : <Feather name="lock" size={12} color={COLORS.textMuted} />
        }
      </View>
      <Text style={styles.groupCardDesc} numberOfLines={1}>
        {group.description || 'No description'}
      </Text>
      <Text style={styles.groupCardMeta}>
        {formatMemberCount(group.members.length)} members
        {group.settings?.autoRelayShare ? ' · 📡 Auto Relay' : ''}
      </Text>
    </View>
    <View style={styles.groupCardActions}>
      {isAdmin && (
        <View style={styles.adminBadge}>
          <MaterialCommunityIcons name="crown" size={10} color={COLORS.neonOrange} />
        </View>
      )}
      <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
    </View>
  </TouchableOpacity>
);

// ─── AnnouncementBanner ────────────────────────────────────────────────────────

const AnnouncementBanner = ({ text }: { text: string }) => (
  <LinearGradient
    colors={[COLORS.primary + '22', COLORS.neonPurple + '11']}
    style={styles.announcementBanner}
    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
  >
    <MaterialCommunityIcons name="bullhorn-outline" size={18} color={COLORS.primary} />
    <Text style={styles.announcementText} numberOfLines={3}>{text}</Text>
  </LinearGradient>
);

// ─── StatPill ─────────────────────────────────────────────────────────────────

const StatPill = ({ icon, value, label, color }: {
  icon: string; value: string; label: string; color: string;
}) => (
  <View style={styles.statPill}>
    <View style={[styles.statIcon, { backgroundColor: color + '22' }]}>
      <MaterialCommunityIcons name={icon as any} size={18} color={color} />
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentUser } = useAuthStore();

  const [community, setCommunity] = useState<Community | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'groups' | 'members' | 'about'>('groups');
  const [isMember, setIsMember] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // ── Load community ───────────────────────────────────────────────────────

  useEffect(() => {
  (async () => {
    try {
      const pubKey = await EncryptionService.getPublicKey();
      if (!pubKey) await EncryptionService.generateIdentityKeyPair();

      const loadedCommunity = await DatabaseService.getCommunity(id!);
      if (!loadedCommunity) {
        Alert.alert('Error', 'Community not found.');
        router.back();
        return;
      }
      setCommunity(loadedCommunity);
      setIsMember(currentUser ? loadedCommunity.members.includes(currentUser.id) : false);

      const loadedGroups = await DatabaseService.getGroupsByCommunity(loadedCommunity.groups);
      setGroups(loadedGroups);
    } catch (e) {
      console.error('[CommunityScreen] load error', e);
      Alert.alert('Error', 'Could not load community.');
    } finally {
      setIsLoading(false);
    }
  })();
}, [id, currentUser]);

  // ── Join / Leave ─────────────────────────────────────────────────────────

  const handleJoinLeave = useCallback(async () => {
    if (!currentUser || !community) return;
    setIsJoining(true);
    try {
      const newMembers = isMember
        ? community.members.filter((m) => m !== currentUser.id)
        : [...community.members, currentUser.id];

      const updated: Community = { ...community, members: newMembers };
      await DatabaseService.saveCommunity(updated);
      setCommunity(updated);
      setIsMember(!isMember);
    } catch (e) {
      Alert.alert('Error', 'Failed to update membership.');
    } finally {
      setIsJoining(false);
    }
  }, [currentUser, community, isMember]);

  // ── Share ────────────────────────────────────────────────────────────────

  const handleShare = useCallback(async () => {
    if (!community) return;
    try {
      const checksum = await EncryptionService.generateChecksum(community.id);
      await Share.share({
        message: `Join "${community.name}" on B-Chat!\nCommunity ID: ${community.id}\nVerification: ${checksum.slice(0, 16)}`,
      });
    } catch (e) {
      console.error('[CommunityScreen] share error', e);
    }
  }, [community]);

  // ── Navigate to group ────────────────────────────────────────────────────

  const openGroup = useCallback((groupId: string) => {
    router.push(`/group/${groupId}`);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  const isOwner = currentUser?.id === community?.owner;
  const isAdmin = currentUser ? (community?.admins.includes(currentUser.id) ?? false) : false;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['rgba(123,94,167,0.15)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading community...</Text>
      </View>
    );
  }

  if (!community) {
    return (
      <View style={styles.loadingContainer}>
        <Feather name="alert-circle" size={48} color={COLORS.error} />
        <Text style={styles.loadingText}>Community not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tabs: Array<{ key: typeof activeTab; label: string; icon: string }> = [
    { key: 'groups', label: 'Groups', icon: 'account-group-outline' },
    { key: 'members', label: 'Members', icon: 'account-multiple-outline' },
    { key: 'about', label: 'About', icon: 'information-outline' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'groups':
        return groups.length === 0 ? (
          <View style={styles.emptyTab}>
            <MaterialCommunityIcons name="account-group-outline" size={48} color={COLORS.primary + '44'} />
            <Text style={styles.emptyTabTitle}>No groups yet</Text>
            <Text style={styles.emptyTabHint}>
              {isAdmin
                ? 'Create the first group for this community.'
                : 'The owner hasn\'t added any groups yet.'}
            </Text>
            {isAdmin && (
              <TouchableOpacity
                style={styles.createGroupBtn}
                onPress={() => router.push({ pathname: '/create-group', params: { communityId: id } })}     >
                <LinearGradient
                  colors={COLORS.gradientPrimary as [string, string]}
                  style={styles.createGroupBtnGradient}
                >
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.createGroupBtnText}>Create Group</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(g) => g.id}
            renderItem={({ item }) => (
              <GroupCard
                group={item}
                onPress={() => openGroup(item.id)}
                isAdmin={isAdmin}
              />
            )}
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: SPACING.lg }}
          />
        );

      case 'members':
        return (
          <View style={styles.membersTab}>
            {community.members.length === 0 ? (
              <Text style={styles.emptyTabHint}>No members yet.</Text>
            ) : (
              community.members.map((memberId) => {
                const memberIsAdmin = community.admins.includes(memberId);
                const memberIsOwner = community.owner === memberId;
                return (
                  <View key={memberId} style={styles.memberRow}>
                    <LinearGradient
                      colors={memberIsOwner
                        ? [COLORS.neonOrange, COLORS.warning]
                        : memberIsAdmin
                          ? [COLORS.primary, COLORS.neonPurple]
                          : [COLORS.card, COLORS.surfaceElevated]}
                      style={styles.memberAvatar}
                    >
                      <MaterialCommunityIcons
                        name={memberIsOwner ? 'crown' : memberIsAdmin ? 'shield-star' : 'account'}
                        size={20}
                        color="#fff"
                      />
                    </LinearGradient>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>
                        {memberId.slice(0, 14)}...
                        {memberId === currentUser?.id ? ' (You)' : ''}
                      </Text>
                      <Text style={styles.memberRole}>
                        {memberIsOwner ? '👑 Owner' : memberIsAdmin ? '🛡️ Admin' : 'Member'}
                      </Text>
                    </View>
                    {(isAdmin || isOwner) && memberId !== currentUser?.id && (
                      <TouchableOpacity
                        style={styles.memberAction}
                        onPress={() => Alert.alert('Member Actions', 'Coming soon.')}
                      >
                        <Feather name="more-vertical" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        );

      case 'about':
        return (
          <View style={styles.aboutTab}>
            {community.rules && (
              <View style={styles.aboutSection}>
                <View style={styles.aboutSectionHeader}>
                  <MaterialCommunityIcons name="gavel" size={18} color={COLORS.primary} />
                  <Text style={styles.aboutSectionTitle}>Community Rules</Text>
                </View>
                <Text style={styles.aboutSectionText}>{community.rules}</Text>
              </View>
            )}

            <View style={styles.aboutSection}>
              <View style={styles.aboutSectionHeader}>
                <MaterialCommunityIcons name="information-outline" size={18} color={COLORS.neonBlue} />
                <Text style={styles.aboutSectionTitle}>Details</Text>
              </View>
              <View style={styles.detailsGrid}>
                {[
                  { label: 'Category', value: community.category ?? 'Other', icon: CATEGORY_ICONS[community.category ?? 'Other'] ?? 'shape-outline' },
                  { label: 'Type', value: community.isPublic ? 'Public' : 'Private', icon: community.isPublic ? 'earth' : 'lock' },
                  { label: 'Created', value: new Date(community.createdAt).toLocaleDateString(), icon: 'calendar-outline' },
                  { label: 'Groups', value: String(community.groups.length), icon: 'account-group-outline' },
                ].map((d) => (
                  <View key={d.label} style={styles.detailItem}>
                    <MaterialCommunityIcons name={d.icon as any} size={16} color={COLORS.primary} />
                    <Text style={styles.detailLabel}>{d.label}</Text>
                    <Text style={styles.detailValue}>{d.value}</Text>
                  </View>
                ))}
              </View>
            </View>

            {isAdmin && (
              <View style={styles.adminActionsSection}>
                <Text style={styles.adminActionsTitle}>Admin Actions</Text>
                {[
                  { label: 'Edit Community Info', icon: 'pencil-outline', color: COLORS.primary },
                  { label: 'Post Announcement', icon: 'bullhorn-outline', color: COLORS.neonTeal },
                  { label: 'Manage Members', icon: 'account-cog-outline', color: COLORS.neonBlue },
                  { label: isOwner ? 'Delete Community' : 'Leave Community', icon: isOwner ? 'delete-outline' : 'exit-to-app', color: COLORS.error },
                ].map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.adminAction}
                    onPress={() => {
                      if (action.label === 'Leave Community') {
                        Alert.alert('Leave Community', 'Are you sure?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Leave', style: 'destructive', onPress: handleJoinLeave },
                        ]);
                      } else {
                        Alert.alert(action.label, 'Coming soon.');
                      }
                    }}
                  >
                    <View style={[styles.adminActionIcon, { backgroundColor: action.color + '22' }]}>
                      <MaterialCommunityIcons name={action.icon as any} size={20} color={action.color} />
                    </View>
                    <Text style={[styles.adminActionLabel, { color: action.color === COLORS.error ? COLORS.error : COLORS.text }]}>
                      {action.label}
                    </Text>
                    <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} stickyHeaderIndices={[2]}>

        {/* Banner */}
        <View style={styles.bannerContainer}>
          {community.banner ? (
            <Image source={{ uri: community.banner }} style={styles.banner} />
          ) : (
            <LinearGradient
              colors={[COLORS.primary + '44', COLORS.neonPurple + '22', 'transparent']}
              style={styles.banner}
            >
              <MaterialCommunityIcons
                name={CATEGORY_ICONS[community.category ?? 'Other'] as any ?? 'account-group'}
                size={64}
                color={COLORS.primary + '55'}
              />
            </LinearGradient>
          )}

          {/* Back button on banner */}
          <TouchableOpacity style={styles.bannerBack} onPress={() => router.back()}>
            <View style={styles.bannerBackBg}>
              <Feather name="arrow-left" size={20} color={COLORS.text} />
            </View>
          </TouchableOpacity>

          {/* Share on banner */}
          <TouchableOpacity style={styles.bannerShare} onPress={handleShare}>
            <View style={styles.bannerBackBg}>
              <Feather name="share-2" size={18} color={COLORS.text} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Community header info */}
        <View style={styles.communityHeader}>
          <View style={styles.communityAvatarRow}>
            <Image
              source={{ uri: community.avatar }}
              style={styles.communityAvatar}
            />
            <View style={styles.communityTitleBlock}>
              <Text style={styles.communityName}>{community.name}</Text>
              <View style={styles.communityBadges}>
                {community.isPublic
                  ? <View style={[styles.badge, { backgroundColor: COLORS.neonBlue + '22' }]}>
                      <MaterialCommunityIcons name="earth" size={11} color={COLORS.neonBlue} />
                      <Text style={[styles.badgeText, { color: COLORS.neonBlue }]}>Public</Text>
                    </View>
                  : <View style={[styles.badge, { backgroundColor: COLORS.textMuted + '22' }]}>
                      <Feather name="lock" size={11} color={COLORS.textMuted} />
                      <Text style={[styles.badgeText, { color: COLORS.textMuted }]}>Private</Text>
                    </View>
                }
                {community.category && (
                  <View style={[styles.badge, { backgroundColor: COLORS.primary + '22' }]}>
                    <Text style={[styles.badgeText, { color: COLORS.primary }]}>
                      {community.category}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {community.description ? (
            <Text style={styles.communityDesc}>{community.description}</Text>
          ) : null}

          {/* Stats row */}
          <View style={styles.statsRow}>
            <StatPill
              icon="account-multiple"
              value={formatMemberCount(community.members.length)}
              label="Members"
              color={COLORS.neonBlue}
            />
            <StatPill
              icon="account-group-outline"
              value={String(community.groups.length)}
              label="Groups"
              color={COLORS.primary}
            />
            <StatPill
              icon="shield-check-outline"
              value={String(community.admins.length)}
              label="Admins"
              color={COLORS.neonTeal}
            />
          </View>

          {/* Announcement */}
          {community.announcement && (
            <AnnouncementBanner text={community.announcement} />
          )}

          {/* Join / Leave */}
          {!isOwner && (
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={handleJoinLeave}
              disabled={isJoining}
            >
              {isJoining ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : isMember ? (
                <>
                  <Feather name="log-out" size={16} color={COLORS.textSecondary} />
                  <Text style={styles.joinBtnTextLeave}>Leave Community</Text>
                </>
              ) : (
                <LinearGradient
                  colors={COLORS.gradientPrimary as [string, string]}
                  style={styles.joinBtnGradient}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.joinBtnText}>Join Community</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs (sticky) */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={16}
                color={activeTab === tab.key ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {renderTabContent()}
        </View>

      </ScrollView>
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
  backBtn: {
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  backBtnText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  // Banner
  bannerContainer: { height: 200, position: 'relative' },
  banner: {
    width: '100%', height: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  bannerBack: { position: 'absolute', top: SPACING.lg, left: SPACING.lg },
  bannerShare: { position: 'absolute', top: SPACING.lg, right: SPACING.lg },
  bannerBackBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(8,8,16,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.borderLight,
  },

  // Community header
  communityHeader: { padding: SPACING.xl, gap: SPACING.lg },
  communityAvatarRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md },
  communityAvatar: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: COLORS.background,
    marginTop: -36, ...SHADOWS.card,
  },
  communityTitleBlock: { flex: 1 },
  communityName: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  communityBadges: { flexDirection: 'row', gap: SPACING.sm, marginTop: 4, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  communityDesc: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 20 },

  // Stats
  statsRow: { flexDirection: 'row', gap: SPACING.sm },
  statPill: {
    flex: 1, alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  statIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  // Announcement
  announcementBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.primary + '33',
  },
  announcementText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },

  // Join button
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: BORDER_RADIUS.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.borderLight, minHeight: 48,
    gap: SPACING.sm,
  },
  joinBtnGradient: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md,
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  joinBtnTextLeave: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 15 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    paddingHorizontal: SPACING.xl,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, paddingVertical: SPACING.md,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },

  // Tab content
  tabContent: { padding: SPACING.xl },
  emptyTab: { alignItems: 'center', paddingVertical: 40, gap: SPACING.md },
  emptyTabTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary },
  emptyTabHint: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  createGroupBtn: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginTop: SPACING.sm },
  createGroupBtnGradient: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  createGroupBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Group card
  groupCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  groupCardAvatar: { width: 52, height: 52, borderRadius: 26 },
  groupCardInfo: { flex: 1 },
  groupCardNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  groupCardName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  groupCardDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  groupCardMeta: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  groupCardActions: { alignItems: 'center', gap: SPACING.xs },
  adminBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.neonOrange + '22',
    alignItems: 'center', justifyContent: 'center',
  },

  // Members tab
  membersTab: { gap: 0 },
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

  // About tab
  aboutTab: { gap: SPACING.xl },
  aboutSection: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  aboutSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  aboutSectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  aboutSectionText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  detailsGrid: { gap: SPACING.sm },
  detailItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  detailLabel: { fontSize: 13, color: COLORS.textMuted, flex: 1 },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },

  // Admin actions
  adminActionsSection: { gap: SPACING.sm },
  adminActionsTitle: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.xs,
  },
  adminAction: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, gap: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  adminActionIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  adminActionLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
});	
