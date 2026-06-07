import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import uuid from 'react-native-uuid';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useChatStore } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';
import { Group } from '@/types';

export default function CreateGroup() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [autoRelay, setAutoRelay] = useState(false);
  const [disappearing, setDisappearing] = useState(false);
  const [whoCanSend, setWhoCanSend] = useState<'everyone' | 'admins'>('everyone');
  const { communityId } = useLocalSearchParams<{ communityId?: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const { currentUser } = useAuthStore();
  const { addOrUpdateGroup } = useChatStore();

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.85,
    });
    if (!result.canceled) setAvatar(result.assets[0].uri);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Group Name Required', 'Please enter a name for your group.');
      return;
    }
    if (!currentUser) return;
    setIsLoading(true);

    try {
      const group: Group = {
        id: uuid.v4() as string,
        name: name.trim(),
        description: description.trim(),
        avatar: avatar ?? `https://api.dicebear.com/7.x/identicon/png?seed=${name}`,
        members: [{
          userId: currentUser.id,
          role: 'admin',
          joinedAt: Date.now(),
          addedBy: currentUser.id,
        }],
        admins: [currentUser.id],
        createdBy: currentUser.id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPublic,
        settings: {
          whoCanSendMessages: whoCanSend,
          whoCanAddMembers: 'admins',
          whoCanEditInfo: 'admins',
          disappearingMessages: disappearing ? 86400000 : 0,
          autoRelayShare: autoRelay,
        },
      };
      await DatabaseService.saveGroup(group);
      addOrUpdateGroup(group);
      await DatabaseService.createChat({
  id: `group:${group.id}`,
  participants: group.members.map(m => m.userId),

  lastMessageId: null,

  unreadCount: 0,

  isPinned: false,
  isArchived: false,
  isMuted: false,
  isBlocked: false,

  wallpaper: null,
  themeData: null,
  meshRouteId: null,

  createdAt: Date.now(),
  updatedAt: Date.now(),
});
      if (communityId) {
  await DatabaseService.addGroupToCommunity(communityId, group.id);
}
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to create group. Please try again.');
      console.error('[CreateGroup]', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(123,94,167,0.12)', 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="x" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Group</Text>
        <TouchableOpacity onPress={handleCreate} disabled={isLoading} style={styles.headerBtn}>
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <LinearGradient
              colors={COLORS.gradientPrimary as [string, string]}
              style={styles.createChip}
            >
              <Text style={styles.createChipText}>Create</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar picker */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.groupAvatar} />
            ) : (
              <LinearGradient
                colors={[COLORS.card, COLORS.surfaceElevated]}
                style={styles.avatarPlaceholder}
              >
                <MaterialCommunityIcons
                  name="camera-plus-outline"
                  size={32}
                  color={COLORS.textMuted}
                />
                <Text style={styles.avatarPlaceholderText}>Add Photo</Text>
              </LinearGradient>
            )}
            <View style={styles.avatarBadge}>
              <Feather name="edit-2" size={13} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Group photo (optional)</Text>
        </View>

        {/* Basic info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Group Info</Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Group Name *</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Enter group name..."
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                maxLength={50}
              />
              <Text style={styles.charCount}>{name.length}/50</Text>
            </View>
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="What is this group about?"
              placeholderTextColor={COLORS.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={300}
            />
            <Text style={[styles.charCount, { alignSelf: 'flex-end' }]}>
              {description.length}/300
            </Text>
          </View>
        </View>

        {/* Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Permissions</Text>

          {[
            {
              icon: 'earth',
              label: 'Public Group',
              hint: 'Anyone on the mesh can find and join',
              value: isPublic,
              setter: setIsPublic,
              color: COLORS.neonBlue,
            },
            {
              icon: 'access-point',
              label: 'Auto Relay Share',
              hint: 'Files auto-propagate to all members via mesh',
              value: autoRelay,
              setter: setAutoRelay,
              color: COLORS.neonTeal,
            },
            {
              icon: 'timer-outline',
              label: 'Disappearing Messages',
              hint: 'Messages delete after 24 hours',
              value: disappearing,
              setter: setDisappearing,
              color: COLORS.neonOrange,
            },
          ].map((item) => (
            <View key={item.label} style={styles.settingRow}>
              <View style={[styles.settingIcon, { backgroundColor: item.color + '22' }]}>
                <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>{item.label}</Text>
                <Text style={styles.settingHint}>{item.hint}</Text>
              </View>
              <Switch
                value={item.value}
                onValueChange={item.setter}
                trackColor={{ false: COLORS.card, true: item.color }}
                thumbColor="#fff"
              />
            </View>
          ))}

          {/* Who can send */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Who Can Send Messages</Text>
            <View style={styles.chipRowInline}>
              {(['everyone', 'admins'] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, whoCanSend === opt && styles.chipActive]}
                  onPress={() => setWhoCanSend(opt)}
                >
                  <Text style={[styles.chipText, whoCanSend === opt && styles.chipTextActive]}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <View style={styles.previewCard}>
            <Image
              source={{ uri: avatar ?? `https://api.dicebear.com/7.x/identicon/png?seed=${name || 'group'}` }}
              style={styles.previewAvatar}
            />
            <View style={styles.previewInfo}>
              <Text style={styles.previewName}>{name || 'Group Name'}</Text>
              <Text style={styles.previewDesc} numberOfLines={1}>
                {description || 'Group description...'}
              </Text>
              <View style={styles.previewMeta}>
                {isPublic ? (
                  <MaterialCommunityIcons name="earth" size={12} color={COLORS.neonBlue} />
                ) : (
                  <Feather name="lock" size={12} color={COLORS.textMuted} />
                )}
                <Text style={styles.previewMetaText}>
                  {isPublic ? 'Public' : 'Private'} • 1 member
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  headerBtn: { padding: SPACING.xs },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  createChip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  createChipText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  content: { padding: SPACING.xl, paddingBottom: 60 },
  avatarSection: { alignItems: 'center', marginBottom: SPACING.xxl },
  avatarWrapper: { position: 'relative', marginBottom: SPACING.sm },
  groupAvatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', gap: 4,
  },
  avatarPlaceholderText: { color: COLORS.textMuted, fontSize: 12 },
  avatarBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  avatarHint: { fontSize: 12, color: COLORS.textMuted },
  section: { marginBottom: SPACING.xxl },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.lg,
  },
  inputWrapper: { marginBottom: SPACING.lg },
  inputLabel: {
    fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: SPACING.lg,
  },
  input: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 14 },
  inputMultiline: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    minHeight: 90, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: COLORS.textMuted },
  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  settingIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  settingHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  chipRowInline: { flexDirection: 'row', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  previewCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight, gap: SPACING.md,
  },
  previewAvatar: { width: 52, height: 52, borderRadius: 26 },
  previewInfo: { flex: 1 },
  previewName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  previewDesc: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  previewMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  previewMetaText: { fontSize: 11, color: COLORS.textMuted },
});
