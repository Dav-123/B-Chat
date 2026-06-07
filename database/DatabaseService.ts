import * as SQLite from 'expo-sqlite';
import {
  User,
  Message,
  Chat,
  Group,
  MeshRoute,
  NearbyDevice,
  FileTransfer,
  MessageStatus,
} from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'bchat.db';

// ─── Serialisation helpers ────────────────────────────────────────────────────

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toJSON(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[]';
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function openDB(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    await db.execAsync('PRAGMA synchronous = NORMAL;');
    await db.execAsync('PRAGMA cache_size = -8000;');
    await runMigrations(db);
    _db = db;
    return db;
  })();

  return _initPromise;
}

// ─── Migration system ─────────────────────────────────────────────────────────

type Migration = {
  version: number;
  sql?: string;
  run?: (db: SQLite.SQLiteDatabase) => Promise<void>;
};

/**
 * Safely adds a column to a table. In SQLite, ALTER TABLE does not support
 * IF NOT EXISTS, so we catch the "duplicate column name" error and treat it
 * as a no-op, which is the standard SQLite migration pattern.
 */
async function addColumnSafely(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.toLowerCase().includes('duplicate column name')) {
      throw e;
    }
    // Column already exists — safe to continue
  }
}

const MIGRATIONS: Migration[] = [
  // ── Version 1 — Initial schema ─────────────────────────────────────────────
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        email            TEXT,
        about            TEXT,
        avatar           TEXT NOT NULL,
        device_id        TEXT UNIQUE NOT NULL,
        bluetooth_id     TEXT,
        level            INTEGER DEFAULT 1,
        xp               INTEGER DEFAULT 0,
        is_online        INTEGER DEFAULT 0,
        last_seen        INTEGER NOT NULL,
        public_key       TEXT NOT NULL,
        marketplace_data TEXT,
        theme_data       TEXT,
        created_at       INTEGER NOT NULL,
        updated_at       INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id            TEXT PRIMARY KEY,
        participants  TEXT NOT NULL,
        last_message_id TEXT,
        unread_count  INTEGER DEFAULT 0,
        is_pinned     INTEGER DEFAULT 0,
        is_archived   INTEGER DEFAULT 0,
        is_muted      INTEGER DEFAULT 0,
        is_blocked    INTEGER DEFAULT 0,
        wallpaper     TEXT,
        theme_data    TEXT,
        mesh_route_id TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id           TEXT PRIMARY KEY,
        chat_id      TEXT NOT NULL,
        sender_id    TEXT NOT NULL,
        receiver_id  TEXT NOT NULL,
        content      TEXT NOT NULL,
        type         TEXT NOT NULL DEFAULT 'text',
        timestamp    INTEGER NOT NULL,
        status       TEXT NOT NULL DEFAULT 'sending',
        encrypted    INTEGER DEFAULT 1,
        hop_count    INTEGER DEFAULT 0,
        route_path   TEXT DEFAULT '[]',
        reply_to     TEXT,
        reactions    TEXT DEFAULT '[]',
        file_url     TEXT,
        file_name    TEXT,
        file_size    INTEGER,
        duration     INTEGER,
        thumbnail    TEXT,
        is_forwarded INTEGER DEFAULT 0,
        is_deleted   INTEGER DEFAULT 0,
        read_by      TEXT DEFAULT '[]',
        delivered_at INTEGER,
        read_at      INTEGER,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS groups_table (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        avatar      TEXT,
        members     TEXT NOT NULL DEFAULT '[]',
        admins      TEXT NOT NULL DEFAULT '[]',
        created_by  TEXT NOT NULL,
        is_public   INTEGER DEFAULT 0,
        wallpaper   TEXT,
        theme_data  TEXT,
        settings    TEXT DEFAULT '{}',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS communities (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT,
        avatar       TEXT,
        banner       TEXT,
        owner        TEXT NOT NULL,
        admins       TEXT NOT NULL DEFAULT '[]',
        groups       TEXT NOT NULL DEFAULT '[]',
        members      TEXT NOT NULL DEFAULT '[]',
        is_public    INTEGER DEFAULT 0,
        category     TEXT,
        rules        TEXT,
        announcement TEXT,
        created_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS statuses (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        type             TEXT NOT NULL,
        content          TEXT NOT NULL,
        media_url        TEXT,
        background_color TEXT,
        text_color       TEXT,
        views            TEXT DEFAULT '[]',
        created_at       INTEGER NOT NULL,
        expires_at       INTEGER NOT NULL,
        caption          TEXT,
        duration         INTEGER
      );

      CREATE TABLE IF NOT EXISTS mesh_routes (
        id              TEXT PRIMARY KEY,
        from_device     TEXT NOT NULL,
        to_device       TEXT NOT NULL,
        path            TEXT NOT NULL DEFAULT '[]',
        signal_strength INTEGER DEFAULT 0,
        hop_count       INTEGER DEFAULT 0,
        latency         INTEGER DEFAULT 0,
        last_used       INTEGER NOT NULL,
        reliability     REAL DEFAULT 1.0,
        is_active       INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS nearby_devices (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        device_id       TEXT NOT NULL,
        bluetooth_id    TEXT,
        rssi            INTEGER DEFAULT -100,
        distance        REAL DEFAULT 0,
        is_connected    INTEGER DEFAULT 0,
        connection_type TEXT DEFAULT 'ble',
        last_seen       INTEGER NOT NULL,
        capabilities    TEXT DEFAULT '[]',
        user_data       TEXT
      );

      CREATE TABLE IF NOT EXISTS pending_messages (
        id            TEXT PRIMARY KEY,
        message_data  TEXT NOT NULL,
        target_device TEXT NOT NULL,
        retry_count   INTEGER DEFAULT 0,
        max_retries   INTEGER DEFAULT 50,
        created_at    INTEGER NOT NULL,
        next_retry_at INTEGER NOT NULL,
        priority      TEXT DEFAULT 'normal'
      );

      CREATE TABLE IF NOT EXISTS file_transfers (
        id                  TEXT PRIMARY KEY,
        file_name           TEXT NOT NULL,
        file_size           INTEGER NOT NULL,
        file_type           TEXT NOT NULL,
        sender_id           TEXT NOT NULL,
        receiver_ids        TEXT NOT NULL DEFAULT '[]',
        total_chunks        INTEGER NOT NULL,
        transferred_chunks  INTEGER DEFAULT 0,
        status              TEXT DEFAULT 'preparing',
        is_auto_relay       INTEGER DEFAULT 0,
        progress            REAL DEFAULT 0,
        started_at          INTEGER NOT NULL,
        completed_at        INTEGER,
        local_path          TEXT
      );

      CREATE TABLE IF NOT EXISTS blocked_users (
        user_id         TEXT NOT NULL,
        blocked_user_id TEXT NOT NULL,
        blocked_at      INTEGER NOT NULL,
        reason          TEXT,
        PRIMARY KEY (user_id, blocked_user_id)
      );

      CREATE TABLE IF NOT EXISTS marketplace_items (
        id          TEXT PRIMARY KEY,
        seller_id   TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        price       REAL NOT NULL,
        currency    TEXT DEFAULT 'NGN',
        images      TEXT DEFAULT '[]',
        category    TEXT,
        condition   TEXT DEFAULT 'good',
        is_available INTEGER DEFAULT 1,
        location    TEXT,
        expiry_date INTEGER,
        tags        TEXT DEFAULT '[]',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS calls (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        caller_id     TEXT NOT NULL,
        receiver_id   TEXT NOT NULL,
        status        TEXT NOT NULL,
        started_at    INTEGER,
        ended_at      INTEGER,
        duration      INTEGER,
        is_group_call INTEGER DEFAULT 0,
        group_id      TEXT,
        participants  TEXT DEFAULT '[]',
        mesh_route    TEXT DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_messages_chat_id
        ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp
        ON messages(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_status
        ON messages(status);
      CREATE INDEX IF NOT EXISTS idx_messages_sender
        ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_chats_updated
        ON chats(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_mesh_routes_devices
        ON mesh_routes(from_device, to_device);
      CREATE INDEX IF NOT EXISTS idx_mesh_routes_active
        ON mesh_routes(is_active, last_used DESC);
      CREATE INDEX IF NOT EXISTS idx_pending_target
        ON pending_messages(target_device, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_statuses_user
        ON statuses(user_id, expires_at);
      CREATE INDEX IF NOT EXISTS idx_nearby_seen
        ON nearby_devices(last_seen DESC);
      CREATE INDEX IF NOT EXISTS idx_marketplace_seller
        ON marketplace_items(seller_id, created_at DESC);
    `,
  },

  // ── Version 2 — Add columns to messages ───────────────────────────────────
  // Uses the run() pattern because SQLite does not support
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
  {
    version: 2,
    run: async (db) => {
      await addColumnSafely(db, 'messages', 'local_only', 'INTEGER DEFAULT 0');
      await addColumnSafely(db, 'messages', 'sync_token', 'TEXT');
    },
  },

  // ── Version 3 — Packet deduplication table ─────────────────────────────────
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS message_dedup (
        packet_id   TEXT PRIMARY KEY,
        received_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_dedup_time
        ON message_dedup(received_at);
    `,
  },
  {
  version: 4,
  run: async (db) => {
    await addColumnSafely(db, 'marketplace_items', 'expiry_date', 'INTEGER');
  },
},
];

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // Create the migrations tracking table first, outside any transaction,
  // so it is always available even if a previous run failed mid-way.
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ max_version: number | null }>(
    'SELECT MAX(version) AS max_version FROM schema_migrations;'
  );
  const currentVersion = row?.max_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    await db.withTransactionAsync(async () => {
      if (migration.sql) {
        await db.execAsync(migration.sql);
      }
      if (migration.run) {
        await migration.run(db);
      }
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
        [migration.version, Date.now()]
      );
    });

    console.log(`[DB] Migration v${migration.version} applied successfully.`);
  }
}

// ─── Row-to-domain mappers ────────────────────────────────────────────────────

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: string;
  timestamp: number;
  status: string;
  encrypted: number;
  hop_count: number;
  route_path: string;
  reply_to: string | null;
  reactions: string;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  duration: number | null;
  thumbnail: string | null;
  is_forwarded: number;
  is_deleted: number;
  read_by: string;
  delivered_at: number | null;
  read_at: number | null;
};

type ChatRow = {
  id: string;
  participants: string;
  last_message_id: string | null;
  unread_count: number;
  is_pinned: number;
  is_archived: number;
  is_muted: number;
  is_blocked: number;
  wallpaper: string | null;
  theme_data: string | null;
  mesh_route_id: string | null;
  created_at: number;
  updated_at: number;
};


function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.content,
    type: row.type as Message['type'],
    timestamp: row.timestamp,
    status: row.status as MessageStatus,
    encrypted: row.encrypted === 1,
    hopCount: row.hop_count,
    routePath: parseJSON<string[]>(row.route_path, []),
    replyTo: row.reply_to ?? undefined,
    reactions: parseJSON(row.reactions, []),
    fileUrl: row.file_url ?? undefined,
    fileName: row.file_name ?? undefined,
    fileSize: row.file_size ?? undefined,
    duration: row.duration ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    isForwarded: row.is_forwarded === 1,
    isDeleted: row.is_deleted === 1,
    readBy: parseJSON(row.read_by, []),
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
  };
}

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id,
    participants: parseJSON<string[]>(row.participants, []),
    unreadCount: row.unread_count,
    isPinned: row.is_pinned === 1,
    isArchived: row.is_archived === 1,
    isMuted: row.is_muted === 1,
    isBlocked: row.is_blocked === 1,
    wallpaper: row.wallpaper ?? undefined,
    theme: parseJSON(row.theme_data, undefined),
    meshRouteId: row.mesh_route_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── DatabaseService ──────────────────────────────────────────────────────────

export const DatabaseService = {

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await openDB();
  },

  async close(): Promise<void> {
    if (_db) {
      await _db.closeAsync();
      _db = null;
      _initPromise = null;
    }
  },

  // ── Messages ───────────────────────────────────────────────────────────────

  async saveMessage(message: Message): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO messages (
        id, chat_id, sender_id, receiver_id, content, type, timestamp, status,
        encrypted, hop_count, route_path, reply_to, reactions, file_url, file_name,
        file_size, duration, thumbnail, is_forwarded, is_deleted, read_by,
        delivered_at, read_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      [
        message.id, message.chatId, message.senderId, message.receiverId,
        message.content, message.type, message.timestamp, message.status,
        message.encrypted ? 1 : 0, message.hopCount,
        toJSON(message.routePath),
        message.replyTo ?? null,
        toJSON(message.reactions ?? []),
        message.fileUrl ?? null,
        message.fileName ?? null,
        message.fileSize ?? null,
        message.duration ?? null,
        message.thumbnail ?? null,
        message.isForwarded ? 1 : 0,
        message.isDeleted ? 1 : 0,
        toJSON(message.readBy ?? []),
        message.deliveredAt ?? null,
        message.readAt ?? null,
      ]
    );
  },

  async saveMessages(messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const db = await openDB();
    await db.withTransactionAsync(async () => {
      for (const message of messages) {
        await db.runAsync(
          `INSERT OR REPLACE INTO messages (
            id, chat_id, sender_id, receiver_id, content, type, timestamp, status,
            encrypted, hop_count, route_path, reply_to, reactions, file_url, file_name,
            file_size, duration, thumbnail, is_forwarded, is_deleted, read_by,
            delivered_at, read_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
          [
            message.id, message.chatId, message.senderId, message.receiverId,
            message.content, message.type, message.timestamp, message.status,
            message.encrypted ? 1 : 0, message.hopCount,
            toJSON(message.routePath),
            message.replyTo ?? null,
            toJSON(message.reactions ?? []),
            message.fileUrl ?? null,
            message.fileName ?? null,
            message.fileSize ?? null,
            message.duration ?? null,
            message.thumbnail ?? null,
            message.isForwarded ? 1 : 0,
            message.isDeleted ? 1 : 0,
            toJSON(message.readBy ?? []),
            message.deliveredAt ?? null,
            message.readAt ?? null,
          ]
        );
      }
    });
  },

  async getMessages(
    chatId: string,
    options: {
      limit?: number;
      beforeTimestamp?: number;
      afterTimestamp?: number;
    } = {}
  ): Promise<Message[]> {
    const db = await openDB();
    const { limit = 50, beforeTimestamp, afterTimestamp } = options;

    const conditions: string[] = ['chat_id = ?', 'is_deleted = 0'];
    const params: (string | number)[] = [chatId];

    if (beforeTimestamp !== undefined) {
      conditions.push('timestamp < ?');
      params.push(beforeTimestamp);
    }
    if (afterTimestamp !== undefined) {
      conditions.push('timestamp > ?');
      params.push(afterTimestamp);
    }

    params.push(limit);

    const rows = await db.getAllAsync<MessageRow>(
      `SELECT * FROM messages
       WHERE ${conditions.join(' AND ')}
       ORDER BY timestamp DESC
       LIMIT ?;`,
      params
    );

    return rows.map(rowToMessage).reverse();
  },

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus,
    extras: { deliveredAt?: number; readAt?: number } = {}
  ): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE messages
       SET status       = ?,
           delivered_at = COALESCE(?, delivered_at),
           read_at      = COALESCE(?, read_at)
       WHERE id = ?;`,
      [
        status,
        extras.deliveredAt ?? null,
        extras.readAt ?? null,
        messageId,
      ]
    );
  },

  async markMessagesRead(
    chatId: string,
    readerId: string,
    readerAvatar: string
  ): Promise<void> {
    const db = await openDB();
    const rows = await db.getAllAsync<{ id: string; read_by: string }>(
      `SELECT id, read_by FROM messages
       WHERE chat_id = ? AND status != 'read' AND is_deleted = 0;`,
      [chatId]
    );

    await db.withTransactionAsync(async () => {
      for (const row of rows) {
        const readBy = parseJSON<
          Array<{ userId: string; avatar: string; readAt: number }>
        >(row.read_by, []);

        if (!readBy.find((r) => r.userId === readerId)) {
          readBy.push({ userId: readerId, avatar: readerAvatar, readAt: Date.now() });
          await db.runAsync(
            `UPDATE messages
             SET read_by = ?, status = 'read', read_at = ?
             WHERE id = ?;`,
            [toJSON(readBy), Date.now(), row.id]
          );
        }
      }
    });
  },

  async softDeleteMessage(messageId: string): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE messages SET is_deleted = 1, content = '' WHERE id = ?;`,
      [messageId]
    );
  },

  async getPendingMessages(): Promise<Message[]> {
    const db = await openDB();
    const rows = await db.getAllAsync<MessageRow>(
      `SELECT * FROM messages
       WHERE status IN ('sending', 'queued', 'pending')
       ORDER BY timestamp ASC
       LIMIT 100;`
    );
    return rows.map(rowToMessage);
  },

  async isDuplicatePacket(packetId: string): Promise<boolean> {
    const db = await openDB();
    const row = await db.getFirstAsync<{ packet_id: string }>(
      'SELECT packet_id FROM message_dedup WHERE packet_id = ?;',
      [packetId]
    );
    if (row) return true;
    await db.runAsync(
      'INSERT OR IGNORE INTO message_dedup (packet_id, received_at) VALUES (?, ?);',
      [packetId, Date.now()]
    );
    return false;
  },



  // ── Chats ──────────────────────────────────────────────────────────────────

  async saveChat(chat: Chat): Promise<void> {
    const db = await openDB();
    await db.runAsync(
  `INSERT INTO chats (id, participants, last_message_id, unread_count, is_pinned,
    is_archived, is_muted, is_blocked, wallpaper, theme_data, mesh_route_id, created_at, updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET
     last_message_id = excluded.last_message_id,
     unread_count = excluded.unread_count,
     is_pinned = excluded.is_pinned,
     is_archived = excluded.is_archived,
     is_muted = excluded.is_muted,
     is_blocked = excluded.is_blocked,
     wallpaper = COALESCE(excluded.wallpaper, wallpaper),
     theme_data = COALESCE(excluded.theme_data, theme_data),
     mesh_route_id = excluded.mesh_route_id,
     updated_at = excluded.updated_at;`,
  [ chat.id, toJSON(chat.participants), chat.lastMessage?.id ?? null,
    chat.unreadCount, chat.isPinned ? 1 : 0, chat.isArchived ? 1 : 0,
    chat.isMuted ? 1 : 0, chat.isBlocked ? 1 : 0,
    chat.wallpaper ?? null, chat.theme ? toJSON(chat.theme) : null,
    chat.meshRouteId ?? null, chat.createdAt, chat.updatedAt ]
);
  },

  async getChats(
    options: { includeArchived?: boolean; limit?: number } = {}
  ): Promise<Chat[]> {
    const db = await openDB();
    const { includeArchived = false, limit = 100 } = options;

    const rows = await db.getAllAsync<ChatRow>(
      `SELECT * FROM chats
       WHERE is_archived = ?
       ORDER BY updated_at DESC
       LIMIT ?;`,
      [includeArchived ? 1 : 0, limit]
    );

    const chats = rows.map(rowToChat);

    for (const chat of chats) {
      const lastMessageRow = await db.getFirstAsync<MessageRow>(
        `SELECT * FROM messages
         WHERE chat_id = ? AND is_deleted = 0
         ORDER BY timestamp DESC
         LIMIT 1;`,
        [chat.id]
      );
      if (lastMessageRow) {
        chat.lastMessage = rowToMessage(lastMessageRow);
      }
    }

    return chats;
  },

  async updateChatLastMessage(chatId: string, message: Message): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE chats SET last_message_id = ?, updated_at = ? WHERE id = ?;`,
      [message.id, Date.now(), chatId]
    );
  },

  async incrementUnreadCount(chatId: string): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE chats SET unread_count = unread_count + 1 WHERE id = ?;`,
      [chatId]
    );
  },

  async resetUnreadCount(chatId: string): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE chats SET unread_count = 0 WHERE id = ?;`,
      [chatId]
    );
  },

  async getUnreadCount(chatId: string): Promise<number> {
    const db = await openDB();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM messages
       WHERE chat_id = ? AND status != 'read' AND is_deleted = 0;`,
      [chatId]
    );
    return row?.count ?? 0;
  },

  // ── Pending message queue ──────────────────────────────────────────────────

  async enqueuePendingMessage(
    message: Message,
    targetDevice: string,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO pending_messages
       (id, message_data, target_device, retry_count, max_retries,
        created_at, next_retry_at, priority)
       VALUES (?,?,?,0,50,?,?,?);`,
      [message.id, toJSON(message), targetDevice, Date.now(), Date.now(), priority]
    );
  },

  async getPendingForDevice(targetDevice: string): Promise<Message[]> {
    const db = await openDB();
    const rows = await db.getAllAsync<{ message_data: string }>(
      `SELECT message_data FROM pending_messages
       WHERE target_device = ?
         AND retry_count < max_retries
         AND next_retry_at <= ?
       ORDER BY
         CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
         created_at ASC
       LIMIT 20;`,
      [targetDevice, Date.now()]
    );
    return rows
      .map((r) => parseJSON<Message>(r.message_data, null as unknown as Message))
      .filter(Boolean);
  },

  async incrementRetry(messageId: string, backoffMs: number): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE pending_messages
       SET retry_count   = retry_count + 1,
           next_retry_at = ?
       WHERE id = ?;`,
      [Date.now() + backoffMs, messageId]
    );
  },

  async removePendingMessage(messageId: string): Promise<void> {
    const db = await openDB();
    await db.runAsync('DELETE FROM pending_messages WHERE id = ?;', [messageId]);
  },

  // ── Mesh routes ────────────────────────────────────────────────────────────

  async saveMeshRoute(route: MeshRoute): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO mesh_routes
       (id, from_device, to_device, path, signal_strength, hop_count,
        latency, last_used, reliability, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?);`,
      [
        route.id, route.fromDevice, route.toDevice,
        toJSON(route.path), route.signalStrength, route.hopCount,
        route.latency, route.lastUsed, route.reliability,
        route.isActive ? 1 : 0,
      ]
    );
  },

  async getMeshRoutes(fromDevice: string): Promise<MeshRoute[]> {
    const db = await openDB();
    const rows = await db.getAllAsync<{
      id: string;
      from_device: string;
      to_device: string;
      path: string;
      signal_strength: number;
      hop_count: number;
      latency: number;
      last_used: number;
      reliability: number;
      is_active: number;
    }>(
      `SELECT * FROM mesh_routes
       WHERE from_device = ? AND is_active = 1
       ORDER BY reliability DESC, last_used DESC
       LIMIT 50;`,
      [fromDevice]
    );

    return rows.map((r) => ({
      id: r.id,
      fromDevice: r.from_device,
      toDevice: r.to_device,
      path: parseJSON<string[]>(r.path, []),
      signalStrength: r.signal_strength,
      hopCount: r.hop_count,
      latency: r.latency,
      lastUsed: r.last_used,
      reliability: r.reliability,
      isActive: r.is_active === 1,
    }));
  },

  async invalidateRoutesThrough(deviceId: string): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `UPDATE mesh_routes
       SET is_active = 0
       WHERE path LIKE ? AND is_active = 1;`,
      [`%${deviceId}%`]
    );
  },

// ── Statuses ───────────────────────────────────────────────────────────────

async saveStatus(status: Status): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO statuses
     (id, user_id, type, content, media_url, background_color,
      text_color, views, created_at, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?);`,
    [
      status.id,
      status.userId,
      status.type,
      status.content,
      status.mediaUrl ?? null,
      status.backgroundColor ?? null,
      status.textColor ?? null,
      toJSON(status.views),
      status.createdAt,
      status.expiresAt,
    ]
  );
},

async getStatuses(): Promise<Status[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<{
    id: string; user_id: string; type: string; content: string;
    media_url: string | null; background_color: string | null;
    text_color: string | null; views: string;
    created_at: number; expires_at: number;
  }>(
    `SELECT * FROM statuses
     WHERE expires_at > ?
     ORDER BY created_at DESC;`,
    [Date.now()]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    type: r.type as Status['type'],
    content: r.content,
    mediaUrl: r.media_url ?? undefined,
    backgroundColor: r.background_color ?? undefined,
    textColor: r.text_color ?? undefined,
    views: parseJSON<string[]>(r.views, []),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
},

async addStatusView(statusId: string, viewerId: string): Promise<void> {
  const db = await openDB();
  const row = await db.getFirstAsync<{ views: string }>(
    'SELECT views FROM statuses WHERE id = ?;',
    [statusId]
  );
  if (!row) return;
  const views = parseJSON<string[]>(row.views, []);
  if (views.includes(viewerId)) return;
  views.push(viewerId);
  await db.runAsync(
    'UPDATE statuses SET views = ? WHERE id = ?;',
    [toJSON(views), statusId]
  );
},
// ——— Call Service
 async saveCall(call: Call): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO calls
     (id, type, caller_id, receiver_id, status, started_at,
      ended_at, duration, is_group_call, group_id, participants, mesh_route)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?);`,
    [
      call.id, call.type, call.callerId, call.receiverId,
      call.status, call.startedAt ?? null, call.endedAt ?? null,
      call.duration ?? null, call.isGroupCall ? 1 : 0,
      call.groupId ?? null, toJSON(call.participants ?? []),
      toJSON(call.meshRoute ?? []),
    ]
  );
},

async getCalls(userId: string): Promise<Call[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<{
    id: string; type: string; caller_id: string; receiver_id: string;
    status: string; started_at: number | null; ended_at: number | null;
    duration: number | null; is_group_call: number; group_id: string | null;
    participants: string; mesh_route: string;
  }>(
    `SELECT * FROM calls
     WHERE caller_id = ? OR receiver_id = ?
     ORDER BY started_at DESC LIMIT 200;`,
    [userId, userId]
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type as Call['type'],
    callerId: r.caller_id,
    receiverId: r.receiver_id,
    status: r.status as Call['status'],
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    duration: r.duration ?? undefined,
    isGroupCall: r.is_group_call === 1,
    groupId: r.group_id ?? undefined,
    participants: parseJSON<string[]>(r.participants, []),
    meshRoute: parseJSON<string[]>(r.mesh_route, []),
  }));
},

async updateCallStatus(
  callId: string,
  status: Call['status'],
  extras: { endedAt?: number; duration?: number } = {}
): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `UPDATE calls SET status = ?, ended_at = COALESCE(?, ended_at),
     duration = COALESCE(?, duration) WHERE id = ?;`,
    [status, extras.endedAt ?? null, extras.duration ?? null, callId]
  );
},

async clearCalls(userId: string): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    'DELETE FROM calls WHERE caller_id = ? OR receiver_id = ?;',
    [userId, userId]
  );
},



  // ── Nearby devices ─────────────────────────────────────────────────────────

  async saveNearbyDevice(device: NearbyDevice): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO nearby_devices
       (id, name, device_id, bluetooth_id, rssi, distance, is_connected,
        connection_type, last_seen, capabilities, user_data)
       VALUES (?,?,?,?,?,?,?,?,?,?,?);`,
      [
        device.id, device.name, device.deviceId,
        device.bluetoothId ?? null,
        device.rssi, device.distance,
        device.isConnected ? 1 : 0,
        device.connectionType,
        device.lastSeen,
        toJSON(device.capabilities),
        device.user ? toJSON(device.user) : null,
      ]
    );
  },

  async getRecentNearbyDevices(withinMs: number = 300_000): Promise<NearbyDevice[]> {
    const db = await openDB();
    const rows = await db.getAllAsync<{
      id: string;
      name: string;
      device_id: string;
      bluetooth_id: string | null;
      rssi: number;
      distance: number;
      is_connected: number;
      connection_type: string;
      last_seen: number;
      capabilities: string;
      user_data: string | null;
    }>(
      `SELECT * FROM nearby_devices
       WHERE last_seen > ?
       ORDER BY last_seen DESC
       LIMIT 50;`,
      [Date.now() - withinMs]
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      deviceId: r.device_id,
      bluetoothId: r.bluetooth_id ?? undefined,
      rssi: r.rssi,
      distance: r.distance,
      isConnected: r.is_connected === 1,
      connectionType: r.connection_type as NearbyDevice['connectionType'],
      lastSeen: r.last_seen,
      capabilities: parseJSON<string[]>(r.capabilities, []),
      user: r.user_data
        ? parseJSON<User>(r.user_data, undefined as unknown as User)
        : undefined,
    }));
  },
  
// ——— Community setup
async getGroup(id: string): Promise<Group | null> {
  const db = await openDB();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM groups_table WHERE id = ?;',
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    avatar: row.avatar ?? undefined,
    members: parseJSON(row.members, []),
    admins: parseJSON(row.admins, []),
    createdBy: row.created_by,
    isPublic: row.is_public === 1,
    wallpaper: row.wallpaper ?? undefined,
    theme: parseJSON(row.theme_data, undefined),
    settings: parseJSON(row.settings, {
      whoCanSendMessages: 'everyone',
      whoCanAddMembers: 'admins',
      whoCanEditInfo: 'admins',
      disappearingMessages: 0,
      autoRelayShare: false,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
},

async createChat(chat: Chat): Promise<void> {
  const db = await openDB();

  try {
    await db.runAsync(
      `
      INSERT INTO chats (
        id,
        participants,
        last_message_id,
        unread_count,
        is_pinned,
        is_archived,
        is_muted,
        is_blocked,
        wallpaper,
        theme_data,
        mesh_route_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        chat.id,

        // participants array → stored as JSON string
        JSON.stringify(chat.participants),

        // nullable fields
        chat.lastMessageId ?? null,

        // counters
        chat.unreadCount ?? 0,

        // booleans → SQLite integers
        chat.isPinned ? 1 : 0,
        chat.isArchived ? 1 : 0,
        chat.isMuted ? 1 : 0,
        chat.isBlocked ? 1 : 0,

        // optional styling/meta
        chat.wallpaper ?? null,
        chat.themeData ? JSON.stringify(chat.themeData) : null,
        chat.meshRouteId ?? null,

        // timestamps
        chat.createdAt,
        chat.updatedAt,
      ]
    );
  } catch (error) {
    console.error('[DatabaseService] createChat error', error);
    throw error;
  }
},

async getCommunity(id: string): Promise<Community | null> {
  const db = await openDB();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM communities WHERE id = ?;',
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    avatar: row.avatar ?? undefined,
    banner: row.banner ?? undefined,
    owner: row.owner,
    admins: parseJSON(row.admins, []),
    groups: parseJSON(row.groups, []),
    members: parseJSON(row.members, []),
    isPublic: row.is_public === 1,
    category: row.category ?? undefined,
    rules: row.rules ?? undefined,
    announcement: row.announcement ?? undefined,
    createdAt: row.created_at,
  };
},

async getGroupsByCommunity(groupIds: string[]): Promise<Group[]> {
  if (groupIds.length === 0) return [];
  const db = await openDB();
  const placeholders = groupIds.map(() => '?').join(', ');
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM groups_table WHERE id IN (${placeholders}) ORDER BY created_at ASC;`,
    groupIds
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    avatar: row.avatar ?? undefined,
    members: parseJSON(row.members, []),
    admins: parseJSON(row.admins, []),
    createdBy: row.created_by,
    isPublic: row.is_public === 1,
    wallpaper: row.wallpaper ?? undefined,
    theme: parseJSON(row.theme_data, undefined),
    settings: parseJSON(row.settings, {
      whoCanSendMessages: 'everyone',
      whoCanAddMembers: 'admins',
      whoCanEditInfo: 'admins',
      disappearingMessages: 0,
      autoRelayShare: false,
    }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
},

async addGroupToCommunity(communityId: string, groupId: string): Promise<void> {
  const db = await openDB();
  const row = await db.getFirstAsync<{ groups: string }>(
    'SELECT groups FROM communities WHERE id = ?;',
    [communityId]
  );
  if (!row) return;
  const groups = parseJSON<string[]>(row.groups, []);
  if (!groups.includes(groupId)) {
    groups.push(groupId);
    await db.runAsync(
      'UPDATE communities SET groups = ? WHERE id = ?;',
      [toJSON(groups), communityId]
    );
  }
},

  // ── Users ──────────────────────────────────────────────────────────────────

  async saveUser(user: User): Promise<void> {
    const db = await openDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO users
       (id, name, email, about, avatar, device_id, bluetooth_id, level, xp,
        is_online, last_seen, public_key, marketplace_data, theme_data,
        created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      [
        user.id, user.name, user.email ?? null, user.about ?? null,
        user.avatar, user.deviceId, user.bluetoothId ?? null,
        user.level, user.xp, user.isOnline ? 1 : 0, user.lastSeen,
        user.publicKey,
        user.marketplace ? toJSON(user.marketplace) : null,
        user.theme ? toJSON(user.theme) : null,
        Date.now(), Date.now(),
      ]
    );
  },

  async getUserByDeviceId(deviceId: string): Promise<User | null> {
    const db = await openDB();
    const row = await db.getFirstAsync<{
      id: string; name: string; email: string | null; about: string | null;
      avatar: string; device_id: string; bluetooth_id: string | null;
      level: number; xp: number; is_online: number; last_seen: number;
      public_key: string; marketplace_data: string | null; theme_data: string | null;
    }>(
      'SELECT * FROM users WHERE device_id = ?;',
      [deviceId]
    );

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      email: row.email ?? undefined,
      about: row.about ?? undefined,
      avatar: row.avatar,
      deviceId: row.device_id,
      bluetoothId: row.bluetooth_id ?? undefined,
      level: row.level,
      xp: row.xp,
      isOnline: row.is_online === 1,
      lastSeen: row.last_seen,
      publicKey: row.public_key,
      marketplace: parseJSON(row.marketplace_data, undefined),
      theme: parseJSON(row.theme_data, undefined),
    };
  },
  
  // ———— Markeplace 
  async saveGroup(group: Group): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO groups_table
     (id, name, description, avatar, members, admins, created_by,
      is_public, wallpaper, theme_data, settings, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    [
      group.id, group.name, group.description ?? null,
      group.avatar ?? null, toJSON(group.members), toJSON(group.admins),
      group.createdBy, group.isPublic ? 1 : 0,
      group.wallpaper ?? null,
      group.theme ? toJSON(group.theme) : null,
      toJSON(group.settings),
      group.createdAt, group.updatedAt,
    ]
  );
},

async saveCommunity(community: Community): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO communities
     (id, name, description, avatar, banner, owner, admins, groups,
      members, is_public, category, rules, announcement, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    [
      community.id, community.name, community.description ?? null,
      community.avatar ?? null, community.banner ?? null,
      community.owner, toJSON(community.admins), toJSON(community.groups),
      toJSON(community.members), community.isPublic ? 1 : 0,
      community.category ?? null, community.rules ?? null,
      community.announcement ?? null, community.createdAt,
    ]
  );
},

async saveMarketplaceItem(item: MarketplaceItem): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO marketplace_items
     (id, seller_id, title, description, price, currency, images,
      category, condition, is_available, location,expiry_date, tags, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    [
      item.id, item.sellerId, item.title, item.description ?? null,
      item.price, item.currency, toJSON(item.images),
      item.category ?? null, item.condition, item.isAvailable ? 1 : 0,
      item.location ?? null,item.expiryDate ?? null, toJSON(item.tags),
      item.createdAt, item.updatedAt,
    ]
  );
},
async getMarketplaceItems(sellerId?: string): Promise<MarketplaceItem[]> {
  const db = await openDB();
  const now = Date.now();
  const rows = await db.getAllAsync<any>(
    sellerId
      ? `SELECT * FROM marketplace_items WHERE seller_id = ? AND (expiry_date IS NULL OR expiry_date > ?) ORDER BY created_at DESC;`
      : `SELECT * FROM marketplace_items WHERE is_available = 1 AND (expiry_date IS NULL OR expiry_date > ?) ORDER BY created_at DESC;`,
    sellerId ? [sellerId, now] : [now]
  );
  return rows.map((r) => ({
    id: r.id, sellerId: r.seller_id, title: r.title,
    description: r.description ?? undefined, price: r.price,
    currency: r.currency, images: parseJSON<string[]>(r.images, []),
    category: r.category ?? undefined,
    condition: r.condition as MarketplaceItem['condition'],
    isAvailable: r.is_available === 1,
    location: r.location ?? undefined,
    expiryDate: r.expiry_date ?? undefined,
    tags: parseJSON<string[]>(r.tags, []),
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
},
async deleteMarketplaceItem(itemId: string): Promise<void> {
  const db = await openDB();
  await db.runAsync('DELETE FROM marketplace_items WHERE id = ?;', [itemId]);
},

async deleteExpiredMarketplaceItems(): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    'DELETE FROM marketplace_items WHERE expiry_date IS NOT NULL AND expiry_date <= ?;',
    [Date.now()]
  );
},

// ——— Blocked users
  async blockUser(blockedUser: BlockedUser): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO blocked_users
     (user_id, blocked_user_id, blocked_at, reason)
     VALUES (?,?,?,?);`,
    [blockedUser.userId, blockedUser.blockedUserId,
     blockedUser.blockedAt, blockedUser.reason ?? null]
  );
},

async unblockUser(userId: string, blockedUserId: string): Promise<void> {
  const db = await openDB();
  await db.runAsync(
    'DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?;',
    [userId, blockedUserId]
  );
},

async getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const db = await openDB();
  const rows = await db.getAllAsync<{
    user_id: string; blocked_user_id: string;
    blocked_at: number; reason: string | null;
  }>(
    'SELECT * FROM blocked_users WHERE user_id = ? ORDER BY blocked_at DESC;',
    [userId]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    blockedUserId: r.blocked_user_id,
    blockedAt: r.blocked_at,
    reason: r.reason ?? undefined,
  }));
},

async isUserBlocked(userId: string, targetUserId: string): Promise<boolean> {
  const db = await openDB();
  const row = await db.getFirstAsync<{ user_id: string }>(
    'SELECT user_id FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?;',
    [userId, targetUserId]
  );
  return !!row;
},



  // ── Cleanup ────────────────────────────────────────────────────────────────

  async cleanupExpiredData(): Promise<void> {
    const db = await openDB();
    const now = Date.now();

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM statuses WHERE expires_at < ?;', [now]);
      await db.runAsync(
        'DELETE FROM nearby_devices WHERE last_seen < ?;',
        [now - 600_000]
      );
      await db.runAsync(
        `UPDATE mesh_routes
         SET is_active = 0
         WHERE last_used < ? AND is_active = 1;`,
        [now - 3_600_000]
      );
      await db.runAsync(
        'DELETE FROM pending_messages WHERE retry_count >= max_retries;'
      );
      await db.runAsync(
  'DELETE FROM marketplace_items WHERE expiry_date IS NOT NULL AND expiry_date <= ?;', [now]
);
      await db.runAsync(
        'DELETE FROM message_dedup WHERE received_at < ?;',
        [now - 300_000]
      );
    });
  },
};
