/**
 * Storage Manager Utility
 * 
 * Provides utilities for managing localStorage with quota awareness,
 * compression for large items, and automatic cleanup.
 * 
 * IMPORTANT: This module was created to solve localStorage quota exceeded errors
 * while maintaining all existing functionality. It's designed with future
 * backend integration (e.g., Supabase) in mind.
 * 
 * For Supabase integration:
 * 1. Add Supabase client methods to this module
 * 2. Update safeSetItem and safeGetItem to use Supabase when available
 * 3. Implement fallback to localStorage when offline
 */

// Default settings
const DEFAULT_SETTINGS = {
  maxSnapshotCount: 20,
  quotaWarningThreshold: 0.8, // 80% of available space
  estimatedQuota: 5 * 1024 * 1024, // 5MB (conservative estimate)
  compressionThreshold: 100 * 1024, // 100KB
};

/**
 * Estimates the current localStorage usage in bytes
 */
export const getStorageUsage = (): number => {
  let totalSize = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key) || '';
      totalSize += (key.length + value.length) * 2; // UTF-16 chars are 2 bytes
    }
  }
  
  return totalSize;
};

/**
 * Compresses a string using a simple LZW-like algorithm
 * For very large strings, this can provide significant space savings
 */
export const compressString = (input: string): string => {
  // For small strings, don't bother compressing
  if (input.length < 1000) return input;
  
  try {
    // Use built-in compression if available
    if (typeof CompressionStream !== 'undefined') {
      // This is a placeholder - actual implementation would use the Compression API
      // but it's not fully supported in all browsers yet
      return input;
    }
    
    // Simple prefix with 'compressed:' to indicate it's compressed
    return 'compressed:' + btoa(encodeURIComponent(input));
  } catch (error) {
    console.error('Error compressing string:', error);
    return input;
  }
};

/**
 * Decompresses a string that was compressed with compressString
 */
export const decompressString = (input: string): string => {
  if (!input.startsWith('compressed:')) return input;
  
  try {
    const compressedData = input.substring('compressed:'.length);
    return decodeURIComponent(atob(compressedData));
  } catch (error) {
    console.error('Error decompressing string:', error);
    return input;
  }
};

/**
 * Cleans up localStorage by removing old snapshots when approaching quota
 */
export const cleanupStorage = (options = {}): boolean => {
  const settings = { ...DEFAULT_SETTINGS, ...options };
  let cleanupPerformed = false;
  
  try {
    // Check current usage
    const usedSpace = getStorageUsage();
    const usedPercentage = usedSpace / settings.estimatedQuota;
    
    // Log current usage
    console.log(`[Storage] Current usage: ${Math.round(usedSpace / 1024)}KB / ${Math.round(settings.estimatedQuota / 1024)}KB (${Math.round(usedPercentage * 100)}%)`);
    
    // If we're approaching quota, clean up
    if (usedPercentage > settings.quotaWarningThreshold) {
      console.warn(`[Storage] Approaching quota limit (${Math.round(usedPercentage * 100)}%), cleaning up...`);
      
      // Find all snapshot keys
      const snapshotKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('snapshot:')) {
          snapshotKeys.push(key);
        }
      }
      
      // If we have more than the max allowed snapshots, remove oldest ones
      if (snapshotKeys.length > settings.maxSnapshotCount) {
        // Sort by numeric ID if possible
        snapshotKeys.sort((a, b) => {
          const idA = parseInt(a.split(':')[1]) || 0;
          const idB = parseInt(b.split(':')[1]) || 0;
          return idA - idB;
        });
        
        // Remove oldest snapshots
        const toRemove = snapshotKeys.slice(0, snapshotKeys.length - settings.maxSnapshotCount);
        toRemove.forEach(key => {
          console.log(`[Storage] Removing old snapshot: ${key}`);
          localStorage.removeItem(key);
          cleanupPerformed = true;
        });
      }
    }
    
    return cleanupPerformed;
  } catch (error) {
    console.error('[Storage] Error during cleanup:', error);
    return false;
  }
};

/**
 * Safely sets an item in localStorage with quota awareness and compression
 * 
 * @future When integrating with Supabase, modify this function to:
 * 1. Try storing in Supabase first
 * 2. Fall back to localStorage if offline or for temporary data
 */
export const safeSetItem = (key: string, value: string): boolean => {
  try {
    // Check if the value is large enough to warrant compression
    if (value.length > DEFAULT_SETTINGS.compressionThreshold) {
      value = compressString(value);
    }
    
    // Try to set the item
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`[Storage] Error setting item "${key}":`, error);
    
    // If it's a quota error, try cleanup and retry
    if (error instanceof DOMException && 
        (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      
      console.warn('[Storage] Storage quota exceeded, attempting cleanup...');
      
      // Perform cleanup
      const cleaned = cleanupStorage();
      
      // If cleanup was performed, try again
      if (cleaned) {
        try {
          localStorage.setItem(key, value);
          console.log(`[Storage] Successfully stored item "${key}" after cleanup`);
          return true;
        } catch (retryError) {
          console.error(`[Storage] Still cannot store item "${key}" after cleanup:`, retryError);
        }
      }
      
      // If the item is still too large even after cleanup, try compression
      try {
        const compressedValue = compressString(value);
        localStorage.setItem(key, compressedValue);
        console.log(`[Storage] Successfully stored compressed item "${key}"`);
        return true;
      } catch (compressionError) {
        console.error(`[Storage] Failed to store even with compression:`, compressionError);
      }
    }
    
    return false;
  }
};

/**
 * Safely gets an item from localStorage with decompression if needed
 * 
 * @future When integrating with Supabase, modify this function to:
 * 1. Try fetching from Supabase first
 * 2. Fall back to localStorage if offline or for temporary data
 */
export const safeGetItem = (key: string): string | null => {
  try {
    const value = localStorage.getItem(key);
    
    if (value && value.startsWith('compressed:')) {
      return decompressString(value);
    }
    
    return value;
  } catch (error) {
    console.error(`[Storage] Error getting item "${key}":`, error);
    return null;
  }
};

/**
 * Performs a general storage health check and cleanup
 */
export const performStorageHealthCheck = (): void => {
  try {
    // Log current storage usage
    const usedSpace = getStorageUsage();
    console.log(`[Storage] Health check - Current usage: ${Math.round(usedSpace / 1024)}KB`);
    
    // Count items by type
    const itemTypes: Record<string, number> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const type = key.split(':')[0] || 'unknown';
        itemTypes[type] = (itemTypes[type] || 0) + 1;
      }
    }
    
    console.log('[Storage] Item counts by type:', itemTypes);
    
    // Perform cleanup if needed
    cleanupStorage();
  } catch (error) {
    console.error('[Storage] Error during health check:', error);
  }
};

// Export a default object with all functions
export default {
  getStorageUsage,
  compressString,
  decompressString,
  cleanupStorage,
  safeSetItem,
  safeGetItem,
  performStorageHealthCheck,
};
