/**
 * Push Notification Service
 * 
 * Handles browser push notification permissions and registration.
 * Integrates with Web Push API for background notifications when the app is closed.
 * 
 * INFRASTRUCTURE REQUIREMENTS (not yet implemented):
 * - Firebase Cloud Messaging (FCM) or similar push service
 * - Service Worker for background notification handling
 * - Backend endpoint to store FCM tokens
 * - Backend service to send push notifications via FCM
 * 
 * Current implementation: Browser Notifications API (foreground only)
 * Future: Full FCM integration with background push
 */

export interface PushNotificationConfig {
  vapidPublicKey?: string; // VAPID public key for web push (future)
  serviceWorkerPath?: string; // Path to service worker (default: /sw.js)
}

export class PushNotificationService {
  private config: PushNotificationConfig;
  private registration: ServiceWorkerRegistration | null = null;

  constructor(config: PushNotificationConfig = {}) {
    this.config = {
      serviceWorkerPath: "/sw.js",
      ...config,
    };
  }

  /**
   * Check if push notifications are supported in this browser
   */
  isSupported(): boolean {
    return "Notification" in window && "serviceWorker" in navigator;
  }

  /**
   * Get current notification permission status
   */
  getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return "denied";
    return Notification.permission;
  }

  /**
   * Request notification permission from the user
   * Returns the permission status after user interaction
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      console.warn("[Push] Notifications not supported");
      return "denied";
    }

    if (Notification.permission === "granted") {
      return "granted";
    }

    if (Notification.permission === "denied") {
      console.warn("[Push] Notifications previously denied");
      return "denied";
    }

    // Request permission
    const permission = await Notification.requestPermission();
    console.log("[Push] Permission status:", permission);

    if (permission === "granted") {
      await this.initialize();
    }

    return permission;
  }

  /**
   * Initialize service worker and push subscription (future FCM integration)
   * Current: Just registers service worker for future use
   */
  private async initialize(): Promise<void> {
    if (!this.isSupported()) return;

    try {
      // Register service worker if not already registered
      if (!this.registration) {
        this.registration = await navigator.serviceWorker.register(
          this.config.serviceWorkerPath!
        );
        console.log("[Push] Service Worker registered:", this.registration);
      }

      // TODO: Subscribe to push notifications with VAPID key
      // const subscription = await this.registration.pushManager.subscribe({
      //   userVisibleOnly: true,
      //   applicationServerKey: this.config.vapidPublicKey,
      // });
      // await this.sendSubscriptionToBackend(subscription);
    } catch (error) {
      console.error("[Push] Initialization failed:", error);
    }
  }

  /**
   * Show a local notification (foreground only)
   * For background notifications, need full FCM integration
   */
  showNotification(title: string, options?: NotificationOptions): void {
    if (this.getPermissionStatus() !== "granted") {
      console.warn("[Push] Cannot show notification - permission not granted");
      return;
    }

    new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });
  }

  /**
   * Send push subscription to backend (future implementation)
   */
  private async sendSubscriptionToBackend(
    subscription: PushSubscription
  ): Promise<void> {
    // TODO: Implement backend endpoint to store FCM tokens
    // await fetch("/api/admin/push-subscriptions", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(subscription),
    // });
    console.log("[Push] Subscription:", subscription);
  }
}

// Singleton instance
let pushService: PushNotificationService | null = null;

/**
 * Get the global push notification service instance
 */
export function getPushService(config?: PushNotificationConfig): PushNotificationService {
  if (!pushService) {
    pushService = new PushNotificationService(config);
  }
  return pushService;
}

/**
 * Helper: Check if notifications are enabled and request if needed
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const service = getPushService();
  
  if (!service.isSupported()) {
    console.warn("[Push] Notifications not supported in this browser");
    return false;
  }

  const status = service.getPermissionStatus();
  
  if (status === "granted") {
    return true;
  }

  if (status === "denied") {
    return false;
  }

  // Status is "default" - ask user
  const permission = await service.requestPermission();
  return permission === "granted";
}
