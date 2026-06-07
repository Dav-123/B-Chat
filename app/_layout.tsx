import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { DatabaseService } from '@/database/DatabaseService';
//import { PermissionsService } from '@/services/PermissionsService';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    const initialize = async () => {
      try {
       await useAuthStore.getState().hydrate();
       await DatabaseService.initialize();
       await useChatStore.getState().hydrate();
        //Remove permisson service for now await PermissionsService.requestAllPermissions();
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#080810" />
        <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="group/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="community/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="call/[id]" options={{ animation: 'fade', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="create-group" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="create-community" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="marketplace" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="theme-picker" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="profile-setup" />
          <Stack.Screen name="mesh-diagnostics" options={{ animation:'slide_from_right'}}/>
        <Stack.Screen name="blocked-users" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="mesh-live" options={{ animation: 'slide_from_right' }} />
         <Stack.Screen name="user-profile/[userId]" options={{ animation: 'slide_from_right' }} />
      </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}