import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Image,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAutoTypewriter } from '@/hooks/useAutoTypewriter';

const { width } = Dimensions.get('window');
const NUM_PARTICLES = 20;

const DEVELOPER_AVATAR = require('@/assets/images/developer.png'); // Add your photo here

function ParticleEffect() {
  const particles = useRef(
    Array.from({ length: NUM_PARTICLES }, () => ({
      x: new Animated.Value(Math.random() * width),
      y: new Animated.Value(Math.random() * 400),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    particles.forEach((particle, i) => {
      const animate = () => {
        particle.x.setValue(Math.random() * width);
        particle.y.setValue(400 + Math.random() * 100);
        particle.opacity.setValue(0);
        particle.scale.setValue(0);

        Animated.parallel([
          Animated.timing(particle.opacity, {
            toValue: Math.random() * 0.7 + 0.1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(particle.scale, {
            toValue: Math.random() * 0.8 + 0.2,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(particle.y, {
            toValue: Math.random() * -200,
            duration: 3000 + Math.random() * 2000,
            useNativeDriver: false,
          }),
        ]).start(() => animate());
      };

      setTimeout(() => animate(), i * 200);
    });
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              left: p.x,
              top: p.y,
              opacity: p.opacity,
              transform: [{ scale: p.scale }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function About() {
  const typeText = useAutoTypewriter([
    'Connecting Campuses.',
    'Bridging the Digital Gap.',
    'Offline. But Always Together.',
    'Built with ❤️ in Nigeria.',
  ]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About B-Chat</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero section */}
        <View style={styles.heroSection}>
          <LinearGradient
            colors={['rgba(123,94,167,0.3)', 'rgba(0,212,255,0.1)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <ParticleEffect />

          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.appLogoContainer}>
              <LinearGradient colors={[COLORS.neonPurple, COLORS.primary]} style={styles.appLogo}>
                <MaterialCommunityIcons name="chat-processing" size={48} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.appName}>B-Chat</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
            <Text style={styles.typewriterLine}>
              {typeText}<Text style={styles.cursor}>|</Text>
            </Text>
          </Animated.View>
        </View>

        {/* Developer section */}
        <View style={styles.developerSection}>
          <Text style={styles.sectionLabel}>About the Developer</Text>
          <View style={styles.developerCard}>
            <LinearGradient colors={COLORS.gradientCard as [string, string]} style={styles.developerCardGradient}>
              <View style={styles.devAvatarWrapper}>
                <Image
                  source={DEVELOPER_AVATAR}
                  style={styles.devAvatar}
                  defaultSource={require('@/assets/images/default-avatar.png')}
                />
                <View style={styles.devBadge}>
                  <MaterialCommunityIcons name="code-tags" size={14} color="#fff" />
                </View>
              </View>
              <Text style={styles.devName}>David Briggs</Text>
              <Text style={styles.devLocation}>
                <MaterialCommunityIcons name="map-marker" size={13} color={COLORS.primary} />
                {' '}Abonnema, Rivers State, Nigeria
              </Text>
              <Text style={styles.devBio}>
                Passionate software engineer and innovator building technology that bridges communication
                gaps in underserved communities. Focused on offline-first, decentralized systems
                that work for everyone, everywhere — even without internet access.
              </Text>
            </LinearGradient>
          </View>
        </View>

        {/* Mission section */}
        <View style={styles.missionSection}>
          <Text style={styles.sectionLabel}>Our Mission</Text>
          <View style={styles.missionCard}>
            <MaterialCommunityIcons name="flag-outline" size={28} color={COLORS.neonTeal} />
            <Text style={styles.missionText}>
              B-Chat was built to solve real communication and file-sharing problems in campuses,
              schools, hostels, classrooms, and low-internet environments across Nigeria and beyond.
              Using Bluetooth mesh networking, B-Chat creates a local internet — a community where
              every device is a node, every person is connected, and distance is just a hop away.
            </Text>
          </View>
        </View>

        {/* Features highlight */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionLabel}>What Makes B-Chat Unique</Text>
          {[
            { icon: 'bluetooth', label: 'Bluetooth Mesh Network', desc: 'Multi-hop relay through nearby devices', color: COLORS.neonBlue },
            { icon: 'shield-lock-outline', label: 'End-to-End Encrypted', desc: 'AES-256 encryption on every message', color: COLORS.neonTeal },
            { icon: 'file-send-outline', label: 'Auto Relay Share', desc: 'Propagate files across entire classrooms', color: COLORS.neonOrange },
            { icon: 'store-outline', label: 'Campus Marketplace', desc: 'Trade locally with nearby students', color: COLORS.neonPurple },
          ].map((f) => (
            <View key={f.label} style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: f.color + '22' }]}>
                <MaterialCommunityIcons name={f.icon as any} size={22} color={f.color} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>{f.label}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Made with passion in Nigeria 🇳🇬{'\n'}© 2026 David Briggs. All rights reserved.
        </Text>
      </ScrollView>
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
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  heroSection: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  appLogoContainer: { alignItems: 'center', marginBottom: SPACING.lg },
  appLogo: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontSize: 32, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  appVersion: { fontSize: 13, color: COLORS.textMuted, marginBottom: SPACING.sm, textAlign: 'center' },
  typewriterLine: { fontSize: 16, color: COLORS.primaryLight, textAlign: 'center' },
  cursor: { color: COLORS.primary },
  developerSection: { padding: SPACING.xl },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.md,
  },
  developerCard: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  developerCardGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  devAvatarWrapper: { position: 'relative', marginBottom: SPACING.md },
  devAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.primary },
  devBadge: {
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
    borderColor: COLORS.background,
  },
  devName: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  devLocation: { fontSize: 13, color: COLORS.textSecondary, marginBottom: SPACING.md },
  devBio: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  missionSection: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  missionCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.md,
  },
  missionText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  featuresSection: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.md,
  },
  featureIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1 },
  featureLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  featureDesc: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textMuted,
    paddingBottom: SPACING.xxxl,
    lineHeight: 22,
  },
});
