

import React from 'react';
import { CloseIcon } from './icons';

interface Notification {
  id: string;
  message: string;
  type: 'warning' | 'error' | 'info';
  title?: string;
}

interface NotificationsProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const notificationStyles = {
  warning: {
    container: 'bg-yellow-100 border-yellow-500 text-yellow-700',
    title: 'Registration Alert',
    dismiss: 'text-yellow-500 hover:text-yellow-700 hover:bg-yellow-200 focus:ring-yellow-500',
  },
  error: {
    container: 'bg-red-100 border-red-500 text-red-700',
    title: 'Alert',
    dismiss: 'text-red-500 hover:text-red-700 hover:bg-red-200 focus:ring-red-500',
  },
  info: {
    container: 'bg-blue-100 border-blue-500 text-blue-700',
    title: 'Reminder',
    dismiss: 'text-blue-500 hover:text-blue-700 hover:bg-blue-200 focus:ring-blue-500',
  }
};


const Notifications: React.FC<NotificationsProps> = ({ notifications, onDismiss }) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-5 right-5 z-50 space-y-3 w-full max-w-sm">
      {notifications.map((notification) => {
        const styles = notificationStyles[notification.type] || notificationStyles.warning;
        const title = notification.title || styles.title;
        return (
            <div
            key={notification.id}
            className={`${styles.container} border-l-4 p-4 rounded-md shadow-lg flex justify-between items-start`}
            role="alert"
            >
            <div className="flex-grow">
                <p className="font-bold">{title}</p>
                <p className="text-sm">{notification.message}</p>
            </div>
            <button
                onClick={() => onDismiss(notification.id)}
                className={`ml-4 flex-shrink-0 p-1 rounded-full focus:outline-none focus:ring-2 ${styles.dismiss}`}
                aria-label="Dismiss notification"
            >
                <CloseIcon />
            </button>
            </div>
        )
      })}
    </div>
  );
};

export default Notifications;