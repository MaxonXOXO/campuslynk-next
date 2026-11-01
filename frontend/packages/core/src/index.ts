/**
 * Core domain types and utilities for Academic Suite.
 */
export const CORE_VERSION = '0.1.0';

export function getCoreStatus(): { ready: boolean; timestamp: string } {
  return {
    ready: true,
    timestamp: new Date().toISOString()
  };
}

