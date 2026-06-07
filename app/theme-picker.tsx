import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useLocalSearchParams } from 'expo-router';
import { DatabaseService } from '@/database/DatabaseService';
import { ChatTheme } from '@/types';

const PRESET_THEMES: ChatTheme[] = [
  { id: 'dark', name: 'Default Dark', wallpaperType: 'color', backgroundColor: '#080810', sentBubbleColor: '#2D1B69', receivedBubbleColor: '#1a1a2e', accentColor: '#7B5EA7' },
  { id: 'midnight', name: 'Midnight Blue', wallpaperType: 'gradient', gradient: ['#0f0c29', '#302b63', '#24243e'], sentBubbleColor: '#1a237e', receivedBubbleColor: '#0d1b2a', accentColor: '#448aff' },
  { id: 'forest', name: 'Forest', wallpaperType: 'gradient', gradient: ['#0a2e1a', '#1b4332', '#0a2e1a'], sentBubbleColor: '#1b5e20', receivedBubbleColor: '#0a3d1a', accentColor: '#4caf50' },
  { id: 'sunset', name: 'Sunset', wallpaperType: 'gradient', gradient: ['#1a0a00', '#3d1a00', '#1a0a00'], sentBubbleColor: '#bf360c', receivedBubbleColor: '#3e2723', accentColor: '#ff6d00' },
  { id: 'ocean', name: 'Deep Ocean', wallpaperType: 'gradient', gradient: ['#001e3c', '#01579b', '#001e3c'], sentBubbleColor: '#01579b', receivedBubbleColor: '#002244', accentColor: '#03a9f4' },
  { id: 'galaxy', name: 'Galaxy', wallpaperType: 'gradient', gradient: ['#0d0221', '#240046', '#0d0221'], sentBubbleColor: '#6a1b9a', receivedBubbleColor: '#1a0033', accentColor: '#ce93d8' },
];

export default function ThemePicker() {
  const [selected, setSelected] = useState<string>('dark');
  const { chatId } = useLocalSearchParams<{ chatId: string }>();

  const pickCustomWallpaper = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      if (chatId) {
        const chats = await DatabaseService.getChats({ includeArchived: true });
        const chat = chats.find((c) => c.id === chatId);
        if (chat) {
          await DatabaseService.saveChat({
            ...chat,
            wallpaper: result.assets[0].uri,
            updatedAt: Date.now(),
          });
        }
      }
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat Theme</Text>
        <TouchableOpacity onPress={async () => {
          const theme = PRESET_THEMES.find((t) => t.id === selected);
          if (theme && chatId) {
            const chats = await DatabaseService.getChats({ includeArchived: true });
            const chat = chats.find((c) => c.id === chatId);
            if (chat) {
              await DatabaseService.saveChat({
                ...chat,
                wallpaper: theme.wallpaperType === 'color' ? theme.backgroundColor : undefined,
                theme,
                updatedAt: Date.now(),
              });
            }
          }
          router.back();
        }}>
          <Text style={styles.applyBtn}>Apply</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Preset Themes</Text>
      <FlatList
        data={PRESET_THEMES}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.themeCard, selected === item.id && styles.themeCardSelected]}
            onPress={() => setSelected(item.id)}
          >
           <View style={[
  styles.themePreview,
  { backgroundColor: item.backgroundColor ?? item.gradient?.[0] }
]}>
  <View style={[styles.previewBubbleSent, { backgroundColor: item.sentBubbleColor }]}>
    <View style={styles.previewBubbleBar} />
    <View style={[styles.previewBubbleBar, { width: 30, marginTop: 3 }]} />
  </View>
  <View style={[styles.previewBubbleReceived, { backgroundColor: item.receivedBubbleColor }]}>
    <View style={styles.previewBubbleBar} />
  </View>
  <View style={[styles.previewBubbleSent, { backgroundColor: item.sentBubbleColor }]}>
    <View style={[styles.previewBubbleBar, { width: 35 }]} />
  </View>
</View>
            {selected === item.id && (
              <View style={[styles.selectedBadge, { backgroundColor: item.accentColor }]}>
                <Feather name="check" size={12} color="#fff" />
              </View>
            )}
            <View style={[styles.themeNameRow, { borderTopColor: item.accentColor + '44' }]}>
              <View style={[styles.themeAccentDot, { backgroundColor: item.accentColor }]} />
              <Text style={styles.themeName}>{item.name}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.themeGrid}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <TouchableOpacity style={styles.customWallpaperBtn} onPress={pickCustomWallpaper}>
            <Feather name="image" size={20} color={COLORS.primary} />
            <Text style={styles.customWallpaperText}>Choose Custom Wallpaper</Text>
            <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        }
      />
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  applyBtn: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg, textTransform: 'uppercase', letterSpacing: 0.5 },
  themeGrid: { paddingHorizontal: SPACING.md, paddingBottom: 40 },
  gridRow: { gap: SPACING.md },
  themeCard: {
    flex: 1,
    margin: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    position: 'relative',
  },
  themeCardSelected: { borderColor: COLORS.primary },
 themePreview: {
  height: 100,
  padding: SPACING.sm,
  gap: SPACING.sm,
  position: 'relative',
  overflow: 'hidden',
},
  previewBubbleSent: {
    alignSelf: 'flex-end',
    borderRadius: 10,
    padding: 8,
    maxWidth: '70%',
  },
  previewBubbleReceived: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    padding: 8,
    maxWidth: '70%',
  },
  previewBubbleBar: { width: 50, height: 4, backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 2 },
  selectedBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeName: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  themeNameRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  padding: SPACING.sm,
  backgroundColor: COLORS.card,
  borderTopWidth: 1,
},
themeAccentDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
},
  customWallpaperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    margin: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  customWallpaperText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
});
