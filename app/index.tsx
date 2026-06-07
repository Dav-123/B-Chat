import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { COLORS } from '@/constants/theme';

export default function Index() {
  const { isOnboarded, currentUser, isHydrated } = useAuthStore();

  useEffect(() => {
    if (!isHydrated) return; // Wait until SecureStore has loaded

    if (!isOnboarded || !currentUser) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  }, [isHydrated, isOnboarded, currentUser]);

  // Show a spinner while hydrating so there is no flash
  return (
    <View style={styles.container}>
      <ActivityIndicator color={COLORS.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});