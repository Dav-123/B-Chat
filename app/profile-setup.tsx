import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { EncryptionService } from '@/services/EncryptionService';

export default function ProfileSetup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [about, setAbout] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { setCurrentUser, setOnboarded } = useAuthStore();

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
    }
  };

  const handleComplete = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter your name to continue.');
      return;
    }
    if (!avatar) {
      Alert.alert('Photo Required', 'Please select a profile photo to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const { publicKey } = await EncryptionService.generateIdentityKeyPair();
      const deviceId = await EncryptionService.getOrCreateUserId();

      const user = {
        id: uuid.v4() as string,
        name: name.trim(),
        email: email.trim() || undefined,
        about: about.trim() || undefined,
        avatar,
        deviceId,
        level: 1,
        xp: 0,
        isOnline: true,
        lastSeen: Date.now(),
        publicKey,
      };

      setCurrentUser(user);
      setOnboarded(true);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('PROFILE CREATE ERROR:', error);
      Alert.alert('Error', 'Failed to create profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={[COLORS.background, COLORS.surface]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerSection}>
          <View style={styles.glowCircle} />
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[COLORS.neonPurple, COLORS.primary]}
              style={styles.logoGradient}
            >
              <MaterialCommunityIcons name="chat-processing" size={42} color="#fff" />
            </LinearGradient>
          </View>
          <Text style={styles.headerTitle}>Join B-Chat</Text>
          <Text style={styles.headerSubtitle}>Start your journey with us</Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Create Profile</Text>
          <Text style={styles.formSubtitle}>Please fill in the details below</Text>

          <TouchableOpacity style={styles.avatarContainer} onPress={pickAvatar}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Feather name="camera" size={28} color={COLORS.textMuted} />
                <Text style={styles.avatarText}>Add Photo</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              <Feather name="plus" size={14} color="#fff" />
            </View>
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            <Feather
              name="user"
              size={18}
              color={COLORS.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Full name *"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Feather
              name="mail"
              size={18}
              color={COLORS.textMuted}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={[styles.inputContainer, styles.inputMultiline]}>
            <Feather
              name="info"
              size={18}
              color={COLORS.textMuted}
              style={styles.inputIconTop}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="About (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={about}
              onChangeText={setAbout}
              multiline
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleComplete}
            disabled={isLoading}
          >
            <LinearGradient
              colors={COLORS.gradientPrimary as [string, string]}
              style={styles.submitGradient}
            >
              {isLoading ? (
                <Text style={styles.submitText}>Setting up...</Text>
              ) : (
                <>
                  <Text style={styles.submitText}>Let's Go</Text>
                  <Feather name="arrow-right" size={20} color="#fff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  headerSection: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: SPACING.xxl,
    overflow: 'hidden',
  },
  glowCircle: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(123,94,167,0.12)',
    top: -80,
    alignSelf: 'center',
  },
  logoContainer: {
    marginBottom: SPACING.lg,
  },
  logoGradient: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  formSection: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: SPACING.xl,
    paddingTop: SPACING.xxl,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  formSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  avatarContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignSelf: 'center',
    marginBottom: SPACING.xl,
    position: 'relative',
  },
  avatarImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.card,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  inputMultiline: {
    alignItems: 'flex-start',
    paddingVertical: SPACING.md,
  },
  inputIcon: {
    marginRight: SPACING.md,
  },
  inputIconTop: {
    marginRight: SPACING.md,
    marginTop: 2,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    paddingVertical: 16,
  },
  multilineInput: {
    paddingVertical: 0,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
    marginTop: SPACING.lg,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  submitText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});