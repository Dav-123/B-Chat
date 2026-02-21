import React, { useContext, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, Alert } from 'react-native';
import { ChatContext } from '../context/ChatContext';
import { AuthContext } from '../context/AuthContext';
import { createGroup } from '../services/database';
import Icon from 'react-native-vector-icons/Ionicons';
import { pickImage, saveProfilePicture } from '../services/fileService';

const NewGroupScreen = ({ navigation }) => {
  const { contacts, loadGroups } = useContext(ChatContext);
  const { user } = useContext(AuthContext);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupPic, setGroupPic] = useState(null);

  const handlePickImage = async () => {
    try {
      const image = await pickImage();
      if (image) {
        setGroupPic(image.path);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const toggleMember = (contactId) => {
    setSelectedMembers(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter group name');
      return;
    }

    if (selectedMembers.length === 0) {
      Alert.alert('Error', 'Please select at least one member');
      return;
    }

    try {
      const members = [user.id, ...selectedMembers];
      await createGroup(groupName, groupDescription, user.id, members);
      await loadGroups();
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to create group');
    }
  };

  const renderContact = ({ item }) => {
    const isSelected = selectedMembers.includes(item.contactId);

    return (
      <TouchableOpacity
        style={styles.contactItem}
        onPress={() => toggleMember(item.contactId)}
      >
        <View style={styles.avatarContainer}>
          {item.contactProfilePic ? (
            <Image source={{ uri: item.contactProfilePic }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>
                {item.contactName?.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.contactName}>{item.contactName}</Text>

        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Icon name="checkmark" size={18} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Group</Text>
        <TouchableOpacity onPress={handleCreateGroup}>
          <Icon name="checkmark" size={24} color="#25D366" />
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <TouchableOpacity style={styles.groupPicContainer} onPress={handlePickImage}>
          {groupPic ? (
            <Image source={{ uri: groupPic }} style={styles.groupPic} />
          ) : (
            <View style={styles.groupPicPlaceholder}>
              <Icon name="camera" size={30} color="#888" />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Group Name"
            placeholderTextColor="#888"
            value={groupName}
            onChangeText={setGroupName}
          />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Group Description (optional)"
            placeholderTextColor="#888"
            value={groupDescription}
            onChangeText={setGroupDescription}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Members ({selectedMembers.length})</Text>
        <FlatList
          data={contacts}
          renderItem={renderContact}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.contactsList}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    paddingTop: 50,
    backgroundColor: '#1C2834',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  form: {
    padding: 20,
    backgroundColor: '#1C2834',
    marginBottom: 10,
  },
  groupPicContainer: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  groupPic: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  groupPicPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#0B141A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    backgroundColor: '#0B141A',
    borderRadius: 8,
    marginBottom: 10,
  },
  input: {
    height: 50,
    paddingHorizontal: 15,
    color: '#FFFFFF',
    fontSize: 16,
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    padding: 15,
    paddingBottom: 10,
  },
  contactsList: {
    paddingBottom: 20,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1C2834',
  },
  avatarContainer: {
    marginRight: 15,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
  },
  avatarPlaceholder: {
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  contactName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#888',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#25D366',
    borderColor: '#25D366',
  },
});

export default NewGroupScreen;