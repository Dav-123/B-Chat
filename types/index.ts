export interface User {
  id: string;
  name: string;
  email?: string;
  about?: string;
  avatar: string;
  deviceId: string;
  level: number;
  xp: number;
  isOnline: boolean;
  lastSeen: number;
  bluetoothId?: string;
  publicKey: string;
  marketplace?: MarketplaceProfile;
  theme?: ChatTheme;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: MessageType;
  timestamp: number;
  status: MessageStatus;
  encrypted: boolean;
  hopCount: number;
  routePath: string[];
  replyTo?: string;
  reactions?: Reaction[];
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  thumbnail?: string;
  isForwarded?: boolean;
  isDeleted?: boolean;
  readBy?: ReadReceipt[];
  deliveredAt?: number;
  readAt?: number;
}

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voiceNote'
  | 'file'
  | 'document'
  | 'location'
  | 'sticker'
  | 'gif'
  | 'call';

export type MessageStatus =
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'pending'
  | 'queued';

export interface ReadReceipt {
  userId: string;
  avatar: string;
  readAt: number;
}

export interface Reaction {
  emoji: string;
  userId: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  createdAt: number;
  updatedAt: number;
  wallpaper?: string;
  theme?: ChatTheme;
  meshRouteId?: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  avatar: string;
  members: GroupMember[];
  admins: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  wallpaper?: string;
  theme?: ChatTheme;
  settings: GroupSettings;
}

export interface GroupMember {
  userId: string;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: number;
  addedBy: string;
}

export interface GroupSettings {
  whoCanSendMessages: 'everyone' | 'admins';
  whoCanAddMembers: 'everyone' | 'admins';
  whoCanEditInfo: 'everyone' | 'admins';
  disappearingMessages: number;
  autoRelayShare: boolean;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  avatar: string;
  banner?: string;
  owner: string;
  admins: string[];
  groups: string[];
  members: string[];
  createdAt: number;
  isPublic: boolean;
  category: string;
  rules?: string;
  announcement?: string;
}

export interface Status {
  id: string;
  userId: string;
  type: 'text' | 'image' | 'video' | 'voice';
  content: string;
  mediaUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  font?: string;
  views: StatusView[];
  createdAt: number;
  expiresAt: number;
  caption?: string;
  duration?: number;
}

export interface StatusView {
  userId: string;
  viewedAt: number;
}

export interface MeshRoute {
  id: string;
  fromDevice: string;
  toDevice: string;
  path: string[];
  signalStrength: number;
  hopCount: number;
  latency: number;
  lastUsed: number;
  reliability: number;
  isActive: boolean;
}

export interface MeshPacket {
  id: string;
  type: PacketType;
  payload: string;
  fromDevice: string;
  toDevice: string;
  routePath: string[];
  hopCount: number;
  maxHops: number;
  timestamp: number;
  ttl: number;
  encrypted: boolean;
  checksum: string;
  priority: PacketPriority;
}

export type PacketType =
  | 'message'
  | 'file_chunk'
  | 'discovery'
  | 'route_request'
  | 'route_reply'
  | 'ack'
  | 'heartbeat'
  | 'relay_share';

export type PacketPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NearbyDevice {
  id: string;
  name: string;
  deviceId: string;
  bluetoothId: string;
  rssi: number;
  distance: number;
  isConnected: boolean;
  connectionType: 'ble' | 'classic' | 'wifi_direct';
  user?: User;
  lastSeen: number;
  capabilities: string[];
}

export interface Call {
  id: string;
  type: 'voice' | 'video';
  callerId: string;
  receiverId: string;
  status: CallStatus;
  startedAt?: number;
  endedAt?: number;
  duration?: number;
  isGroupCall?: boolean;
  groupId?: string;
  participants?: string[];
  meshRoute?: string[];
}

export type CallStatus =
  | 'ringing'
  | 'accepted'
  | 'rejected'
  | 'missed'
  | 'ended'
  | 'busy';

export interface MarketplaceItem {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  category: string;
  condition: 'new' | 'like_new' | 'good' | 'fair';
  isAvailable: boolean;
  createdAt: number;
  updatedAt: number;
  location?: string;
  tags: string[];
}

export interface MarketplaceProfile {
  items: MarketplaceItem[];
  businessName?: string;
  businessDescription?: string;
  rating: number;
  reviewCount: number;
}

export interface ChatTheme {
  id: string;
  name: string;
  wallpaper?: string;
  wallpaperType: 'image' | 'color' | 'gradient';
  backgroundColor?: string;
  sentBubbleColor?: string;
  receivedBubbleColor?: string;
  textColor?: string;
  accentColor?: string;
  gradient?: string[];
}

export interface FileTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  senderId: string;
  receiverIds: string[];
  chunks: FileChunk[];
  totalChunks: number;
  transferredChunks: number;
  status: FileTransferStatus;
  isAutoRelay: boolean;
  progress: number;
  startedAt: number;
  completedAt?: number;
  localPath?: string;
}

export type FileTransferStatus =
  | 'preparing'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FileChunk {
  index: number;
  data: string;
  checksum: string;
  size: number;
}

export interface BlockedUser {
  userId: string;
  blockedAt: number;
  reason?: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  isRead: boolean;
  createdAt: number;
}

export type NotificationType =
  | 'message'
  | 'call'
  | 'status'
  | 'group_invite'
  | 'file_transfer'
  | 'nearby_user'
  | 'mesh_route'
  | 'auto_relay';

export interface AppSettings {
  darkMode: boolean;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  autoDownloadImages: boolean;
  autoDownloadVideos: boolean;
  autoDownloadDocuments: boolean;
  readReceipts: boolean;
  lastSeenVisibility: 'everyone' | 'contacts' | 'nobody';
  profilePhotoVisibility: 'everyone' | 'contacts' | 'nobody';
  aboutVisibility: 'everyone' | 'contacts' | 'nobody';
  meshEnabled: boolean;
  autoRelayEnabled: boolean;
  batteryOptimization: boolean;
  language: string;
  fontSize: 'small' | 'medium' | 'large';
  chatBackupEnabled: boolean;
  encryptionEnabled: boolean;
}