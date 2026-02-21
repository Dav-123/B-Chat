import PushNotification from 'react-native-push-notification';
import notifee from '@notifee/react-native';

class NotificationService {
  constructor() {
    this.configure();
  }

  configure() {
    PushNotification.configure({
      onNotification: function (notification) {
        console.log('NOTIFICATION:', notification);
      },
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      requestPermissions: true,
    });

    PushNotification.createChannel(
      {
        channelId: 'bchat-messages',
        channelName: 'B-Chat Messages',
        channelDescription: 'Notifications for new messages',
        playSound: true,
        soundName: 'default',
        importance: 4,
        vibrate: true,
      },
      (created) => console.log(`Channel created: ${created}`)
    );
  }

  async showNotification(title, message, data = {}) {
    try {
      await notifee.displayNotification({
        title,
        body: message,
        android: {
          channelId: 'bchat-messages',
          smallIcon: 'ic_launcher',
          pressAction: {
            id: 'default',
          },
          sound: 'default',
        },
        data,
      });
    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  async showMessageNotification(senderName, messageContent, chatId) {
    await this.showNotification(
      senderName,
      messageContent,
      { chatId, type: 'message' }
    );
  }

  async showGroupMessageNotification(groupName, senderName, messageContent, groupId) {
    await this.showNotification(
      groupName,
      `${senderName}: ${messageContent}`,
      { groupId, type: 'group_message' }
    );
  }

  cancelAllNotifications() {
    PushNotification.cancelAllLocalNotifications();
    notifee.cancelAllNotifications();
  }

  async requestPermissions() {
    try {
      await notifee.requestPermission();
      return true;
    } catch (error) {
      console.error('Permission request error:', error);
      return false;
    }
  }
}

export default new NotificationService();