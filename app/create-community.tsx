import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import uuid from 'react-native-uuid';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { Community } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';

const COMMUNITY_CATEGORIES = [
  'Education', 'Technology', 'Sports', 'Arts',
  'Business', 'Health', 'Social', 'Other',
];

export default function CreateCommunity() {
  const { currentUser } = useAuthStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [category, setCategory] = useState('Other');
  const [rules, setRules] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.85,
    });
    if (!result.canceled) setAvatar(result.assets[0].uri);
  };

  const pickBanner = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true, aspect: [16, 9] as [number, number], quality: 0.85,
    });
    if (!result.canceled) setBanner(result.assets[0].uri);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a community name.');
      return;
    }
    if (!currentUser) return;
    setIsLoading(true);

    try {
      const community: Community = {
        id: uuid.v4() as string,
        name: name.trim(),
        description: description.trim(),
        avatar: avatar ?? `https://api.dicebear.com/7.x/identicon/png?seed=${name}`,
        banner: banner ?? undefined,
        owner: currentUser.id,
        admins: [currentUser.id],
        groups: [],
        members: [currentUser.id],
        isPublic,
        category,
        rules: rules.trim() || undefined,
        createdAt: Date.now(),
      };

      await DatabaseService.saveCommunity(community);
      Alert.alert('Community Created!', `"${name}" is now live on the mesh.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Failed to create community. Please try again.');
      console.error('[CreateCommunity]', e);
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

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Community</Text>
        <TouchableOpacity onPress={handleCreate} disabled={isLoading}>
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
        {/* Banner */}
        <TouchableOpacity style={styles.bannerPicker} onPress={pickBanner}>
          {banner ? (
            <Image source={{ uri: banner }} style={styles.bannerImage} />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <MaterialCommunityIcons name="image-plus" size={28} color={COLORS.textMuted} />
              <Text style={styles.bannerPlaceholderText}>Add Banner Image</Text>
            </View>
          )}
          <View style={styles.bannerEditBtn}>
            <Feather name="edit-2" size={14} color="#fff" />
          </View>
        </TouchableOpacity>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.communityAvatar} />
            ) : (
              <LinearGradient
                colors={[COLORS.primary, COLORS.neonPurple]}
                style={styles.communityAvatar}
              >
                <MaterialCommunityIcons name="account-group" size={36} color="#fff" />
              </LinearGradient>
            )}
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={13} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Fields */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Community Info</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Community Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Computer Science 300 Level"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              maxLength={60}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="What is this community about?"
              placeholderTextColor={COLORS.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={400}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Rules (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Community rules and guidelines..."
              placeholderTextColor={COLORS.textMuted}
              value={rules}
              onChangeText={setRules}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Category</Text>
          <View style={styles.chipGrid}>
            {COMMUNITY_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, category === cat && styles.chipActive]}
                onPress={() => setCategory(cat)}
              >
                <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility</Text>
          <View style={styles.visibilityRow}>
            {[
              { label: 'Public', icon: 'earth', value: true, hint: 'Anyone on mesh can join' },
              { label: 'Private', icon: 'lock', value: false, hint: 'Invite only' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.visibilityCard, isPublic === opt.value && styles.visibilityCardActive]}
                onPress={() => setIsPublic(opt.value)}
              >
                <MaterialCommunityIcons
                  name={opt.icon as any}
                  size={24}
                  color={isPublic === opt.value ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[styles.visibilityLabel, isPublic === opt.value && styles.visibilityLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.visibilityHint}>{opt.hint}</Text>
              </TouchableOpacity>
            ))}
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  createChip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full,
  },
  createChipText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  content: { paddingBottom: 60 },
  bannerPicker: {
    height: 140, backgroundColor: COLORS.card, position: 'relative',
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  bannerPlaceholderText: { color: COLORS.textMuted, fontSize: 14 },
  bannerEditBtn: {
    position: 'absolute', bottom: SPACING.sm, right: SPACING.sm,
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarSection: { alignItems: 'center', marginTop: -36, marginBottom: SPACING.lg },
  avatarWrapper: { position: 'relative' },
  communityAvatar: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 3, borderColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.card,
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.background,
  },
  section: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.lg,
  },
  fieldGroup: { marginBottom: SPACING.lg },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    color: COLORS.text, fontSize: 15, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  visibilityRow: { flexDirection: 'row', gap: SPACING.md },
  visibilityCard: {
    flex: 1, alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg,
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2, borderColor: COLORS.borderLight,
  },
  visibilityCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '11' },
  visibilityLabel: { fontSize: 15, fontWeight: '700', color: COLORS.textSecondary },
  visibilityLabelActive: { color: COLORS.primary },
  visibilityHint: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
});
