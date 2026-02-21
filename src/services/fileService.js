import RNFS from 'react-native-fs';
import { launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker from 'react-native-document-picker';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';

const audioRecorderPlayer = new AudioRecorderPlayer();

const FILE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB
  pdf: 20 * 1024 * 1024, // 20MB
  voice: 5 * 1024 * 1024, // 5MB
  voiceDuration: 300000 // 5 minutes in ms
};

export const pickImage = async () => {
  try {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1920,
    });

    if (result.didCancel) return null;
    if (result.errorCode) throw new Error(result.errorMessage);

    const asset = result.assets[0];
    
    if (asset.fileSize > FILE_LIMITS.image) {
      throw new Error('Image size exceeds 10MB limit');
    }

    const fileName = `IMG_${Date.now()}.jpg`;
    const destPath = `${RNFS.DocumentDirectoryPath}/media/${fileName}`;
    
    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/media`);
    await RNFS.copyFile(asset.uri, destPath);

    return {
      path: destPath,
      size: asset.fileSize,
      type: 'image',
      fileName
    };
  } catch (error) {
    console.error('Image picker error:', error);
    throw error;
  }
};

export const pickDocument = async () => {
  try {
    const result = await DocumentPicker.pick({
      type: [DocumentPicker.types.pdf],
    });

    if (result[0].size > FILE_LIMITS.pdf) {
      throw new Error('PDF size exceeds 20MB limit');
    }

    const fileName = `DOC_${Date.now()}.pdf`;
    const destPath = `${RNFS.DocumentDirectoryPath}/documents/${fileName}`;
    
    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/documents`);
    await RNFS.copyFile(result[0].uri, destPath);

    return {
      path: destPath,
      size: result[0].size,
      type: 'document',
      fileName: result[0].name
    };
  } catch (error) {
    if (DocumentPicker.isCancel(error)) {
      return null;
    }
    console.error('Document picker error:', error);
    throw error;
  }
};

export const startRecording = async () => {
  try {
    const path = `${RNFS.DocumentDirectoryPath}/audio/voice_${Date.now()}.m4a`;
    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/audio`);
    
    await audioRecorderPlayer.startRecorder(path);
    
    return path;
  } catch (error) {
    console.error('Start recording error:', error);
    throw error;
  }
};

export const stopRecording = async () => {
  try {
    const result = await audioRecorderPlayer.stopRecorder();
    const stats = await RNFS.stat(result);
    
    if (stats.size > FILE_LIMITS.voice) {
      await RNFS.unlink(result);
      throw new Error('Voice note exceeds 5MB limit');
    }

    return {
      path: result,
      size: stats.size,
      type: 'voice',
      duration: 0
    };
  } catch (error) {
    console.error('Stop recording error:', error);
    throw error;
  }
};

export const playAudio = async (path) => {
  try {
    await audioRecorderPlayer.startPlayer(path);
  } catch (error) {
    console.error('Play audio error:', error);
    throw error;
  }
};

export const stopAudio = async () => {
  try {
    await audioRecorderPlayer.stopPlayer();
  } catch (error) {
    console.error('Stop audio error:', error);
  }
};

export const compressImage = async (imagePath) => {
  try {
    const Image = require('react-native-image-resizer');
    const compressedImage = await Image.createResizedImage(
      imagePath,
      1920,
      1920,
      'JPEG',
      80
    );
    return compressedImage.uri;
  } catch (error) {
    console.error('Image compression error:', error);
    return imagePath;
  }
};

export const saveProfilePicture = async (imagePath, userId) => {
  try {
    const fileName = `profile_${userId}.jpg`;
    const destPath = `${RNFS.DocumentDirectoryPath}/profiles/${fileName}`;
    
    await RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/profiles`);
    await RNFS.copyFile(imagePath, destPath);
    
    return destPath;
  } catch (error) {
    console.error('Save profile picture error:', error);
    throw error;
  }
};

export const deleteFile = async (filePath) => {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch (error) {
    console.error('Delete file error:', error);
  }
};

export default {
  pickImage,
  pickDocument,
  startRecording,
  stopRecording,
  playAudio,
  stopAudio,
  compressImage,
  saveProfilePicture,
  deleteFile
};