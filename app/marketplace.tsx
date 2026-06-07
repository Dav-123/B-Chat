import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, ScrollView, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import uuid from 'react-native-uuid';
import { COLORS, SPACING, BORDER_RADIUS } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { DatabaseService } from '@/database/DatabaseService';

const CATEGORIES = ['All', 'Electronics', 'Clothing', 'Books', 'Food', 'Services', 'Housing', 'Other'];
const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;

// Expiry options in days
const EXPIRY_OPTIONS = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
];

function timeUntilExpiry(expiryDate?: number): string {
  if (!expiryDate) return '';
  const diff = expiryDate - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return `Expires in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days}d`;
}

function ItemCard({
  item,
  isOwner,
  onPress,
  onDelete,
}: {
  item: any;
  isOwner: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const expLabel = timeUntilExpiry(item.expiryDate);
  const isExpiringSoon = item.expiryDate && item.expiryDate - Date.now() < 24 * 60 * 60 * 1000;

  return (
    <TouchableOpacity style={styles.itemCard} activeOpacity={0.8} onPress={onPress}>
      <Image
        source={{ uri: item.images[0] ?? `https://api.dicebear.com/7.x/shapes/png?seed=${item.id}` }}
        style={styles.itemImage}
      />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.itemImageOverlay} />
      <View style={styles.itemBadge}>
        <Text style={styles.itemBadgeText}>{item.condition.replace('_', ' ')}</Text>
      </View>
      {isOwner && onDelete && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Feather name="trash-2" size={14} color={COLORS.error} />
        </TouchableOpacity>
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.itemPrice}>{item.currency} {item.price.toLocaleString()}</Text>
        <View style={styles.itemMeta}>
          <Feather name="map-pin" size={10} color={COLORS.textMuted} />
          <Text style={styles.itemLocation}>{item.location ?? 'Campus'}</Text>
        </View>
        {expLabel ? (
          <Text style={[styles.expiryLabel, isExpiringSoon && { color: COLORS.warning }]}>
            {expLabel}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function ItemDetailModal({
  item,
  visible,
  onClose,
  currentUserId,
  onDelete,
}: {
  item: any | null;
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
  onDelete: () => void;
}) {
  if (!item) return null;
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.detailContainer}>
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.detailHeaderTitle}>Item Details</Text>
          {item.sellerId === currentUserId ? (
            <TouchableOpacity onPress={onDelete}>
              <Feather name="trash-2" size={20} color={COLORS.error} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.detailImageScroll}>
            {item.images.map((uri: string, i: number) => (
              <Image key={i} source={{ uri }} style={styles.detailImage} />
            ))}
          </ScrollView>
          <View style={styles.detailBody}>
            <Text style={styles.detailTitle}>{item.title}</Text>
            <Text style={styles.detailPrice}>{item.currency} {item.price.toLocaleString()}</Text>
            <View style={styles.detailTagRow}>
              <View style={styles.detailTag}>
                <Text style={styles.detailTagText}>{item.condition.replace('_', ' ')}</Text>
              </View>
              <View style={styles.detailTag}>
                <Text style={styles.detailTagText}>{item.category}</Text>
              </View>
            </View>
            {item.expiryDate ? (
              <View style={[styles.detailTag, { alignSelf: 'flex-start', marginBottom: SPACING.md }]}>
                <Feather name="clock" size={12} color={COLORS.warning} />
                <Text style={[styles.detailTagText, { color: COLORS.warning, marginLeft: 4 }]}>
                  {timeUntilExpiry(item.expiryDate)}
                </Text>
              </View>
            ) : null}
            {item.description ? (
              <Text style={styles.detailDescription}>{item.description}</Text>
            ) : null}
            <View style={styles.detailMeta}>
              <Feather name="map-pin" size={13} color={COLORS.textMuted} />
              <Text style={styles.detailMetaText}>{item.location ?? 'Campus'}</Text>
            </View>
            {item.sellerId !== currentUserId && (
              <TouchableOpacity
                style={styles.contactSellerBtn}
                onPress={() => { onClose(); router.push(`/chat/${item.sellerId}`); }}
              >
                <LinearGradient
                  colors={COLORS.gradientPrimary as [string, string]}
                  style={styles.contactSellerGradient}
                >
                  <Feather name="message-circle" size={18} color="#fff" />
                  <Text style={styles.contactSellerText}>Message Seller</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function Marketplace() {
  const { currentUser } = useAuthStore();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('Other');
  const [newImages, setNewImages] = useState<string[]>([]);
  const [newCondition, setNewCondition] = useState<typeof CONDITIONS[number]>('good');
  const [newLocation, setNewLocation] = useState('');
  const [newExpiryDays, setNewExpiryDays] = useState<number>(7);

  const loadItems = useCallback(async () => {
    try {
      // First sweep expired items
      await DatabaseService.deleteExpiredMarketplaceItems();
      const stored = await DatabaseService.getMarketplaceItems();
      setItems(stored);
    } catch (e) {
      console.error('[Marketplace] Load failed:', e);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images' as any,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setNewImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, 5));
    }
  };

  const resetForm = () => {
    setNewTitle(''); setNewDescription(''); setNewPrice('');
    setNewCategory('Other'); setNewImages([]); setNewCondition('good');
    setNewLocation(''); setNewExpiryDays(7);
  };

  const handleCreateItem = async () => {
    if (!newTitle.trim() || !newPrice || newImages.length === 0) {
      Alert.alert('Missing Info', 'Please add a title, price, and at least one photo.');
      return;
    }
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const now = Date.now();
      const item = {
        id: uuid.v4() as string,
        sellerId: currentUser.id,
        title: newTitle.trim(),
        description: newDescription.trim(),
        price: parseFloat(newPrice),
        currency: 'NGN',
        images: newImages,
        category: newCategory,
        condition: newCondition,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
        location: newLocation.trim() || 'Campus',
        tags: [],
        expiryDate: now + newExpiryDays * 24 * 60 * 60 * 1000,
      };
      await DatabaseService.saveMarketplaceItem(item);
      setItems((prev) => [item, ...prev]);
      setShowCreateModal(false);
      resetForm();
    } catch (e) {
      Alert.alert('Error', 'Failed to save item.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    Alert.alert('Delete Item', 'Remove this listing?', [
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await DatabaseService.deleteMarketplaceItem(itemId).catch(() => {});
          setItems((prev) => prev.filter((i) => i.id !== itemId));
          setSelectedItem(null);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const filtered = items.filter((item) => {
    const matchSearch = item.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
    return matchSearch && matchCat;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient colors={['rgba(123,94,167,0.12)', 'transparent']} style={styles.headerGradient} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Marketplace</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateModal(true)}>
          <LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={styles.createGradient}>
            <Feather name="plus" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search marketplace..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesRow}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="store-outline" size={64} color={COLORS.border} />
          <Text style={styles.emptyTitle}>No Items Yet</Text>
          <Text style={styles.emptySubtitle}>Be the first to list something in your campus mesh</Text>
          <TouchableOpacity style={styles.emptyCreateBtn} onPress={() => setShowCreateModal(true)}>
            <LinearGradient colors={COLORS.gradientPrimary as [string, string]} style={styles.emptyCreateGradient}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.emptyCreateText}>List an Item</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              isOwner={item.sellerId === currentUser?.id}
              onPress={() => setSelectedItem(item)}
              onDelete={() => handleDeleteItem(item.id)}
            />
          )}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ItemDetailModal
        item={selectedItem}
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        currentUserId={currentUser?.id ?? ''}
        onDelete={() => selectedItem && handleDeleteItem(selectedItem.id)}
      />

      {/* Create modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetForm(); }}>
              <Feather name="x" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>List an Item</Text>
            <TouchableOpacity onPress={handleCreateItem} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Text style={styles.publishBtn}>Publish</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Images */}
            <TouchableOpacity style={styles.imagePickerArea} onPress={pickImages}>
              {newImages.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {newImages.map((uri, i) => (
                    <Image key={i} source={{ uri }} style={styles.previewImage} />
                  ))}
                  <TouchableOpacity style={styles.addMoreImages} onPress={pickImages}>
                    <Feather name="plus" size={22} color={COLORS.textMuted} />
                    <Text style={styles.addMoreText}>Add more</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : (
                <View style={styles.imagePlaceholder}>
                  <MaterialCommunityIcons name="camera-plus-outline" size={40} color={COLORS.textMuted} />
                  <Text style={styles.imagePlaceholderText}>Add up to 5 photos</Text>
                  <Text style={styles.imagePlaceholderHint}>Tap to select from gallery</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Text fields */}
            {[
              { label: 'Title *', value: newTitle, setter: setNewTitle, placeholder: 'What are you selling?', keyboard: 'default' },
              { label: 'Price (NGN) *', value: newPrice, setter: setNewPrice, placeholder: '0.00', keyboard: 'numeric' },
              { label: 'Location', value: newLocation, setter: setNewLocation, placeholder: 'e.g. Block C Hostel', keyboard: 'default' },
            ].map((field) => (
              <View key={field.label} style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>{field.label}</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder={field.placeholder}
                  placeholderTextColor={COLORS.textMuted}
                  value={field.value}
                  onChangeText={field.setter}
                  keyboardType={field.keyboard as any}
                />
              </View>
            ))}

            <View style={styles.modalField}>
              <Text style={styles.modalFieldLabel}>Description</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                placeholder="Describe your item..."
                placeholderTextColor={COLORS.textMuted}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Expiry date (mandatory) */}
            <View style={styles.modalField}>
              <Text style={styles.modalFieldLabel}>Listing Expires In *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.days}
                      style={[styles.chip, newExpiryDays === opt.days && styles.chipActive]}
                      onPress={() => setNewExpiryDays(opt.days)}
                    >
                      <Text style={[styles.chipText, newExpiryDays === opt.days && styles.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.expiryHint}>
                Listing will auto-delete after {EXPIRY_OPTIONS.find((o) => o.days === newExpiryDays)?.label}
              </Text>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalFieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, newCategory === c && styles.chipActive]}
                      onPress={() => setNewCategory(c)}
                    >
                      <Text style={[styles.chipText, newCategory === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalFieldLabel}>Condition</Text>
              <View style={styles.chipRow}>
                {CONDITIONS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, newCondition === c && styles.chipActive]}
                    onPress={() => setNewCondition(c)}
                  >
                    <Text style={[styles.chipText, newCondition === c && styles.chipTextActive]}>
                      {c.replace('_', ' ')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  createButton: { borderRadius: 20, overflow: 'hidden' },
  createGradient: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.full, marginHorizontal: SPACING.xl,
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, paddingVertical: 12, marginLeft: 8 },
  categoriesRow: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, gap: SPACING.sm },
  categoryChip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '600' },
  categoryTextActive: { color: '#fff' },
  gridContent: { padding: SPACING.md, paddingBottom: 100 },
  gridRow: { gap: SPACING.md },
  itemCard: {
    flex: 1, margin: SPACING.xs, borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden', backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  itemImage: { width: '100%', height: 140 },
  itemImageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  itemBadge: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  itemBadgeText: { fontSize: 10, color: '#fff', textTransform: 'capitalize' },
  deleteBtn: {
    position: 'absolute', top: SPACING.sm, left: SPACING.sm,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: BORDER_RADIUS.full,
    padding: 6,
  },
  itemInfo: { padding: SPACING.md },
  itemTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  itemPrice: { fontSize: 16, fontWeight: '800', color: COLORS.primary, marginBottom: 4 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  itemLocation: { fontSize: 11, color: COLORS.textMuted },
  expiryLabel: { fontSize: 10, color: COLORS.textMuted, marginTop: 3 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: SPACING.lg },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.sm, textAlign: 'center' },
  emptyCreateBtn: { marginTop: SPACING.xl, borderRadius: BORDER_RADIUS.full, overflow: 'hidden' },
  emptyCreateGradient: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  emptyCreateText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  detailContainer: { flex: 1, backgroundColor: COLORS.background },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  detailHeaderTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  detailImageScroll: { height: 260 },
  detailImage: { width: 300, height: 260, marginRight: 2 },
  detailBody: { padding: SPACING.xl },
  detailTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm },
  detailPrice: { fontSize: 24, fontWeight: '800', color: COLORS.primary, marginBottom: SPACING.md },
  detailTagRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md, flexWrap: 'wrap' },
  detailTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  detailTagText: { fontSize: 12, color: COLORS.textSecondary, textTransform: 'capitalize' },
  detailDescription: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, marginBottom: SPACING.lg },
  detailMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.xl },
  detailMetaText: { fontSize: 13, color: COLORS.textMuted },
  contactSellerBtn: { borderRadius: BORDER_RADIUS.full, overflow: 'hidden' },
  contactSellerGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.lg, gap: SPACING.sm,
  },
  contactSellerText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  publishBtn: { color: COLORS.primary, fontWeight: '700', fontSize: 16 },
  modalContent: { padding: SPACING.xl, paddingBottom: 60 },
  imagePickerArea: {
    height: 180, backgroundColor: COLORS.card, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed',
    marginBottom: SPACING.xl, overflow: 'hidden',
  },
  imagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
  imagePlaceholderText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
  imagePlaceholderHint: { color: COLORS.textMuted, fontSize: 12 },
  previewImage: { width: 160, height: '100%', marginRight: 4 },
  addMoreImages: {
    width: 80, height: '100%', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated, gap: 4,
  },
  addMoreText: { fontSize: 11, color: COLORS.textMuted },
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
  modalInputMultiline: { minHeight: 100, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  expiryHint: { fontSize: 11, color: COLORS.textMuted, marginTop: SPACING.sm },
});
