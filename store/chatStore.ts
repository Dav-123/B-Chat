import { create } from 'zustand';
import { Chat, Message, Group, Community } from '@/types';
import { DatabaseService } from '@/database/DatabaseService';

interface TypingEntry { userId: string; expiresAt: number }

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  groups: Group[];
  communities: Community[];
  typingUsers: Record<string, TypingEntry[]>;
  isHydrated: boolean;

  // Hydration from DB
  hydrate: () => Promise<void>;

  // Chat operations
  setChats: (chats: Chat[]) => void;
  addOrUpdateChat: (chat: Chat) => void;
  setActiveChat: (chat: Chat | null) => void;
  persistChat: (chat: Chat) => Promise<void>;

  // Group / community
  setGroups: (groups: Group[]) => void;
  addOrUpdateGroup: (group: Group) => void;
  setCommunities: (communities: Community[]) => void;

  // Typing (with TTL)
  setTyping: (chatId: string, userId: string, isTyping: boolean) => void;
  pruneTyping: (chatId: string) => void;

  // Message helpers
  updateLastMessage: (chatId: string, message: Message) => void;
  incrementUnread: (chatId: string) => void;
  markAsRead: (chatId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChat: null,
  groups: [],
  communities: [],
  typingUsers: {},
  isHydrated: false,

  // ── Hydration ────────────────────────────────────────────────────────────

  hydrate: async () => {
    try {
      const chats = await DatabaseService.getChats({ includeArchived: false });
      set({ chats, isHydrated: true });
    } catch (e) {
      console.error('[ChatStore] Hydration failed:', e);
      set({ isHydrated: true });
    }
  },

  // ── Chats ────────────────────────────────────────────────────────────────

  setChats: (chats) => set({ chats }),

  addOrUpdateChat: (chat) =>
    set((state) => {
      const exists = state.chats.findIndex((c) => c.id === chat.id);
      const next =
        exists >= 0
          ? state.chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c))
          : [chat, ...state.chats];
      // Sort by updatedAt descending
      next.sort((a, b) => b.updatedAt - a.updatedAt);
      return { chats: next };
    }),

  persistChat: async (chat) => {
    get().addOrUpdateChat(chat);
    try {
      await DatabaseService.saveChat(chat);
    } catch (e) {
      console.error('[ChatStore] persistChat failed:', e);
    }
  },

  setActiveChat: (chat) => set({ activeChat: chat }),

  // ── Groups / Communities ─────────────────────────────────────────────────

  setGroups: (groups) => set({ groups }),

  addOrUpdateGroup: (group) =>
    set((state) => ({
      groups:
        state.groups.some((g) => g.id === group.id)
          ? state.groups.map((g) => (g.id === group.id ? group : g))
          : [group, ...state.groups],
    })),

  setCommunities: (communities) => set({ communities }),

  // ── Typing (with 5-second TTL) ───────────────────────────────────────────

  setTyping: (chatId, userId, isTyping) =>
    set((state) => {
      const TTL = 5_000;
      const current = state.typingUsers[chatId] ?? [];
      const filtered = current.filter((e) => e.userId !== userId && e.expiresAt > Date.now());
      const next = isTyping
        ? [...filtered, { userId, expiresAt: Date.now() + TTL }]
        : filtered;
      return { typingUsers: { ...state.typingUsers, [chatId]: next } };
    }),

  pruneTyping: (chatId) =>
    set((state) => {
      const now = Date.now();
      const pruned = (state.typingUsers[chatId] ?? []).filter((e) => e.expiresAt > now);
      return { typingUsers: { ...state.typingUsers, [chatId]: pruned } };
    }),

  // ── Message helpers ──────────────────────────────────────────────────────

  updateLastMessage: (chatId, message) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId
          ? { ...c, lastMessage: message, updatedAt: message.timestamp }
          : c
      ),
    })),

  incrementUnread: (chatId) =>
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: c.unreadCount + 1 } : c
      ),
    })),

  markAsRead: async (chatId) => {
    set((state) => ({
      chats: state.chats.map((c) =>
        c.id === chatId ? { ...c, unreadCount: 0 } : c
      ),
    }));
    try {
      await DatabaseService.resetUnreadCount(chatId);
    } catch (e) {
      console.error('[ChatStore] markAsRead DB sync failed:', e);
    }
  },
}));