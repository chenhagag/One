import { Capacitor } from '@capacitor/core';

/** True when running inside a native Capacitor shell (Android / iOS) */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Returns the platform: 'android' | 'ios' | 'web' */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}

/**
 * Base URL for API calls.
 * - Web: '' (relative, handled by Vite proxy or same-origin in prod)
 * - Native: absolute URL to production backend
 */
export function getApiBaseUrl(): string {
  if (isNativeApp()) {
    return 'https://joinone.io';
  }
  return '';
}

/**
 * OAuth redirect URL.
 * - Web: same origin /auth/callback
 * - Native: custom scheme for deep link
 */
export function getOAuthRedirectUrl(): string {
  if (isNativeApp()) {
    return 'https://joinone.io/auth/callback';
  }
  return `${window.location.origin}/auth/callback`;
}
