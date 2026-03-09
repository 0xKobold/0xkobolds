// Heartbeat module exports

export { createScheduler, parseSchedule, type HeartbeatScheduler } from './scheduler.js';
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

// Re-export types from scheduler
export { type CheckInType } from './scheduler.js';
