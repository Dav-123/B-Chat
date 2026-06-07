/**
 * PermissionsService — Expo SDK 54 compatible.
 *
 * Strategy:
 *   - Camera           → expo-camera
 *   - Location         → expo-location
 *   - Notifications    → expo-notifications
 *   - Media library    → expo-media-library
 *   - Microphone       → expo-av (Audio.requestPermissionsAsync)
 *   - Bluetooth        → react-native-permissions (no Expo equivalent on Android)
 *
 * All permission checks are non-blocking and fail gracefully.
 * The app continues with degraded functionality if a permission is denied,
 * rather than blocking the user entirely.
 */

import { Alert, Linking, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as MediaLibrary from 'expo-media-library';
import { Audio } from 'expo-av';

// Bluetooth still requires react-native-permissions on Android
// (no Expo managed equivalent as of SDK 54)
import {
  PERMISSIONS,
  RESULTS,
  requestMultiple,
  checkMultiple,
  PermissionStatus,
} from 'react-native-permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

export interface AppPermissionsStatus {
  camera: boolean;
  microphone: boolean;
  location: boolean;
  backgroundLocation: boolean;
  notifications: boolean;
  mediaLibrary: boolean;
  bluetooth: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openSettings(): void {
  Linking.openSettings().catch(() => console.warn('[Permissions] Could not open settings.'));
}

function showSettingsAlert(permission: string): void {
  Alert.alert(
    `${permission} Permission Required`,
    `B-Chat needs ${permission} access to function correctly. Please enable it in Settings.`,
    [
      { text: 'Open Settings', onPress: openSettings },
      { text: 'Not Now', style: 'cancel' },
    ]
  );
}

// ─── PermissionsService ───────────────────────────────────────────────────────

export const PermissionsService = {

  // ── Camera ─────────────────────────────────────────────────────────────────

  async requestCamera(): Promise<PermissionResult> {
    const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
    if (status === 'denied' && !canAskAgain) showSettingsAlert('Camera');
    return { granted: status === 'granted', canAskAgain };
  },

  async checkCamera(): Promise<boolean> {
    const { status } = await Camera.getCameraPermissionsAsync();
    return status === 'granted';
  },

  // ── Microphone ─────────────────────────────────────────────────────────────

  async requestMicrophone(): Promise<PermissionResult> {
    const { status, canAskAgain } = await Audio.requestPermissionsAsync();
    if (status === 'denied' && !canAskAgain) showSettingsAlert('Microphone');
    return { granted: status === 'granted', canAskAgain };
  },

  async checkMicrophone(): Promise<boolean> {
    const { status } = await Audio.getPermissionsAsync();
    return status === 'granted';
  },

  // ── Location ───────────────────────────────────────────────────────────────

  async requestLocation(): Promise<PermissionResult> {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === 'denied' && !canAskAgain) showSettingsAlert('Location');
    return { granted: status === 'granted', canAskAgain };
  },

  async requestBackgroundLocation(): Promise<PermissionResult> {
    // Must request foreground first
    const fg = await this.requestLocation();
    if (!fg.granted) return fg;

    const { status, canAskAgain } = await Location.requestBackgroundPermissionsAsync();
    if (status === 'denied' && !canAskAgain) showSettingsAlert('Background Location');
    return { granted: status === 'granted', canAskAgain };
  },

  async checkLocation(): Promise<boolean> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  },

  // ── Notifications ──────────────────────────────────────────────────────────

  async requestNotifications(): Promise<PermissionResult> {
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync({
      ios: { alert: true, badge: true, sound: true },
    });
    if (status === 'denied' && !canAskAgain) showSettingsAlert('Notifications');
    return { granted: status === 'granted', canAskAgain };
  },

  async checkNotifications(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  },

  // ── Media library ──────────────────────────────────────────────────────────

  async requestMediaLibrary(): Promise<PermissionResult> {
    const { status, canAskAgain } = await MediaLibrary.requestPermissionsAsync();
    if (status === 'denied' && !canAskAgain) showSettingsAlert('Media Library');
    return { granted: status === 'granted', canAskAgain };
  },

  async checkMediaLibrary(): Promise<boolean> {
    const { status } = await MediaLibrary.getPermissionsAsync();
    return status === 'granted';
  },

  // ── Bluetooth (Android — react-native-permissions only) ───────────────────

  async requestBluetooth(): Promise<PermissionResult> {
    if (Platform.OS !== 'android') return { granted: true, canAskAgain: false };

    const permissions = Platform.Version >= 31
      ? [
          PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
          PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
          PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
        ]
      : [
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION, // Required for BLE on Android < 12
        ];

    const results = await requestMultiple(permissions);
    const allGranted = Object.values(results).every((r) => r === RESULTS.GRANTED);
    const anyBlocked = Object.values(results).some((r) => r === RESULTS.BLOCKED);

    if (!allGranted && anyBlocked) showSettingsAlert('Bluetooth');

    return { granted: allGranted, canAskAgain: !anyBlocked };
  },

  async checkBluetooth(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const permissions = Platform.Version >= 31
      ? [
          PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
          PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
          PERMISSIONS.ANDROID.BLUETOOTH_ADVERTISE,
        ]
      : [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION];

    const results = await checkMultiple(permissions);
    return Object.values(results).every((r) => r === RESULTS.GRANTED);
  },

  // ── Request all at once ────────────────────────────────────────────────────

  /**
   * Request all permissions the app needs. Returns a status summary.
   * Failures are non-blocking — the app continues with degraded functionality.
   */
  async requestAll(): Promise<AppPermissionsStatus> {
    const [camera, microphone, location, backgroundLocation, notifications, media, bluetooth] =
      await Promise.allSettled([
        this.requestCamera(),
        this.requestMicrophone(),
        this.requestLocation(),
        this.requestBackgroundLocation(),
        this.requestNotifications(),
        this.requestMediaLibrary(),
        this.requestBluetooth(),
      ]);

    const resolve = (r: PromiseSettledResult<PermissionResult>): boolean =>
      r.status === 'fulfilled' && r.value.granted;

    return {
      camera: resolve(camera),
      microphone: resolve(microphone),
      location: resolve(location),
      backgroundLocation: resolve(backgroundLocation),
      notifications: resolve(notifications),
      mediaLibrary: resolve(media),
      bluetooth: resolve(bluetooth),
    };
  },

  async checkAll(): Promise<AppPermissionsStatus> {
    const [camera, microphone, location, notifications, media, bluetooth] = await Promise.all([
      this.checkCamera(),
      this.checkMicrophone(),
      this.checkLocation(),
      this.checkNotifications(),
      this.checkMediaLibrary(),
      this.checkBluetooth(),
    ]);

    return {
      camera,
      microphone,
      location,
      backgroundLocation: location, // Approximate — full check requires separate call
      notifications,
      mediaLibrary: media,
      bluetooth,
    };
  },
};