import React, { useContext, useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { ChatContext } from '../context/ChatContext';
import { AuthContext } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { pickImage, pickDocument, startRecording, stopRecording, playAudio, stopAudio } from '../services/fileService';

const ChatScreen = ({ route, navigation }) => {
  const { contact, group, isGroup } = route.params;
  const { user } = useContext(AuthContext);
  const { messages, loadMessages, sendMessage, sendFileMessage, setActiveChat } = useContext(ChatContext);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPath, setRecordingPath] = useState(null);
  const [playingAudio, setPlayingAudio] = useState(null);
  const flatListRef = useRef(null);

  const chatId = isGroup ? group.id : contact.contactId;
  const chatMessages = messages[chatId] || [];

  useEffect(() => {
    setActiveChat(chatId);
    loadMessages(chatId, isGroup);

    return () => setActiveChat(null);
  }, [chatId]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [chatMessages]);

  const handleSend = async () => {
    if (!inputText.trim()) return;

    await sendMessage(
      isGroup ? null : contact.contactId,
      inputText.trim(),
      'text',
      null,
      isGroup ? group.id : null
    );

    setInputText('');
  };

  const handleImagePick = async () => {
    try {
      const image = await pickImage();
      if (image) {
        await sendFileMessage(
          isGroup ? null : contact.contactId,
          image,
          isGroup ? group.id : null
        );
      }
    } catch (error) {
      console.error('Image pick error:', error);
    }
  };

  const handleDocumentPick = async () => {
    try {
      const document = await pickDocument();
      if (document) {
        await sendFileMessage(
          isGroup ? null : contact.contactId,
          document,
          isGroup ? group.id : null
        );
      }
    } catch (error) {
      console.error('Document pick error:', error);
    }
  };

  const handleStartRecording = async () => {
    try {
      const path = await startRecording();
      setRecordingPath(path);
      setIsRecording(true);
    } catch (error) {
      console.error('Start recording error:', error);
    }
  };

  const handleStopRecording = async () => {
    try {
      const voice = await stopRecording();
      setIsRecording(false);
      
      if (voice) {
        await sendFileMessage(
          isGroup ? null : contact.contactId,
          voice,
          isGroup ? group.id : null
        );
      }
      
      setRecordingPath(null);
    } catch (error) {
      console.error('Stop recording error:', error);
      setIsRecording(false);
    }
  };

  const handlePlayAudio = async (path) => {
    try {
      if (playingAudio === path) {
        await stopAudio();
        setPlayingAudio(null);
      } else {
        if (playingAudio) {
          await stopAudio();
        }
        await playAudio(path);
        setPlayingAudio(path);
      }
    } catch (error) {
      console.error('Play audio error:', error);
    }
  };

  const renderMessage = ({ item }) => {
    const isMine = item.senderId === user.id;

    return (
      <View style={[styles.messageBubble, isMine ? styles.myMessage : styles.theirMessage]}>
        {!isMine && isGroup && (
          <Text style={styles.senderName}>{item.senderId}</Text>
        )}
        
        {item.messageType === 'text' && (
          <Text style={styles.messageText}>{item.content}</Text>
        )}
        
        {item.messageType === 'image' && (
          <Image source={{ uri: item.filePath }} style={styles.messageImage} />
        )}
        
        {item.messageType === 'document' && (
          <View style={styles.documentContainer}>
            <Icon name="document" size={30} color="#FFFFFF" />
            <Text style={styles.documentName}>{item.content}</Text>
          </View>
        )}
        
        {item.messageType === 'voice' && (
          <TouchableOpacity
            style={styles.voiceContainer}
            onPress={() => handlePlayAudio(item.filePath)}
          >
            <Icon
              name={playingAudio === item.filePath ? 'pause-circle' : 'play-circle'}
              size={30}
              color="#FFFFFF"
            />
            <Text style={styles.voiceText}>Voice Message</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.messageFooter}>
          <Text style={styles.messageTime}>
            {new Date(item.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>
          {isMine && (
            <Icon
              name={item.status === 'delivered' ? 'checkmark-done' : 'checkmark'}
              size={16}
              color={item.status === 'delivered' ? '#25D366' : '#888'}
            />
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatar}>
            {(isGroup ? group.profilePic : contact.contactProfilePic) ? (
              <Image
                source={{ uri: isGroup ? group.profilePic : contact.contactProfilePic }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Icon name={isGroup ? 'people' : 'person'} size={20} color="#FFFFFF" />
              </View>
            )}
          </View>
          <View>
            <Text style={styles.headerName}>
              {isGroup ? group.name : contact.contactName}
            </Text>
            {!isGroup && contact.isOnline === 1 && (
              <Text style={styles.headerStatus}>
                Online • {contact.distance}m away
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', { chatId, isGroup })}>
          <Icon name="information-circle-outline" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={chatMessages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={handleImagePick}>
          <Icon name="image" size={24} color="#888" style={styles.inputIcon} />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={handleDocumentPick}>
          <Icon name="document" size={24} color="#888" style={styles.inputIcon} />
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#888"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />

        {inputText.trim() ? (
          <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
            <Icon name="send" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            style={[styles.sendButton, isRecording && styles.recordingButton]}
          >
            <Icon name="mic" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingTop: 50,
    backgroundColor: '#1C2834',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 15,
  },
  headerAvatar: {
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerStatus: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  messagesList: {
    padding: 15,
    paddingBottom: 5,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#005C4B',
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#1C2834',
  },
  senderName: {
    color: '#25D366',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  documentName: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  voiceText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 10,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    color: '#888',
    fontSize: 11,
    marginRight: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#1C2834',
  },
  inputIcon: {
    marginHorizontal: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0B141A',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    color: '#FFFFFF',
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  recordingButton: {
    backgroundColor: '#DC4437',
  },
});

export default ChatScreen;