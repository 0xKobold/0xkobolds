// Heartbeat module exports

export { 
  HeartbeatScheduler,
  getScheduler,
  resetScheduler,
  type CheckInType,
  type ScheduleConfig,
  type ScheduledEvent
} from './scheduler.js';

export { 
  type CheckInPrompt, 
  type CheckInResponse, 
  type CheckInAction,
  getCheckInPrompt, 
  formatCheckInMessage, 
  buildCheckInResponse, 
  handleCheckInAction, 
  detectIdle,
  getGreeting
} from './checkin.js';

export { 
  getNotificationManager, 
  resetNotificationManager, 
  type NotificationConfig, 
  type Notification, 
  type NotificationStats 
} from './notifications.js';
