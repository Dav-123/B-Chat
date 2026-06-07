import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { useMeshStore } from '@/store/meshStore';
import { Chat, Group, Community } from '@/types';
import { DatabaseService } from '@/database/DatabaseService';
import { formatDistanceToNow } from 'date-fns';

// ─── Status icons ─────────────────────────────────────────────────────────────

function MessageStatusIcon({ status }: { status: string }) {
  if (status === 'sending')
    return <Feather name="clock" size={13} color={COLORS.textMuted} />;
  if (status === 'sent')
    return <MaterialCommunityIcons name="check" size={14} color={COLORS.textMuted} />;
  if (status === 'delivered')
    return <MaterialCommunityIcons name="check-all" size={14} color={COLORS.textMuted} />;
  if (status === 'read')
    return <MaterialCommunityIcons name="check-all" size={14} color={COLORS.neonBlue} />;
  if (status === 'failed')
    return <Feather name="alert-circle" size={13} color={COLORS.error} />;
  if (status === 'pending' || status === 'queued')
    return <MaterialCommunityIcons name="timer-sand" size={13} color={COLORS.warning} />;
  return null;
}

function MessageTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'voiceNote': return <Feather name="mic" size={12} color={COLORS.textSecondary} />;
    case 'image': return <Feather name="image" size={12} color={COLORS.textSecondary} />;
    case 'video': return <Feather name="video" size={12} color={COLORS.textSecondary} />;
    case 'file':
    case 'document': return <Feather name="paperclip" size={12} color={COLORS.textSecondary} />;
    default: return null;
  }
}

function getMessagePreview(message: Chat['lastMessage'], type?: string): string {
  if (!message) return 'No messages yet';
  switch (message.type) {
    case 'voiceNote': return 'Voice note';
    case 'image': return 'Photo';
    case 'video': return 'Video';
    case 'file':
    case 'document': return message.fileName ?? 'File';
    default: return message.content ?? 'No messages yet';
  }
}

// ─── Direct chat row ──────────────────────────────────────────────────────────

function ChatItem({ chat, currentUserId }: { chat: Chat; currentUserId: string }) {
  const { nearbyDevices } = useMeshStore();
  const otherUserId = chat.participants.find((p) => p !== currentUserId);
  const device = nearbyDevices.find(
    (d) => d.id === otherUserId || d.deviceId === otherUserId
  );
  const avatarUri = device?.user?.avatar
    || `https://ui-avatars.com/api/?name=${encodeURIComponent(device?.user?.name ?? otherUserId ?? 'U')}&background=7B5EA7&color=fff&size=128`;
  const displayName = device?.user?.name ?? device?.name ?? otherUserId?.slice(0, 14) ?? 'Unknown';
  const lastMessage = chat.lastMessage;
  const isSent = lastMessage?.senderId === currentUserId;
  const isTextMessage = !lastMessage?.type || lastMessage.type === 'text';

  return (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => router.push(`/chat/${chat.id}`)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.avatarWrapper}
        onPress={() => router.push(`/user-profile/${otherUserId}`)}
      >
        <Image source={{ uri: avatarUri }} style={styles.avatar} />
        <View style={[styles.onlineDot, { backgroundColor: device?.isConnected ? COLORS.online : COLORS.border }]} />
      </TouchableOpacity>

      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.chatTime}>
            {lastMessage
              ? formatDistanceToNow(lastMessage.timestamp, { addSuffix: false })
              : ''}
          </Text>
        </View>
        <View style={styles.chatFooter}>
          <View style={styles.lastMessageRow}>
            {isSent && lastMessage && <MessageStatusIcon status={lastMessage.status} />}
            {lastMessage && !isTextMessage && <MessageTypeIcon type={lastMessage.type} />}
            <Text style={styles.lastMessage} numberOfLines={1}>
              {getMessagePreview(lastMessage)}
            </Text>
          </View>
          {chat.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
// ─── Group row ────────────────────────────────────────────────────────────────

function GroupItem({ group }: { group: Group }) {
  return (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => router.push(`/group/${group.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
        <Image source={{ uri: group.avatar }} style={styles.avatar} />
        <View style={[styles.groupBadge]}>
          <MaterialCommunityIcons
            name="account-group"
            size={10}
            color="#fff"
          />
        </View>
      </View>

      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName} numberOfLines={1}>{group.name}</Text>
          <Text style={styles.chatTime}>
            {formatDistanceToNow(group.updatedAt, { addSuffix: false })}
          </Text>
        </View>
        <View style={styles.chatFooter}>
          <View style={styles.lastMessageRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {group.description || `${group.members.length} member${group.members.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <View style={styles.memberCount}>
            <Feather name="users" size={10} color={COLORS.textMuted} />
            <Text style={styles.memberCountText}>{group.members.length}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Community row ────────────────────────────────────────────────────────────

function CommunityItem({ community }: { community: Community }) {
  return (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => router.push(`/community/${community.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
        <Image source={{ uri: community.avatar }} style={styles.avatar} />
        <View style={[styles.communityBadge]}>
          <MaterialCommunityIcons
            name="home-group"
            size={10}
            color="#fff"
          />
        </View>
      </View>

      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName} numberOfLines={1}>{community.name}</Text>
          <Text style={styles.chatTime}>
            {community.category ?? 'Community'}
          </Text>
        </View>
        <View style={styles.chatFooter}>
          <View style={styles.lastMessageRow}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {community.description || `${community.members.length} member${community.members.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <View style={styles.memberCount}>
            <Feather name="users" size={10} color={COLORS.textMuted} />
            <Text style={styles.memberCountText}>{community.members.length}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main chats tab ───────────────────────────────────────────────────────────

type TabType = 'all' | 'groups' | 'communities';

export default function ChatsTab() {
  const { chats, groups, communities, hydrate, isHydrated } = useChatStore();
  const { currentUser } = useAuthStore();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');

  useEffect(() => {
    if (!isHydrated) hydrate();
  }, [isHydrated, hydrate]);

  // ── Filtered lists ──────────────────────────────────────────────────────
  const archivedChats = chats.filter((c) => c.isArchived);
  const filteredChats = chats.filter((c) => {
    if (c.isArchived) return false;
    if (!search.trim()) return true;
    return c.participants.some((p) =>
      p.toLowerCase().includes(search.toLowerCase())
    );
  });

  const filteredGroups = groups.filter((g) =>
    !search.trim() ||
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.description?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCommunities = communities.filter((c) =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  // ── Tab counts ──────────────────────────────────────────────────────────

  const tabCounts: Record<TabType, number> = {
    all: filteredChats.length,
    groups: filteredGroups.length,
    communities: filteredCommunities.length,
  };

  // ── Empty states ────────────────────────────────────────────────────────

  const renderEmpty = (tab: TabType) => {
    const configs = {
      all: {
        icon: 'chat-outline',
        title: 'No Conversations Yet',
        subtitle: 'Connect with nearby devices to start chatting',
        action: () => router.push('/(tabs)/nearby'),
        actionLabel: 'Find Nearby Users',
      },
      groups: {
        icon: 'account-group-outline',
        title: 'No Groups Yet',
        subtitle: 'Create a group to chat with multiple people at once',
        action: () => router.push('/create-group'),
        actionLabel: 'Create Group',
      },
      communities: {
        icon: 'home-group',
        title: 'No Communities Yet',
        subtitle: 'Create or join a community on your campus mesh',
        action: () => router.push('/create-community'),
        actionLabel: 'Create Community',
      },
    };
    const config = configs[tab];
    return (
      <View style={styles.emptyState}>
        <MaterialCommunityIcons
          name={config.icon as any}
          size={64}
          color={COLORS.border}
        />
        <Text style={styles.emptyTitle}>{config.title}</Text>
        <Text style={styles.emptySubtitle}>{config.subtitle}</Text>
        <TouchableOpacity style={styles.emptyAction} onPress={config.action}>
          <LinearGradient
            colors={COLORS.gradientPrimary as [string, string]}
            style={styles.emptyActionGradient}
          >
            <Text style={styles.emptyActionText}>{config.actionLabel}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(123,94,167,0.15)', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>B-Chat</Text>
        <View style={styles.headerActions}>
          {activeTab === 'groups' && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/create-group')}
            >
              <MaterialCommunityIcons
                name="account-group-outline"
                size={22}
                color={COLORS.text}
              />
            </TouchableOpacity>
          )}
          {activeTab === 'communities' && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/create-community')}
            >
              <MaterialCommunityIcons
                name="home-group"
                size={22}
                color={COLORS.text}
              />
            </TouchableOpacity>
          )}
{activeTab === 'all' && (
  <TouchableOpacity
    style={styles.headerButton}
    onPress={() => router.push('/(tabs)/status')}
  >
    <Feather name="camera" size={20} color={COLORS.text} />
  </TouchableOpacity>
)}
  <TouchableOpacity
   style={styles.headerButton}
  onPress={() => {
    Alert.alert('Options', '', [
      { text: 'New Group', onPress: () => router.push('/create-group') },
      { text: 'New Community', onPress: () => router.push('/create-community') },
      { text: 'Starred Messages', onPress: () => {} },
      { text: 'Mesh Diagnostics', onPress: () => router.push('/mesh-diagnostics') },
      { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }}
>
  <Feather name="more-vertical" size={20} color={COLORS.text} />
</TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={
            activeTab === 'all' ? 'Search conversations...'
            : activeTab === 'groups' ? 'Search groups...'
            : 'Search communities...'
          }
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Feather name="x" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {(['all', 'groups', 'communities'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[styles.tabText, activeTab === tab && styles.tabTextActive]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {tabCounts[tab] > 0 && (
              <View style={[
                styles.tabCount,
                activeTab === tab && styles.tabCountActive,
              ]}>
                <Text style={[
                  styles.tabCountText,
                  activeTab === tab && styles.tabCountTextActive,
                ]}>
                  {tabCounts[tab]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
{activeTab === 'all' && (
  filteredChats.length === 0 && archivedChats.length === 0
    ? renderEmpty('all')
    : (
      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatItem chat={item} currentUserId={currentUser?.id ?? ''} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          archivedChats.length > 0 ? (
            <TouchableOpacity
              style={styles.archivedRow}
              onPress={() => router.push('/archived-chats')}
            >
              <MaterialCommunityIcons name="archive-outline" size={20} color={COLORS.textSecondary} />
              <Text style={styles.archivedText}>
                Archived ({archivedChats.length})
              </Text>
              <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ) : null
        }
      />
    )
)}

      {activeTab === 'groups' && (
        filteredGroups.length === 0
          ? renderEmpty('groups')
          : (
            <FlatList
              data={filteredGroups}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <GroupItem group={item} />}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )
      )}

      {activeTab === 'communities' && (
        filteredCommunities.length === 0
          ? renderEmpty('communities')
          : (
            <FlatList
              data={filteredCommunities}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <CommunityItem community={item} />}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(tabs)/nearby')}
      >
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={styles.fabGradient}
        >
          <Feather name="edit-3" size={22} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
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
  headerTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  headerActions: { flexDirection: 'row', gap: SPACING.xs },
  headerButton: { padding: SPACING.sm },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.full,
    marginHorizontal: SPACING.xl, paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  searchInput: {
    flex: 1, color: COLORS.text, fontSize: 14,
    paddingVertical: 12, marginLeft: 8,
  },
  tabsRow: {
    flexDirection: 'row', paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md, gap: SPACING.sm,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
  },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  tabCount: {
    backgroundColor: COLORS.borderLight, borderRadius: 10,
    paddingHorizontal: 5, minWidth: 18, alignItems: 'center',
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabCountText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '700' },
  tabCountTextActive: { color: '#fff' },
  listContent: { paddingBottom: 100 },
  chatItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  avatarWrapper: { position: 'relative', marginRight: SPACING.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.card },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 2, borderColor: COLORS.background,
  },
  groupBadge: {
    position: 'absolute', bottom: 1, right: 1,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  communityBadge: {
    position: 'absolute', bottom: 1, right: 1,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.neonTeal, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  chatInfo: { flex: 1 },
  chatHeader: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3,
  },
  chatName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  chatTime: { fontSize: 12, color: COLORS.textMuted },
  chatFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  lastMessageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1,
  },
  lastMessage: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  badge: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full,
    minWidth: 20, height: 20, alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  memberCount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  memberCountText: { fontSize: 11, color: COLORS.textMuted },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl, paddingBottom: 80, gap: SPACING.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: {
    fontSize: 14, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 21,
  },
  emptyAction: { borderRadius: BORDER_RADIUS.full, overflow: 'hidden', marginTop: SPACING.sm },
  emptyActionGradient: {
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
  },
  archivedRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.md,
  paddingHorizontal: SPACING.xl,
  paddingVertical: SPACING.md,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.borderLight,
  backgroundColor: COLORS.surfaceElevated,
},
archivedText: {
  flex: 1,
  fontSize: 14,
  color: COLORS.textSecondary,
  fontWeight: '600',
},
  emptyActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 90, right: SPACING.xl,
    borderRadius: 28, overflow: 'hidden', elevation: 8,
  },
  fabGradient: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});

