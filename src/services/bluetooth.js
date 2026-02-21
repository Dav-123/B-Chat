import RNBluetoothClassic from 'react-native-bluetooth-classic';
import BleManager from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { saveContact, updateContactStatus, addToMessageQueue, getMessageQueue } from './database';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const SERVICE_UUID = 'bchat-service-uuid';
const MESSAGE_CHUNK_SIZE = 512;

class BluetoothService {
  constructor() {
    this.discoveredDevices = new Map();
    this.connectedDevices = new Map();
    this.isScanning = false;
    this.messageQueue = [];
    this.userId = null;
  }

  async initialize(userId) {
    this.userId = userId;
    
    try {
      await BleManager.start({ showAlert: false });
      await RNBluetoothClassic.requestBluetoothEnabled();
      
      bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', this.handleDeviceDiscovered.bind(this));
      bleManagerEmitter.addListener('BleManagerStopScan', this.handleScanStop.bind(this));
      bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDeviceDisconnected.bind(this));
      
      console.log('Bluetooth initialized');
      return true;
    } catch (error) {
      console.error('Bluetooth initialization error:', error);
      return false;
    }
  }

  async startDiscovery() {
    if (this.isScanning) return;
    
    try {
      this.isScanning = true;
      await BleManager.scan([], 5, true);
      console.log('Scanning started');
    } catch (error) {
      console.error('Scan error:', error);
      this.isScanning = false;
    }
  }

  async stopDiscovery() {
    try {
      await BleManager.stopScan();
      this.isScanning = false;
      console.log('Scanning stopped');
    } catch (error) {
      console.error('Stop scan error:', error);
    }
  }

  handleDeviceDiscovered(peripheral) {
    if (!peripheral.name || !peripheral.name.startsWith('BCHAT_')) return;
    
    const distance = this.calculateDistance(peripheral.rssi);
    const deviceData = this.parseDeviceName(peripheral.name);
    
    this.discoveredDevices.set(peripheral.id, {
      ...deviceData,
      deviceAddress: peripheral.id,
      distance,
      rssi: peripheral.rssi,
      lastSeen: Date.now()
    });
    
    if (this.userId) {
      saveContact(this.userId, {
        id: deviceData.userId,
        name: deviceData.username,
        profilePic: deviceData.profilePic,
        deviceAddress: peripheral.id,
        distance
      });
    }
  }

  handleScanStop() {
    this.isScanning = false;
    console.log('Scan stopped');
  }

  handleDeviceDisconnected(peripheral) {
    this.connectedDevices.delete(peripheral.peripheral);
    if (this.userId) {
      updateContactStatus(peripheral.peripheral, false, null);
    }
  }

  calculateDistance(rssi) {
    const txPower = -59;
    if (rssi === 0) return -1;
    
    const ratio = rssi * 1.0 / txPower;
    if (ratio < 1.0) {
      return Math.pow(ratio, 10);
    } else {
      const distance = (0.89976) * Math.pow(ratio, 7.7095) + 0.111;
      return Math.round(distance * 10) / 10;
    }
  }

  parseDeviceName(name) {
    const parts = name.replace('BCHAT_', '').split('_');
    return {
      userId: parts[0] || 'unknown',
      username: parts[1] || 'User',
      profilePic: parts[2] || null
    };
  }

  async setDeviceName(userId, username) {
    const deviceName = `BCHAT_${userId}_${username}`;
    try {
      await RNBluetoothClassic.setDeviceName(deviceName);
      console.log('Device name set:', deviceName);
    } catch (error) {
      console.error('Set device name error:', error);
    }
  }

  async connectToDevice(deviceId) {
    try {
      const device = await RNBluetoothClassic.connectToDevice(deviceId);
      this.connectedDevices.set(deviceId, device);
      
      if (this.userId) {
        updateContactStatus(deviceId, true, this.discoveredDevices.get(deviceId)?.distance);
      }
      
      device.onDataReceived((data) => this.handleDataReceived(deviceId, data));
      
      return device;
    } catch (error) {
      console.error('Connection error:', error);
      return null;
    }
  }

  async disconnectDevice(deviceId) {
    try {
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        await device.disconnect();
        this.connectedDevices.delete(deviceId);
        
        if (this.userId) {
          updateContactStatus(deviceId, false, null);
        }
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  async sendMessage(recipientId, message) {
    const device = this.connectedDevices.get(recipientId);
    
    if (!device) {
      await addToMessageQueue(message.id, recipientId);
      return false;
    }
    
    try {
      const messageData = JSON.stringify(message);
      const chunks = this.chunkMessage(messageData);
      
      for (const chunk of chunks) {
        await device.write(chunk);
      }
      
      return true;
    } catch (error) {
      console.error('Send message error:', error);
      await addToMessageQueue(message.id, recipientId);
      return false;
    }
  }

  async sendFile(recipientId, filePath, fileType) {
    const device = this.connectedDevices.get(recipientId);
    
    if (!device) {
      return false;
    }
    
    try {
      const RNFS = require('react-native-fs');
      const fileData = await RNFS.readFile(filePath, 'base64');
      
      const fileMessage = {
        type: 'file',
        fileType,
        data: fileData,
        fileName: filePath.split('/').pop()
      };
      
      const chunks = this.chunkMessage(JSON.stringify(fileMessage));
      
      for (const chunk of chunks) {
        await device.write(chunk);
      }
      
      return true;
    } catch (error) {
      console.error('Send file error:', error);
      return false;
    }
  }

  chunkMessage(message) {
    const chunks = [];
    for (let i = 0; i < message.length; i += MESSAGE_CHUNK_SIZE) {
      chunks.push(message.slice(i, i + MESSAGE_CHUNK_SIZE));
    }
    return chunks;
  }

  handleDataReceived(deviceId, data) {
    try {
      const message = JSON.parse(data.data);
      
      if (this.onMessageReceived) {
        this.onMessageReceived(deviceId, message);
      }
    } catch (error) {
      console.error('Data parse error:', error);
    }
  }

  async processMessageQueue() {
    const queue = await getMessageQueue();
    
    for (const queueItem of queue) {
      const device = this.connectedDevices.get(queueItem.recipientId);
      
      if (device) {
        try {
          await this.sendMessage(queueItem.recipientId, { id: queueItem.messageId });
        } catch (error) {
          console.error('Queue process error:', error);
        }
      }
    }
  }

  getDiscoveredDevices() {
    return Array.from(this.discoveredDevices.values());
  }

  getConnectedDevices() {
    return Array.from(this.connectedDevices.keys());
  }

  setMessageReceivedCallback(callback) {
    this.onMessageReceived = callback;
  }
}

export default new BluetoothService();