/**
 * Formatting utilities for trading chart data
 */

/**
 * Format price with currency symbol
 * @param price - Price value to format
 * @returns Formatted price string (e.g., "$1,234.56")
 */
export const formatPrice = (price: number): string => {
  if (price === 0) return '$--';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

/**
 * Format volume with K/M/B suffixes
 * @param volume - Volume value to format
 * @returns Formatted volume string (e.g., "$1.23M")
 */
export const formatVolume = (volume: number): string => {
  if (volume === 0) return '--';
  if (volume >= 1e9) return `$${(volume / 1e9).toFixed(2)}B`;
  if (volume >= 1e6) return `$${(volume / 1e6).toFixed(2)}M`;
  if (volume >= 1e3) return `$${(volume / 1e3).toFixed(2)}K`;
  return `$${volume.toFixed(2)}`;
};

/**
 * Format funding rate as percentage
 * @param rate - Funding rate value
 * @returns Formatted rate string (e.g., "0.0100%")
 */
export const formatFundingRate = (rate: number): string => {
  return `${(rate * 100).toFixed(4)}%`;
};

/**
 * Format timestamp to time until string
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string (e.g., "2h 30m")
 */
export const formatTimeUntil = (timestamp: number): string => {
  const now = Date.now();
  const diff = timestamp - now;
  if (diff <= 0) return 'Now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${hours}h ${minutes}m`;
};
