import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Switch, Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { useMeshStore } from '@/store/meshStore';
import { DatabaseService } from '@/database/DatabaseService';
import { ChatTheme } from '@/types';

// ─── Preset wallpapers / themes ───────────────────────────────────────────────

const PRESET_THEMES: ChatTheme[] = [
  { id: 'default', name: 'Default Dark', wallpaperType: 'color', backgroundColor: '#080810', sentBubbleColor: '#2D1B69', receivedBubbleColor: '#1a1a2e', accentColor: '#7B5EA7' },
  { id: 'midnight', name: 'Midnight', wallpaperType: 'gradient', gradient: ['#0f0c29', '#302b63'], sentBubbleColor: '#1a237e', receivedBubbleColor: '#0d1b2a', accentColor: '#448aff' },
  { id: 'forest', name: 'Forest', wallpaperType: 'gradient', gradient: ['#0a2e1a', '#1b4332'], sentBubbleColor: '#1b5e20', receivedBubbleColor: '#0a3d1a', accentColor: '#4caf50' },
  { id: 'ocean', name: 'Ocean', wallpaperType: 'gradient', gradient: ['#001e3c', '#01579b'], sentBubbleColor: '#01579b', receivedBubbleColor: '#002244', accentColor: '#03a9f4' },
  { id: 'sunset', name: 'Sunset', wallpaperType: 'gradient', gradient: ['#1a0a00', '#3d1a00'], sentBubbleColor: '#bf360c', receivedBubbleColor: '#3e2723', accentColor: '#ff6d00' },
  { id: 'galaxy', name: 'Galaxy', wallpaperType: 'gradient', gradient: ['#0d0221', '#240046'], sentBubbleColor: '#6a1b9a', receivedBubbleColor: '#1a0033', accentColor: '#ce93d8' },
];

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingsRow({
  icon, iconColor = COLORS.primary, label, value, onPress, rightElement, hint,
}: {
  icon: string; iconColor?: string; label: string;
  value?: string; onPress?: () => void;
  rightElement?: React.ReactNode; hint?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.settingsRow}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.settingsRowIcon, { backgroundColor: iconColor + '22' }]}>
        <MaterialCommunityIcons name={icon as any} size={19} color={iconColor} />
      </View>
      <View style={styles.settingsRowInfo}>
        <Text style={styles.settingsRowLabel}>{label}</Text>
        {hint ? <Text style={styles.settingsRowHint}>{hint}</Text> : null}
      </View>
      {rightElement ?? (
        value !== undefined ? (
          <Text style={styles.settingsRowValue}>{value}</Text>
        ) : (
          onPress ? <Feather name="chevron-right" size={16} color={COLORS.textMuted} /> : null
        )
      )}
    </TouchableOpacity>
  );
}

// ─── Main settings screen ─────────────────────────────────────────────────────

export default function Settings() {
  const { currentUser, setCurrentUser, setOnboarded, updateCurrentUser, logout } = useAuthStore();
  const { isMeshActive, meshStatus } = useMeshStore();

  // Profile edit state
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState(currentUser?.name ?? '');
  const [editAbout, setEditAbout] = useState(currentUser?.about ?? '');
  const [editEmail, setEditEmail] = useState(currentUser?.email ?? '');
  const [editAvatar, setEditAvatar] = useState(currentUser?.avatar ?? '');
  const [isSaving, setIsSaving] = useState(false);

  // App settings state
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [meshEnabled, setMeshEnabled] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [autoDownload, setAutoDownload] = useState(true);

  // Wallpaper
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [selectedThemeId, setSelectedThemeId] = useState('default');

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.85,
    });
    if (!result.canceled) setEditAvatar(result.assets[0].uri);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Name Required', 'Your name cannot be empty.');
      return;
    }
    if (!currentUser) return;
    setIsSaving(true);

    try {
      const updated = {
        ...currentUser,
        name: editName.trim(),
        about: editAbout.trim() || undefined,
        email: editEmail.trim() || undefined,
        avatar: editAvatar,
      };
      await DatabaseService.saveUser(updated);
      updateCurrentUser(updated);
      setShowEditProfile(false);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Clear Profile',
      'This will remove your profile from this device. Your mesh data will be cleared. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  const handleExportWallpaper = async () => {
    const theme = PRESET_THEMES.find((t) => t.id === selectedThemeId);
    if (!theme || !currentUser) return;

    try {
      updateCurrentUser({ theme });
      await DatabaseService.saveUser({ ...currentUser, theme });
      Alert.alert(
        'Wallpaper Exported',
        `"${theme.name}" has been set as your global chat wallpaper. Open any chat to see it applied.`
      );
      setShowWallpaperPicker(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to apply wallpaper.');
    }
  };

  const handlePickCustomWallpaper = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any, quality: 0.9,
    });
    if (!result.canceled && currentUser) {
      const theme: ChatTheme = {
        id: 'custom',
        name: 'Custom',
        wallpaperType: 'image',
        wallpaper: result.assets[0].uri,
        sentBubbleColor: COLORS.messageSent,
        receivedBubbleColor: COLORS.messageReceived,
        accentColor: COLORS.primary,
      };
      updateCurrentUser({ theme });
      await DatabaseService.saveUser({ ...currentUser, theme });
      Alert.alert('Wallpaper Applied', 'Your custom wallpaper has been set for all chats.');
      setShowWallpaperPicker(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient
        colors={['rgba(123,94,167,0.1)', 'transparent']}
        style={styles.headerGradient}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Profile card */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => {
            setEditName(currentUser?.name ?? '');
            setEditAbout(currentUser?.about ?? '');
            setEditEmail(currentUser?.email ?? '');
            setEditAvatar(currentUser?.avatar ?? '');
            setShowEditProfile(true);
          }}
        >
          <LinearGradient
            colors={[COLORS.card, COLORS.surfaceElevated]}
            style={styles.profileCardInner}
          >
            <Image source={{ uri: currentUser?.avatar }} style={styles.profileAvatar} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{currentUser?.name ?? 'Your Name'}</Text>
              <Text style={styles.profileAbout} numberOfLines={1}>
                {currentUser?.about ?? 'Tap to edit profile'}
              </Text>
              <View style={styles.profileMeshStatus}>
                <View style={[
                  styles.meshDot,
                  { backgroundColor: isMeshActive ? COLORS.neonTeal : COLORS.offline },
                ]} />
                <Text style={styles.meshStatusText}>
                  {isMeshActive ? `Mesh: ${meshStatus}` : 'Mesh offline'}
                </Text>
              </View>
            </View>
            <View style={styles.profileEditBadge}>
              <Feather name="edit-2" size={14} color={COLORS.text} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Chats */}
        <SectionHeader title="Chats" />
        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="image-outline"
            iconColor={COLORS.neonPurple}
            label="Chat Wallpaper"
            hint="Apply a theme to all chats"
            onPress={() => setShowWallpaperPicker(true)}
          />
          <SettingsRow
            icon="check-all"
            iconColor={COLORS.neonBlue}
            label="Read Receipts"
            rightElement={
              <Switch
                value={readReceipts}
                onValueChange={setReadReceipts}
                trackColor={{ false: COLORS.card, true: COLORS.neonBlue }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="download-outline"
            iconColor={COLORS.neonTeal}
            label="Auto Download Media"
            rightElement={
              <Switch
                value={autoDownload}
                onValueChange={setAutoDownload}
                trackColor={{ false: COLORS.card, true: COLORS.neonTeal }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Notifications */}
        <SectionHeader title="Notifications" />
        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="bell-outline"
            iconColor={COLORS.neonOrange}
            label="Notifications"
            rightElement={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ false: COLORS.card, true: COLORS.neonOrange }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="volume-high"
            iconColor={COLORS.primary}
            label="Sound"
            rightElement={
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: COLORS.card, true: COLORS.primary }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Mesh */}
        <SectionHeader title="Mesh Network" />
        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="access-point-network"
            iconColor={COLORS.neonTeal}
            label="Mesh Networking"
            hint="Enable Bluetooth mesh relay"
            rightElement={
              <Switch
                value={meshEnabled}
                onValueChange={setMeshEnabled}
                trackColor={{ false: COLORS.card, true: COLORS.neonTeal }}
                thumbColor="#fff"
              />
            }
          />
          <SettingsRow
            icon="chart-line"
            iconColor={COLORS.neonBlue}
            label="Mesh Diagnostics"
            onPress={() => router.push('/mesh-diagnostics')}
          />
          <SettingsRow
  icon="pulse"
  iconColor={COLORS.neonTeal}
  label="Live Mesh Monitor"
  hint="Real-time BLE signal and packet viewer"
  onPress={() => router.push('/mesh-live')}
/>
          <SettingsRow
            icon="bluetooth"
            iconColor={COLORS.neonBlue}
            label="Bluetooth Status"
            value={isMeshActive ? 'Active' : 'Inactive'}
          />
        </View>

        {/* Privacy */}
        <SectionHeader title="Privacy & Security" />
        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="block-helper"
            iconColor={COLORS.error}
            label="Blocked Users"
            onPress={() => router.push('/blocked-users')}
          />
          <SettingsRow
            icon="shield-lock-outline"
            iconColor={COLORS.neonTeal}
            label="Encryption"
            value="AES-256 Active"
          />
          <SettingsRow
            icon="eye-off-outline"
            iconColor={COLORS.textMuted}
            label="Last Seen"
            value="Everyone"
            onPress={() => Alert.alert('Coming soon', 'Privacy controls coming in next update.')}
          />
        </View>

        {/* Storage */}
        <SectionHeader title="Storage" />
        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="database-outline"
            iconColor={COLORS.neonOrange}
            label="Manage Storage"
            onPress={() => Alert.alert('Storage', 'Storage management coming soon.')}
          />
          <SettingsRow
            icon="delete-sweep-outline"
            iconColor={COLORS.error}
            label="Clear Cache"
            onPress={() => {
              Alert.alert('Clear Cache', 'This will remove cached files. Continue?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear',
                  style: 'destructive',
                  onPress: async () => {
                    await DatabaseService.cleanupExpiredData();
                    Alert.alert('Done', 'Cache cleared successfully.');
                  },
                },
              ]);
            }}
          />
        </View>

        {/* About */}
        <SectionHeader title="About" />
        <View style={styles.settingsGroup}>
          <SettingsRow
            icon="information-outline"
            iconColor={COLORS.primary}
            label="About B-Chat"
            onPress={() => router.push('/about')}
          />
          <SettingsRow
            icon="code-tags"
            iconColor={COLORS.neonPurple}
            label="Developer"
            value="David Briggs"
            onPress={() => router.push('/about')}
          />
          <SettingsRow
            icon="tag-outline"
            iconColor={COLORS.textMuted}
            label="Version"
            value="1.0.0"
          />
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <MaterialCommunityIcons name="logout" size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>Clear Profile & Reset App</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Edit profile modal */}
      <Modal visible={showEditProfile} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditProfile(false)}>
              <Feather name="x" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSaveProfile} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.saveBtn}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.editAvatarWrapper} onPress={pickAvatar}>
              <Image source={{ uri: editAvatar }} style={styles.editAvatar} />
              <View style={styles.editAvatarBadge}>
                <Feather name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>

            {[
              { label: 'Full Name *', value: editName, setter: setEditName, placeholder: 'Your name' },
              { label: 'Email', value: editEmail, setter: setEditEmail, placeholder: 'your@email.com', keyboard: 'email-address' },
            ].map((field) => (
              <View key={field.label} style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>{field.label}</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={field.placeholder}
                  placeholderTextColor={COLORS.textMuted}
                  value={field.value}
                  onChangeText={field.setter}
                  keyboardType={(field.keyboard as any) ?? 'default'}
                  autoCapitalize={field.label === 'Email' ? 'none' : 'words'}
                />
              </View>
            ))}

            <View style={styles.modalField}>
              <Text style={styles.modalFieldLabel}>About</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                placeholder="Something about you..."
                placeholderTextColor={COLORS.textMuted}
                value={editAbout}
                onChangeText={setEditAbout}
                multiline
                numberOfLines={3}
                maxLength={150}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Wallpaper picker modal */}
      <Modal visible={showWallpaperPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowWallpaperPicker(false)}>
              <Feather name="x" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Chat Wallpaper</Text>
            <TouchableOpacity onPress={handleExportWallpaper}>
              <Text style={styles.saveBtn}>Apply</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.wallpaperGrid} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.customWallpaperRow} onPress={handlePickCustomWallpaper}>
              <MaterialCommunityIcons name="image-plus" size={22} color={COLORS.primary} />
              <Text style={styles.customWallpaperText}>Choose Custom Image from Gallery</Text>
              <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            <Text style={styles.wallpaperSectionLabel}>Preset Themes</Text>

            <View style={styles.wallpaperPresetGrid}>
              {PRESET_THEMES.map((theme) => (
                <TouchableOpacity
                  key={theme.id}
                  style={[
                    styles.wallpaperCard,
                    selectedThemeId === theme.id && styles.wallpaperCardSelected,
                  ]}
                  onPress={() => setSelectedThemeId(theme.id)}
                >
                  <LinearGradient
                    colors={
                      theme.gradient
                        ? (theme.gradient as [string, string])
                        : [theme.backgroundColor ?? '#000', theme.backgroundColor ?? '#000']
                    }
                    style={styles.wallpaperPreview}
                  >
                    <View style={[styles.previewBubbleSent, { backgroundColor: theme.sentBubbleColor }]}>
                      <View style={styles.previewBubbleBar} />
                    </View>
                    <View style={[styles.previewBubbleReceived, { backgroundColor: theme.receivedBubbleColor }]}>
                      <View style={styles.previewBubbleBar} />
                    </View>
                  </LinearGradient>
                  {selectedThemeId === theme.id && (
                    <View style={[styles.wallpaperCheck, { backgroundColor: theme.accentColor }]}>
                      <Feather name="check" size={12} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.wallpaperName}>{theme.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  content: { paddingBottom: 60 },
  profileCard: { marginHorizontal: SPACING.xl, marginBottom: SPACING.xl, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  profileCardInner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: BORDER_RADIUS.xl,
  },
  profileAvatar: { width: 62, height: 62, borderRadius: 31 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  profileAbout: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  profileMeshStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meshDot: { width: 7, height: 7, borderRadius: 4 },
  meshStatusText: { fontSize: 11, color: COLORS.textMuted },
  profileEditBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm, marginTop: SPACING.sm,
  },
  settingsGroup: {
    marginHorizontal: SPACING.xl, marginBottom: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  settingsRowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  settingsRowInfo: { flex: 1 },
  settingsRowLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  settingsRowHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  settingsRowValue: { fontSize: 13, color: COLORS.textSecondary },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.md, marginHorizontal: SPACING.xl, marginTop: SPACING.lg,
    marginBottom: SPACING.xl, backgroundColor: COLORS.error + '15',
    borderRadius: BORDER_RADIUS.xl, paddingVertical: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.error + '33',
  },
  logoutText: { color: COLORS.error, fontWeight: '700', fontSize: 15 },
  // Modals
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  saveBtn: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
  modalContent: { padding: SPACING.xl, paddingBottom: 60 },
  editAvatarWrapper: { alignSelf: 'center', marginBottom: SPACING.xl, position: 'relative' },
  editAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.primary },
  editAvatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.background,
  },
  modalField: { marginBottom: SPACING.xl },
  modalFieldLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textSecondary,
    marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  modalInputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  // Wallpaper
  wallpaperGrid: { padding: SPACING.xl, paddingBottom: 60 },
  customWallpaperRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg, marginBottom: SPACING.xl,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  customWallpaperText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  wallpaperSectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.lg,
  },
  wallpaperPresetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md },
  wallpaperCard: {
    width: '47%', borderRadius: BORDER_RADIUS.lg, overflow: 'hidden',
    borderWidth: 2, borderColor: COLORS.borderLight, position: 'relative',
  },
  wallpaperCardSelected: { borderColor: COLORS.primary },
  wallpaperPreview: { height: 110, padding: SPACING.sm, gap: SPACING.sm, justifyContent: 'flex-end' },
  previewBubbleSent: { alignSelf: 'flex-end', borderRadius: 10, padding: 7, maxWidth: '70%' },
  previewBubbleReceived: { alignSelf: 'flex-start', borderRadius: 10, padding: 7, maxWidth: '70%' },
  previewBubbleBar: { width: 44, height: 4, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2 },
  wallpaperCheck: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  wallpaperName: {
    fontSize: 12, fontWeight: '600', color: COLORS.text,
    padding: SPACING.sm, backgroundColor: COLORS.card,
  },
});
