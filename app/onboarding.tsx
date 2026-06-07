import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAutoTypewriter } from '@/hooks/useAutoTypewriter';

const { width, height } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    title: 'B-Chat',
    subtitle: 'Offline Mesh Communication',
    description: 'Connect with anyone nearby without internet. Built for campuses, hostels, and classrooms.',
    icon: 'bluetooth',
    gradient: [COLORS.neonPurple, COLORS.primary] as [string, string],
  },
  {
    id: '2',
    title: 'Mesh Network',
    subtitle: 'Multi-Hop Relay',
    description: 'Messages relay through nearby devices automatically, reaching anyone in your campus mesh.',
    icon: 'access-point-network',
    gradient: [COLORS.neonBlue, COLORS.accent] as [string, string],
  },
  {
    id: '3',
    title: 'Auto Share',
    subtitle: 'Classroom File Sharing',
    description: 'Lecturers can instantly propagate files to every connected student without internet.',
    icon: 'file-send',
    gradient: [COLORS.neonTeal, COLORS.neonBlue] as [string, string],
  },
  {
    id: '4',
    title: 'Secure & Private',
    subtitle: 'End-to-End Encrypted',
    description: 'Every message is encrypted with AES-256. Your conversations stay private.',
    icon: 'shield-lock',
    gradient: [COLORS.neonOrange, COLORS.error] as [string, string],
  },
];

export default function Onboarding() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const typewriterText = useAutoTypewriter([
    'Campus. Connected.',
    'No Internet. No Problem.',
    'Share. Communicate. Belong.',
    'Offline. Always On.',
  ]);

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex((i) => i + 1);
    } else {
      router.replace('/profile-setup');
    }
  };

  const handleSkip = () => router.replace('/profile-setup');

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.surface]} style={StyleSheet.absoluteFill} />

      <View style={styles.headerBg}>
        <LinearGradient
          colors={['rgba(123,94,167,0.4)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glowCircle1} />
        <View style={styles.glowCircle2} />
        <Text style={styles.typewriterText}>{typewriterText}<Text style={styles.cursor}>|</Text></Text>
      </View>

      <Animated.FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <LinearGradient colors={item.gradient} style={styles.iconContainer}>
              <MaterialCommunityIcons name={item.icon as any} size={56} color="#fff" />
            </LinearGradient>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
            <Text style={styles.slideDescription}>{item.description}</Text>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[styles.dot, { width: dotWidth, opacity }]}
              />
            );
          })}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleNext} style={styles.nextButton}>
            <LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={styles.nextGradient}>
              <Text style={styles.nextText}>
                {currentIndex === slides.length - 1 ? "Get Started" : "Next"}
              </Text>
              <Feather name="arrow-right" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerBg: {
    height: height * 0.25,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: SPACING.xl,
    overflow: 'hidden',
  },
  glowCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(123,94,167,0.15)',
    top: -50,
    left: -30,
  },
  glowCircle2: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(0,212,255,0.1)',
    top: 20,
    right: -20,
  },
  typewriterText: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  cursor: { color: COLORS.primary },
  slide: {
    width,
    alignItems: 'center',
    paddingHorizontal: SPACING.xxxl,
    paddingTop: SPACING.xl,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  slideTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  slideSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primaryLight,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  slideDescription: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipButton: { padding: SPACING.md },
  skipText: { color: COLORS.textSecondary, fontSize: 16 },
  nextButton: { borderRadius: BORDER_RADIUS.full, overflow: 'hidden' },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.sm,
  },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});