import React, { createContext, useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { getContacts, getGroups, getMessages, saveMessage, updateMessageStatus } from '../services/database';
import BluetoothService from '../services/bluetooth';
import NotificationService from '../services/notifications';

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { user } = useContext(AuthContext);
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [messages, setMessages] = useState({});
  const [activeChat, setActiveChat] = useState(null);
  const [isInApp, setIsInApp] = useState(true);

  useEffect(() => {
    if (user) {
      loadContacts();
      loadGroups();
      startBluetoothDiscovery();
      
      BluetoothService.setMessageReceivedCallback(handleMessageReceived);
    }
  }, [user]);

  const loadContacts = async () => {
    try {
      const contactsList = await getContacts(user.id);
      setContacts(contactsList);
    } catch (error) {
      console.error('Load contacts error:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const groupsList = await getGroups(user.id);
      setGroups(groupsList);
    } catch (error) {
      console.error('Load groups error:', error);
    }
  };

  const loadMessages = async (chatId, isGroup = false) => {
    try {
      const messagesList = await getMessages(chatId, isGroup);
      setMessages(prev => ({ ...prev, [chatId]: messagesList }));
    } catch (error) {
      console.error('Load messages error:', error);
    }
  };

  const startBluetoothDiscovery = async () => {
    await BluetoothService.startDiscovery();
    
    setInterval(async () => {
      await BluetoothService.startDiscovery();
    }, 10000);
  };

  const handleMessageReceived = async (deviceId, message) => {
    try {
      await saveMessage(message);
      
      if (activeChat !== message.senderId && activeChat !== message.groupId) {
        if (!isInApp) {
          if (message.groupId) {
            const group = groups.find(g => g.id === message.groupId);
            const sender = contacts.find(c => c.contactId === message.senderId);
            NotificationService.showGroupMessageNotification(
              group?.name || 'Group',
              sender?.contactName || 'Someone',
              message.content,
              message.groupId
            );
          } else {
            const sender = contacts.find(c => c.contactId === message.senderId);
            NotificationService.showMessageNotification(
              sender?.contactName || 'Someone',
              message.content,
              message.senderId
            );
          }
        }
      }
      
      if (message.groupId) {
        loadMessages(message.groupId, true);
      } else {
        loadMessages(message.senderId, false);
      }
      
      await updateMessageStatus(message.id, 'delivered');
    } catch (error) {
      console.error('Handle message received error:', error);
    }
  };

  const sendMessage = async (recipientId, content, messageType = 'text', filePath = null, groupId = null) => {
    try {
      const messageId = generateId();
      const message = {
        id: messageId,
        senderId: user.id,
        recipientId: groupId ? null : recipientId,
        groupId: groupId,
        content: content,
        messageType: messageType,
        filePath: filePath,
        status: 'sent',
        timestamp: Date.now(),
        isProximityBased: groupId ? 1 : 0,
        proximityLocation: groupId ? 'location_1' : null
      };

      await saveMessage(message);
      
      if (groupId) {
        loadMessages(groupId, true);
      } else {
        loadMessages(recipientId, false);
      }

      const sent = await BluetoothService.sendMessage(recipientId, message);
      
      if (sent) {
        await updateMessageStatus(messageId, 'delivered');
      }

      return { success: true, messageId };
    } catch (error) {
      console.error('Send message error:', error);
      return { success: false, error: error.message };
    }
  };

  const sendFileMessage = async (recipientId, file, groupId = null) => {
    try {
      return await sendMessage(
        recipientId,
        file.fileName,
        file.type,
        file.path,
        groupId
      );
    } catch (error) {
      console.error('Send file message error:', error);
      return { success: false, error: error.message };
    }
  };

  const generateId = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  return (
    <ChatContext.Provider value={{
      contacts,
      groups,
      messages,
      activeChat,
      setActiveChat,
      loadContacts,
      loadGroups,
      loadMessages,
      sendMessage,
      sendFileMessage,
      setIsInApp
    }}>
      {children}
    </ChatContext.Provider>
  );
};