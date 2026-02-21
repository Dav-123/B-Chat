import React, { useContext, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, Switch } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/Ionicons';
import { pickImage, saveProfilePicture } from '../services/fileService';
import { updateUserProfile } from '../services/database';
import { cleanOldMedia } from '../services/database';

const ProfileScreen = ({ navigation }) => {
  const { user, logout } = useContext(AuthContext);
  const [autoCleanMedia, setAutoCleanMedia] = useState(true);

  const handleUpdateProfilePic = async () => {
    try {
      const image = await pickImage();
      if (image) {
        const savedPath = await saveProfilePicture(image.path, user.id);
        await updateUserProfile(user.id, { profilePic: savedPath });
        Alert.alert('Success', 'Profile picture updated');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile picture');
    }
  };

  const handleCleanMedia = async () => {
    Alert.alert(
      'Clean Old Media',
      'Delete media files older than 30 days?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await cleanOldMedia(30);
            Alert.alert('Success', 'Old media cleaned');
          }
        }
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: logout }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.profileSection}>
        <TouchableOpacity onPress={handleUpdateProfilePic}>
          {user.profilePic ? (
            <Image source={{ uri: user.profilePic }} style={styles.profilePic} />
          ) : (
            <View style={[styles.profilePic, styles.profilePicPlaceholder]}>
              <Icon name="person" size={60} color="#FFFFFF" />
            </View>
          )}
          <View style={styles.cameraIconContainer}>
            <Icon name="camera" size={20} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        <Text style={styles.displayName}>{user.displayName}</Text>
        <Text style={styles.username}>@{user.username}</Text>
      </View>

      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Settings</Text>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="trash-outline" size={24} color="#FFFFFF" style={styles.settingIcon} />
            <View>
              <Text style={styles.settingLabel}>Auto Clean Media</Text>
              <Text style={styles.settingDescription}>Delete old media automatically</Text>
            </View>
          </View>
          <Switch
            value={autoCleanMedia}
            onValueChange={setAutoCleanMedia}
            trackColor={{ false: '#1C2834', true: '#25D366' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity style={styles.settingItem} onPress={handleCleanMedia}>
          <Icon name="trash-bin-outline" size={24} color="#FFFFFF" style={styles.settingIcon} />
          <Text style={styles.settingLabel}>Clean Old Media Now</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Icon name="bluetooth" size={24} color="#FFFFFF" style={styles.settingIcon} />
          <Text style={styles.settingLabel}>Bluetooth Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Icon name="notifications-outline" size={24} color="#FFFFFF" style={styles.settingIcon} />
          <Text style={styles.settingLabel}>Notifications</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Icon name="help-circle-outline" size={24} color="#FFFFFF" style={styles.settingIcon} />
          <Text style={styles.settingLabel}>Help & Support</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Icon name="information-circle-outline" size={24} color="#FFFFFF" style={styles.settingIcon} />
          <Text style={styles.settingLabel}>About B-Chat</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Icon name="log-out-outline" size={24} color="#DC4437" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
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
  profileSection: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#1C2834',
    marginBottom: 20,
  },
  profilePic: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  profilePicPlaceholder: {
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1C2834',
  },
  displayName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 15,
  },
  username: {
    color: '#888',
    fontSize: 16,
    marginTop: 5,
  },
  settingsSection: {
    backgroundColor: '#1C2834',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    padding: 15,
    paddingBottom: 5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#0B141A',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 15,
  },
  settingLabel: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  settingDescription: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#1C2834',
  },
  logoutText: {
    color: '#DC4437',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default ProfileScreen;