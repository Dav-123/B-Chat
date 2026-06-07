import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Modal, TextInput, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';
import { Status } from '@/types';
import uuid from 'react-native-uuid';

const BG_COLORS = [
  '#1a0a3d', '#0a2e1a', '#1a0a00',
  '#001e3c', '#0d0221', '#1a1a2e',
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function avatarUri(seed: string) {
  return `https://api.dicebear.com/7.x/avataaars/png?seed=${seed}`;
}

function timeLeft(expiresAt: number) {
  const ms = Math.max(0, expiresAt - Date.now());
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

// ─── StatusRing ───────────────────────────────────────────────────────────────

function StatusRing({
  status,
  size = 52,
  onPress,
  avatarSeed,
}: {
  status?: Status;
  size?: number;
  onPress: () => void;
  avatarSeed?: string;
}) {
  const hasStatus = !!status && status.expiresAt > Date.now();
  return (
    <TouchableOpacity onPress={onPress} style={styles.statusRingWrapper}>
      <LinearGradient
        colors={hasStatus
          ? [COLORS.neonTeal, COLORS.primary]
          : [COLORS.borderLight, COLORS.borderLight]}
        style={[styles.statusRing, { width: size + 6, height: size + 6, borderRadius: (size + 6) / 2 }]}
      >
        <View style={[styles.statusRingInner, { width: size, height: size, borderRadius: size / 2 }]}>
          {status?.type === 'image' && status.mediaUrl ? (
            <Image source={{ uri: status.mediaUrl }} style={styles.statusAvatar} />
          ) : status?.type === 'text' ? (
            <View style={[styles.statusAvatar, { backgroundColor: status.backgroundColor ?? COLORS.primary }]}>
              <Text style={styles.statusTextPreview} numberOfLines={1}>
                {status.content.slice(0, 2)}
              </Text>
            </View>
          ) : (
            <Image source={{ uri: avatarUri(avatarSeed ?? 'me') }} style={styles.statusAvatar} />
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── StatusItem (others list) ─────────────────────────────────────────────────

function StatusItem({
  status,
  displayName,
  onPress,
}: {
  status: Status;
  displayName: string;
  onPress: () => void;
}) {
  if (status.expiresAt < Date.now()) return null;

  return (
    <TouchableOpacity style={styles.statusItem} onPress={onPress} activeOpacity={0.8}>
      <StatusRing status={status} size={48} onPress={onPress} avatarSeed={status.userId} />
      <View style={styles.statusInfo}>
        <Text style={styles.statusName}>{displayName}</Text>
        <Text style={styles.statusTime}>{timeLeft(status.expiresAt)}</Text>
      </View>
      <View style={styles.viewCountRow}>
        <Feather name="eye" size={13} color={COLORS.textMuted} />
        <Text style={styles.statusViewCount}>
          {status.views.length}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── ViewerRow (inside my-status viewer) ─────────────────────────────────────

function ViewerRow({ viewerId }: { viewerId: string }) {
  return (
    <View style={styles.viewerRow}>
      <Image source={{ uri: avatarUri(viewerId) }} style={styles.viewerAvatar} />
      <Text style={styles.viewerName}>{viewerId.slice(0, 16)}</Text>
      <Feather name="eye" size={14} color={COLORS.neonTeal} style={{ marginLeft: 'auto' }} />
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StatusTab() {
  const { currentUser } = useAuthStore();

  const [statuses, setStatuses]           = useState<Status[]>([]);
  const [showCreate, setShowCreate]       = useState(false);
  const [newText, setNewText]             = useState('');
  const [selectedBg, setSelectedBg]       = useState(BG_COLORS[0]);
  const [viewingStatus, setViewingStatus] = useState<Status | null>(null);
  // index into myStatuses when browsing own statuses
  const [myStatusIndex, setMyStatusIndex] = useState(0);
  const [showMyStatuses, setShowMyStatuses] = useState(false);

  // ── Load from DB on mount ──────────────────────────────────────────────────

  const loadStatuses = useCallback(async () => {
    try {
      const db = DatabaseService as any;
      // Use the DB method if it exists, fall back gracefully
      if (typeof db.getStatuses === 'function') {
        const rows: Status[] = await db.getStatuses();
        setStatuses(rows.filter((s) => s.expiresAt > Date.now()));
      }
    } catch (e) {
      console.error('[StatusTab] loadStatuses:', e);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const myStatuses = statuses
    .filter((s) => s.userId === currentUser?.id && s.expiresAt > Date.now())
    .sort((a, b) => b.createdAt - a.createdAt);

  const othersStatuses = statuses
    .filter((s) => s.userId !== currentUser?.id && s.expiresAt > Date.now())
    .sort((a, b) => b.createdAt - a.createdAt);

  // The "latest" own status shown in the ring
  const latestMyStatus = myStatuses[0];

  // ── Persist a new status ───────────────────────────────────────────────────

  const persistStatus = async (status: Status) => {
    setStatuses((prev) => [status, ...prev]);
    try {
      const db = DatabaseService as any;
      if (typeof db.saveStatus === 'function') {
        await db.saveStatus(status);
      }
    } catch (e) {
      console.error('[StatusTab] persistStatus:', e);
    }
  };

  // ── Create text status ─────────────────────────────────────────────────────

  const createTextStatus = async () => {
    if (!newText.trim() || !currentUser) return;
    const status: Status = {
      id: uuid.v4() as string,
      userId: currentUser.id,
      type: 'text',
      content: newText.trim(),
      backgroundColor: selectedBg,
      textColor: '#ffffff',
      views: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
    };
    await persistStatus(status);
    setNewText('');
    setShowCreate(false);
  };

  // ── Pick image status ──────────────────────────────────────────────────────

  const pickImageStatus = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      quality: 0.85,
    });
    if (!result.canceled && currentUser) {
      const status: Status = {
        id: uuid.v4() as string,
        userId: currentUser.id,
        type: 'image',
        content: '',
        mediaUrl: result.assets[0].uri,
        views: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 86_400_000,
      };
      await persistStatus(status);
    }
  };

  // ── Record a view on someone else's status ─────────────────────────────────

  const recordView = async (status: Status) => {
    if (!currentUser) return;
    const alreadyViewed = status.views.includes(currentUser.id);
    if (alreadyViewed) return;

    const updatedViews = [...status.views, currentUser.id];
    const updatedStatus: Status = { ...status, views: updatedViews };

    setStatuses((prev) =>
      prev.map((s) => (s.id === status.id ? updatedStatus : s))
    );

    try {
      const db = DatabaseService as any;
      if (typeof db.addStatusView === 'function') {
        await db.addStatusView(status.id, currentUser.id);
      } else if (typeof db.saveStatus === 'function') {
        await db.saveStatus(updatedStatus);
      }
    } catch (e) {
      console.error('[StatusTab] recordView:', e);
    }
  };

  // ── Open a status to view it ───────────────────────────────────────────────

  const openStatus = (status: Status) => {
    setViewingStatus(status);
    // Record view for others' statuses
    if (status.userId !== currentUser?.id) {
      recordView(status);
    }
  };

  // ── Tap own status ring ────────────────────────────────────────────────────

  const handleMyStatusPress = () => {
    if (myStatuses.length > 0) {
      setMyStatusIndex(0);
      setShowMyStatuses(true);
    } else {
      setShowCreate(true);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(50,215,75,0.08)', 'transparent']}
        style={styles.headerGradient}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Status</Text>
        <TouchableOpacity style={styles.headerBtn}>
          <Feather name="more-vertical" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={othersStatuses}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={() => (
          <View>
            {/* My status row */}
            <View style={styles.myStatusSection}>
              <View style={styles.myStatusRow}>
                <StatusRing
                  status={latestMyStatus}
                  size={54}
                  onPress={handleMyStatusPress}
                  avatarSeed={currentUser?.id ?? 'me'}
                />
                <View style={styles.myStatusInfo}>
                  <Text style={styles.myStatusTitle}>My Status</Text>
                  <Text style={styles.myStatusSub}>
                    {myStatuses.length > 0
                      ? `${myStatuses.length} update${myStatuses.length > 1 ? 's' : ''} • tap to view`
                      : 'Tap to add status update'}
                  </Text>
                </View>
                <View style={styles.myStatusActions}>
                  <TouchableOpacity style={styles.myStatusBtn} onPress={() => setShowCreate(true)}>
                    <Feather name="edit-3" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.myStatusBtn} onPress={pickImageStatus}>
                    <Feather name="camera" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {othersStatuses.length > 0 && (
              <Text style={styles.sectionLabel}>Recent Updates</Text>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <StatusItem
            status={item}
            displayName={item.userId.slice(0, 14)}
            onPress={() => openStatus(item)}
          />
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="circle-outline" size={64} color={COLORS.border} />
            <Text style={styles.emptyTitle}>No Status Updates</Text>
            <Text style={styles.emptySubtitle}>
              Status updates from nearby mesh users appear here and expire after 24 hours
            </Text>
            <TouchableOpacity style={styles.addStatusBtn} onPress={() => setShowCreate(true)}>
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                style={styles.addStatusGradient}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.addStatusText}>Add Status</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <LinearGradient
          colors={COLORS.gradientPrimary as [string, string]}
          style={styles.fabGradient}
        >
          <Feather name="plus" size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Create text status modal ── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.createContainer}>
          <View style={styles.createHeader}>
            <TouchableOpacity onPress={() => setShowCreate(false)}>
              <Feather name="x" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.createTitle}>New Status</Text>
            <TouchableOpacity onPress={createTextStatus}>
              <LinearGradient
                colors={COLORS.gradientPrimary as [string, string]}
                style={styles.sendStatusChip}
              >
                <Text style={styles.sendStatusText}>Share</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={[styles.statusPreview, { backgroundColor: selectedBg }]}>
            <Text style={styles.statusPreviewText}>
              {newText || 'Type something...'}
            </Text>
          </View>

          <View style={styles.createInput}>
            <TextInput
              style={styles.statusInput}
              placeholder="What's on your mind?"
              placeholderTextColor={COLORS.textMuted}
              value={newText}
              onChangeText={setNewText}
              multiline
              maxLength={200}
              autoFocus
            />
          </View>

          <View style={styles.bgPickerSection}>
            <Text style={styles.bgPickerLabel}>Background</Text>
            <View style={styles.bgPicker}>
              {BG_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[styles.bgOption, { backgroundColor: color }, selectedBg === color && styles.bgOptionSelected]}
                  onPress={() => setSelectedBg(color)}
                >
                  {selectedBg === color && <Feather name="check" size={14} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.imageStatusOption} onPress={() => {
            setShowCreate(false);
            pickImageStatus();
          }}>
            <MaterialCommunityIcons name="image-outline" size={20} color={COLORS.primary} />
            <Text style={styles.imageStatusOptionText}>Use Photo Instead</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* ── View my own statuses modal ── */}
      <Modal
        visible={showMyStatuses}
        animationType="fade"
        onRequestClose={() => setShowMyStatuses(false)}
      >
        {myStatuses.length > 0 && (
          <View style={styles.viewStatusContainer}>
            {/* Background */}
            {myStatuses[myStatusIndex]?.type === 'image' && myStatuses[myStatusIndex]?.mediaUrl ? (
              <Image
                source={{ uri: myStatuses[myStatusIndex].mediaUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            ) : (
              <LinearGradient
                colors={[myStatuses[myStatusIndex]?.backgroundColor ?? COLORS.primary, COLORS.background]}
                style={StyleSheet.absoluteFill}
              />
            )}

            {myStatuses[myStatusIndex]?.type === 'text' && (
              <View style={styles.viewStatusTextWrapper}>
                <Text style={styles.viewStatusText}>{myStatuses[myStatusIndex].content}</Text>
              </View>
            )}

            <SafeAreaView style={styles.viewStatusOverlay}>
              {/* Progress bars */}
              <View style={styles.progressBars}>
                {myStatuses.map((_, i) => (
                  <View key={i} style={[styles.progressBar, { flex: 1 }]}>
                    <View style={[styles.progressBarFill, i <= myStatusIndex && styles.progressBarActive]} />
                  </View>
                ))}
              </View>

              {/* Header */}
              <View style={styles.viewStatusUser}>
                <Image source={{ uri: avatarUri(currentUser?.id ?? 'me') }} style={styles.viewStatusAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.viewStatusName}>{currentUser?.name ?? 'Me'}</Text>
                  <Text style={styles.viewStatusTime}>{timeLeft(myStatuses[myStatusIndex]?.expiresAt ?? 0)}</Text>
                </View>
                <TouchableOpacity style={styles.viewStatusClose} onPress={() => setShowMyStatuses(false)}>
                  <Feather name="x" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Navigate between own statuses */}
              <View style={styles.navRow}>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => setMyStatusIndex((i) => Math.max(0, i - 1))}
                />
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => {
                    if (myStatusIndex < myStatuses.length - 1) {
                      setMyStatusIndex((i) => i + 1);
                    } else {
                      setShowMyStatuses(false);
                    }
                  }}
                />
              </View>

              {/* Viewers list at bottom */}
              <View style={styles.viewersList}>
                <View style={styles.viewersHeader}>
                  <Feather name="eye" size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.viewersCount}>
                    {myStatuses[myStatusIndex]?.views.length ?? 0} viewer{myStatuses[myStatusIndex]?.views.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <ScrollView style={{ maxHeight: 160 }}>
                  {(myStatuses[myStatusIndex]?.views ?? []).map((viewerId) => (
                    <ViewerRow key={viewerId} viewerId={viewerId} />
                  ))}
                </ScrollView>
              </View>
            </SafeAreaView>
          </View>
        )}
      </Modal>

      {/* ── View others' status modal ── */}
      {viewingStatus && (
        <Modal
          visible={!!viewingStatus}
          animationType="fade"
          onRequestClose={() => setViewingStatus(null)}
        >
          <View style={styles.viewStatusContainer}>
            {viewingStatus.type === 'image' && viewingStatus.mediaUrl ? (
              <Image
                source={{ uri: viewingStatus.mediaUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
            ) : (
              <LinearGradient
                colors={[viewingStatus.backgroundColor ?? COLORS.primary, COLORS.background]}
                style={StyleSheet.absoluteFill}
              />
            )}

            {viewingStatus.type === 'text' && (
              <View style={styles.viewStatusTextWrapper}>
                <Text style={styles.viewStatusText}>{viewingStatus.content}</Text>
              </View>
            )}

            <SafeAreaView style={styles.viewStatusOverlay}>
              <View style={styles.viewStatusHeader}>
                <View style={styles.viewStatusProgress}>
                  <View style={styles.viewStatusProgressFill} />
                </View>
                <View style={styles.viewStatusUser}>
                  <Image
                    source={{ uri: avatarUri(viewingStatus.userId) }}
                    style={styles.viewStatusAvatar}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.viewStatusName}>{viewingStatus.userId.slice(0, 14)}</Text>
                    <View style={styles.meshBadge}>
                      <MaterialCommunityIcons name="bluetooth" size={10} color={COLORS.neonBlue} />
                      <Text style={styles.meshBadgeText}>via mesh</Text>
                    </View>
                  </View>
                  {/* Viewed indicator — shows current user has seen this */}
                  <View style={styles.viewedBadge}>
                    <Feather name="eye" size={12} color={COLORS.neonTeal} />
                    <Text style={styles.viewedBadgeText}>Viewed</Text>
                  </View>
                  <TouchableOpacity style={styles.viewStatusClose} onPress={() => setViewingStatus(null)}>
                    <Feather name="x" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  headerBtn: { padding: SPACING.sm },

  myStatusSection: {
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    marginBottom: SPACING.md,
  },
  myStatusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  statusRingWrapper: {},
  statusRing: { padding: 3, alignItems: 'center', justifyContent: 'center' },
  statusRingInner: { overflow: 'hidden', backgroundColor: COLORS.card },
  statusAvatar: { width: '100%', height: '100%' },
  statusTextPreview: { fontSize: 18, fontWeight: '800', color: '#fff' },
  myStatusInfo: { flex: 1 },
  myStatusTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  myStatusSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  myStatusActions: { flexDirection: 'row', gap: SPACING.sm },
  myStatusBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.borderLight,
  },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.md,
  },

  statusItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  statusInfo: { flex: 1 },
  statusName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  statusTime: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  viewCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusViewCount: { fontSize: 12, color: COLORS.textMuted },

  listContent: { paddingBottom: 100 },

  emptyState: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.xxxl, gap: SPACING.md,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 21 },
  addStatusBtn: { borderRadius: BORDER_RADIUS.full, overflow: 'hidden', marginTop: SPACING.sm },
  addStatusGradient: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  addStatusText: { color: '#fff', fontWeight: '700' },

  fab: {
    position: 'absolute', bottom: 90, right: SPACING.xl,
    borderRadius: 28, overflow: 'hidden', elevation: 8,
  },
  fabGradient: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },

  // Create modal
  createContainer: { flex: 1, backgroundColor: COLORS.background },
  createHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  createTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  sendStatusChip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full,
  },
  sendStatusText: { color: '#fff', fontWeight: '700' },
  statusPreview: {
    height: 200, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  statusPreviewText: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center' },
  createInput: { padding: SPACING.xl },
  statusInput: { color: COLORS.text, fontSize: 16, minHeight: 80, textAlignVertical: 'top' },
  bgPickerSection: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  bgPickerLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.md,
  },
  bgPicker: { flexDirection: 'row', gap: SPACING.md },
  bgOption: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  bgOptionSelected: { borderColor: '#fff' },
  imageStatusOption: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    marginHorizontal: SPACING.xl, backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  imageStatusOptionText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },

  // View status (shared)
  viewStatusContainer: { flex: 1, backgroundColor: '#000' },
  viewStatusTextWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  viewStatusText: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  viewStatusOverlay: { flex: 1 },
  viewStatusHeader: { padding: SPACING.xl },
  viewStatusProgress: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2, marginBottom: SPACING.lg, overflow: 'hidden',
  },
  viewStatusProgressFill: { height: '100%', width: '100%', backgroundColor: '#fff' },
  viewStatusUser: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md,
  },
  viewStatusAvatar: { width: 38, height: 38, borderRadius: 19 },
  viewStatusName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  viewStatusTime: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  meshBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  meshBadgeText: { fontSize: 10, color: 'rgba(255,255,255,0.7)' },
  viewedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,255,200,0.15)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  viewedBadgeText: { fontSize: 11, color: COLORS.neonTeal, fontWeight: '600' },
  viewStatusClose: { padding: 4 },

  // Progress bars (my statuses)
  progressBars: {
    flexDirection: 'row', gap: 3,
    paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg, paddingBottom: SPACING.md,
  },
  progressBar: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2, overflow: 'hidden',
  },
  progressBarFill: { height: '100%', width: '100%', backgroundColor: 'transparent' },
  progressBarActive: { backgroundColor: '#fff' },

  // Navigation tap zones
  navRow: {
    position: 'absolute', top: 80, left: 0, right: 0, bottom: 120,
    flexDirection: 'row',
  },
  navBtn: { flex: 1 },

  // Viewers list
  viewersList: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: SPACING.lg,
  },
  viewersHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md },
  viewersCount: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  viewerRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  viewerAvatar: { width: 32, height: 32, borderRadius: 16 },
  viewerName: { fontSize: 13, color: '#fff', fontWeight: '600' },
});	
