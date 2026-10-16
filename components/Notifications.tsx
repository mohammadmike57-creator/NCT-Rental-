

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
    container: 'bg-amber-100 border-amber-500 text-amber-700',
    title: 'Registration Alert',
    dismiss: 'text-amber-500 hover:text-amber-700 hover:bg-amber-200 focus:ring-amber-500',
  },
  error: {
    container: 'bg-rose-100 border-rose-500 text-rose-700',
    title: 'Alert',
    dismiss: 'text-rose-500 hover:text-rose-700 hover:bg-rose-200 focus:ring-rose-500',
  },
  info: {
    container: 'bg-sky-100 border-sky-500 text-sky-700',
    title: 'Reminder',
    dismiss: 'text-sky-500 hover:text-sky-700 hover:bg-sky-200 focus:ring-sky-500',
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