import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/theme';

function TabIcon({ name, focused, library = 'feather' }: {
  name: string;
  focused: boolean;
  library?: 'feather' | 'mci' | 'ionicons';
}) {
  const color = focused ? COLORS.primary : COLORS.textMuted;
  const size = 22;

  const icon = library === 'mci'
    ? <MaterialCommunityIcons name={name as any} size={size} color={color} />
    : library === 'ionicons'
    ? <Ionicons name={name as any} size={size} color={color} />
    : <Feather name={name as any} size={size} color={color} />;

  return (
    <View style={[styles.tabIconContainer, focused && styles.tabIconActive]}>
      {icon}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarBackground: () => (
          <BlurView intensity={60} style={StyleSheet.absoluteFill} tint="dark" />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ focused }) => <TabIcon name="message-circle" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ focused }) => <TabIcon name="circle" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Nearby',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="access-point-network" focused={focused} library="mci" />
          ),
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
          tabBarIcon: ({ focused }) => <TabIcon name="phone" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    elevation: 0,
    height: 70,
    paddingBottom: Platform.OS === 'android' ? 12 : 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabIconContainer: {
    width: 40,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: 'rgba(123,94,167,0.15)',
  },
});