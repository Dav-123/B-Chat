import SQLite from 'react-native-sqlite-storage';

SQLite.enablePromise(true);

let db;

export const initDatabase = async () => {
  try {
    db = await SQLite.openDatabase({ name: 'bchat.db', location: 'default' });
    
    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        displayName TEXT,
        profilePic TEXT,
        pin TEXT,
        createdAt INTEGER
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        userId TEXT,
        contactId TEXT,
        contactName TEXT,
        contactProfilePic TEXT,
        deviceAddress TEXT,
        lastSeen INTEGER,
        isOnline INTEGER DEFAULT 0,
        distance REAL,
        FOREIGN KEY(userId) REFERENCES users(id)
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        createdBy TEXT,
        profilePic TEXT,
        createdAt INTEGER,
        FOREIGN KEY(createdBy) REFERENCES users(id)
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS group_members (
        id TEXT PRIMARY KEY,
        groupId TEXT,
        userId TEXT,
        isAdmin INTEGER DEFAULT 0,
        joinedAt INTEGER,
        FOREIGN KEY(groupId) REFERENCES groups(id),
        FOREIGN KEY(userId) REFERENCES users(id)
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        senderId TEXT,
        recipientId TEXT,
        groupId TEXT,
        content TEXT,
        messageType TEXT,
        filePath TEXT,
        fileSize INTEGER,
        duration INTEGER,
        status TEXT DEFAULT 'sent',
        timestamp INTEGER,
        isProximityBased INTEGER DEFAULT 0,
        proximityLocation TEXT,
        FOREIGN KEY(senderId) REFERENCES users(id)
      )
    `);

    await db.executeSql(`
      CREATE TABLE IF NOT EXISTS message_queue (
        id TEXT PRIMARY KEY,
        messageId TEXT,
        recipientId TEXT,
        attempts INTEGER DEFAULT 0,
        lastAttempt INTEGER,
        FOREIGN KEY(messageId) REFERENCES messages(id)
      )
    `);

    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

export const createUser = async (username, displayName, pin) => {
  const userId = generateId();
  const timestamp = Date.now();
  
  await db.executeSql(
    'INSERT INTO users (id, username, displayName, pin, createdAt) VALUES (?, ?, ?, ?, ?)',
    [userId, username, displayName, pin, timestamp]
  );
  
  return userId;
};

export const getUserByUsername = async (username) => {
  const result = await db.executeSql('SELECT * FROM users WHERE username = ?', [username]);
  if (result[0].rows.length > 0) {
    return result[0].rows.item(0);
  }
  return null;
};

export const getCurrentUser = async () => {
  const result = await db.executeSql('SELECT * FROM users LIMIT 1');
  if (result[0].rows.length > 0) {
    return result[0].rows.item(0);
  }
  return null;
};

export const updateUserProfile = async (userId, updates) => {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = [...Object.values(updates), userId];
  
  await db.executeSql(
    `UPDATE users SET ${fields} WHERE id = ?`,
    values
  );
};

export const saveContact = async (userId, contact) => {
  const contactId = generateId();
  
  await db.executeSql(
    'INSERT OR REPLACE INTO contacts (id, userId, contactId, contactName, contactProfilePic, deviceAddress, lastSeen, isOnline, distance) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [contactId, userId, contact.id, contact.name, contact.profilePic, contact.deviceAddress, Date.now(), 1, contact.distance]
  );
};

export const getContacts = async (userId) => {
  const result = await db.executeSql(
    'SELECT * FROM contacts WHERE userId = ? ORDER BY isOnline DESC, lastSeen DESC',
    [userId]
  );
  
  const contacts = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    contacts.push(result[0].rows.item(i));
  }
  return contacts;
};

export const updateContactStatus = async (contactId, isOnline, distance) => {
  await db.executeSql(
    'UPDATE contacts SET isOnline = ?, distance = ?, lastSeen = ? WHERE contactId = ?',
    [isOnline ? 1 : 0, distance, Date.now(), contactId]
  );
};

export const createGroup = async (name, description, createdBy, members) => {
  const groupId = generateId();
  const timestamp = Date.now();
  
  await db.executeSql(
    'INSERT INTO groups (id, name, description, createdBy, createdAt) VALUES (?, ?, ?, ?, ?)',
    [groupId, name, description, createdBy, timestamp]
  );
  
  for (const memberId of members) {
    const memberEntryId = generateId();
    await db.executeSql(
      'INSERT INTO group_members (id, groupId, userId, isAdmin, joinedAt) VALUES (?, ?, ?, ?, ?)',
      [memberEntryId, groupId, memberId, memberId === createdBy ? 1 : 0, timestamp]
    );
  }
  
  return groupId;
};

export const getGroups = async (userId) => {
  const result = await db.executeSql(
    `SELECT g.* FROM groups g 
     INNER JOIN group_members gm ON g.id = gm.groupId 
     WHERE gm.userId = ? 
     ORDER BY g.createdAt DESC`,
    [userId]
  );
  
  const groups = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    groups.push(result[0].rows.item(i));
  }
  return groups;
};

export const getGroupMembers = async (groupId) => {
  const result = await db.executeSql(
    `SELECT c.*, gm.isAdmin FROM contacts c 
     INNER JOIN group_members gm ON c.contactId = gm.userId 
     WHERE gm.groupId = ?`,
    [groupId]
  );
  
  const members = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    members.push(result[0].rows.item(i));
  }
  return members;
};

export const addGroupMember = async (groupId, userId) => {
  const memberEntryId = generateId();
  await db.executeSql(
    'INSERT INTO group_members (id, groupId, userId, isAdmin, joinedAt) VALUES (?, ?, ?, ?, ?)',
    [memberEntryId, groupId, userId, 0, Date.now()]
  );
};

export const removeGroupMember = async (groupId, userId) => {
  await db.executeSql(
    'DELETE FROM group_members WHERE groupId = ? AND userId = ?',
    [groupId, userId]
  );
};

export const saveMessage = async (message) => {
  await db.executeSql(
    `INSERT INTO messages (id, senderId, recipientId, groupId, content, messageType, filePath, fileSize, duration, status, timestamp, isProximityBased, proximityLocation) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.senderId,
      message.recipientId,
      message.groupId,
      message.content,
      message.messageType,
      message.filePath,
      message.fileSize,
      message.duration,
      message.status,
      message.timestamp,
      message.isProximityBased ? 1 : 0,
      message.proximityLocation
    ]
  );
};

export const getMessages = async (chatId, isGroup = false, currentLocation = null) => {
  let query;
  let params;
  
  if (isGroup) {
    if (currentLocation) {
      query = 'SELECT * FROM messages WHERE groupId = ? AND (isProximityBased = 0 OR proximityLocation = ?) ORDER BY timestamp ASC';
      params = [chatId, currentLocation];
    } else {
      query = 'SELECT * FROM messages WHERE groupId = ? AND isProximityBased = 0 ORDER BY timestamp ASC';
      params = [chatId];
    }
  } else {
    query = 'SELECT * FROM messages WHERE (senderId = ? OR recipientId = ?) ORDER BY timestamp ASC';
    params = [chatId, chatId];
  }
  
  const result = await db.executeSql(query, params);
  
  const messages = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    messages.push(result[0].rows.item(i));
  }
  return messages;
};

export const updateMessageStatus = async (messageId, status) => {
  await db.executeSql(
    'UPDATE messages SET status = ? WHERE id = ?',
    [status, messageId]
  );
};

export const addToMessageQueue = async (messageId, recipientId) => {
  const queueId = generateId();
  await db.executeSql(
    'INSERT INTO message_queue (id, messageId, recipientId, attempts, lastAttempt) VALUES (?, ?, ?, ?, ?)',
    [queueId, messageId, recipientId, 0, Date.now()]
  );
};

export const getMessageQueue = async () => {
  const result = await db.executeSql(
    'SELECT * FROM message_queue WHERE attempts < 10 ORDER BY lastAttempt ASC'
  );
  
  const queue = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    queue.push(result[0].rows.item(i));
  }
  return queue;
};

export const updateQueueAttempt = async (queueId) => {
  await db.executeSql(
    'UPDATE message_queue SET attempts = attempts + 1, lastAttempt = ? WHERE id = ?',
    [Date.now(), queueId]
  );
};

export const removeFromQueue = async (queueId) => {
  await db.executeSql('DELETE FROM message_queue WHERE id = ?', [queueId]);
};

export const searchMessages = async (searchTerm, userId) => {
  const result = await db.executeSql(
    `SELECT * FROM messages 
     WHERE (senderId = ? OR recipientId = ?) 
     AND content LIKE ? 
     ORDER BY timestamp DESC LIMIT 50`,
    [userId, userId, `%${searchTerm}%`]
  );
  
  const messages = [];
  for (let i = 0; i < result[0].rows.length; i++) {
    messages.push(result[0].rows.item(i));
  }
  return messages;
};

export const cleanOldMedia = async (daysOld = 30) => {
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  
  const result = await db.executeSql(
    'SELECT filePath FROM messages WHERE timestamp < ? AND filePath IS NOT NULL',
    [cutoffTime]
  );
  
  const RNFS = require('react-native-fs');
  
  for (let i = 0; i < result[0].rows.length; i++) {
    const filePath = result[0].rows.item(i).filePath;
    if (filePath) {
      try {
        await RNFS.unlink(filePath);
      } catch (err) {
        console.log('Error deleting file:', err);
      }
    }
  }
  
  await db.executeSql(
    'UPDATE messages SET filePath = NULL WHERE timestamp < ? AND filePath IS NOT NULL',
    [cutoffTime]
  );
};

const generateId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default {
  initDatabase,
  getDatabase,
  createUser,
  getUserByUsername,
  getCurrentUser,
  updateUserProfile,
  saveContact,
  getContacts,
  updateContactStatus,
  createGroup,
  getGroups,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
  saveMessage,
  getMessages,
  updateMessageStatus,
  addToMessageQueue,
  getMessageQueue,
  updateQueueAttempt,
  removeFromQueue,
  searchMessages,
  cleanOldMedia
};