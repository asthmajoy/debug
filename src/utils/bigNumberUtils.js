import { ethers } from 'ethers';

/**
 * Safely converts any value to a number, with special handling for BigNumber objects
 * @param {any} value - The value to convert
 * @param {number} defaultValue - Default value if conversion fails
 * @returns {number} A JavaScript number
 */
export function toNumber(value, defaultValue = 0) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  try {
    // Check if it's a BigNumber
    if (value._isBigNumber) {
      return parseFloat(ethers.utils.formatEther(value));
    }
    
    // For strings and numbers
    if (typeof value === 'string' || typeof value === 'number') {
      const num = parseFloat(value);
      return isNaN(num) ? defaultValue : num;
    }
    
    // Fallback: try toString then convert
    return parseFloat(String(value)) || defaultValue;
  } catch (err) {
    console.warn('Error converting to number:', err);
    return defaultValue;
  }
}

/**
 * Safely converts a value to a string, with special handling for BigNumber objects
 * @param {any} value - The value to convert
 * @param {string} defaultValue - Default value if conversion fails
 * @returns {string} A string representation
 */
export function toString(value, defaultValue = '') {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  try {
    // Check if it's a BigNumber
    if (value._isBigNumber) {
      return value.toString();
    }
    
    // Regular case
    return String(value);
  } catch (err) {
    console.warn('Error converting to string:', err);
    return defaultValue;
  }
}

/**
 * Safely formats a value as ETH/token amount (with 18 decimal places by default)
 * @param {any} value - The value to format
 * @param {number} decimals - Number of decimals (default: 18 for ETH/most tokens)
 * @param {string} defaultValue - Default value if formatting fails
 * @returns {string} Formatted string
 */
export function formatTokenAmount(value, decimals = 18, defaultValue = '0') {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  try {
    // Handle BigNumber
    if (value._isBigNumber) {
      return ethers.utils.formatUnits(value, decimals);
    }
    
    // Try to convert to BigNumber first
    try {
      const bigNumValue = ethers.BigNumber.from(value);
      return ethers.utils.formatUnits(bigNumValue, decimals);
    } catch (e) {
      // Not a valid BigNumber, continue to other formats
    }
    
    // Handle numeric string or number
    if (typeof value === 'string' || typeof value === 'number') {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return num.toString();
      }
    }
    
    // Fallback
    return String(value) || defaultValue;
  } catch (err) {
    console.warn('Error formatting token amount:', err);
    return defaultValue;
  }
}

/**
 * Safely accesses an element in an array with BigNumber handling
 * @param {Array} array - The array to access
 * @param {number} index - The index to access
 * @param {any} defaultValue - Default value if access fails
 * @returns {any} The safely accessed value
 */
export function safeArrayAccess(array, index, defaultValue = '0') {
  if (!array || !Array.isArray(array) || index >= array.length || index < 0) {
    return defaultValue;
  }
  
  try {
    const value = array[index];
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    // For BigNumber, return the string representation
    if (value._isBigNumber) {
      return value.toString();
    }
    
    return value;
  } catch (err) {
    console.warn(`Error accessing array at index ${index}:`, err);
    return defaultValue;
  }
}

/**
 * Safely performs division with special handling for BigNumber objects
 * @param {any} numerator - The numerator
 * @param {any} denominator - The denominator
 * @param {number} defaultValue - Default value if division fails
 * @returns {number} Result of division as a JavaScript number
 */
export function safeDivide(numerator, denominator, defaultValue = 0) {
  try {
    // Convert to numbers first
    const num = toNumber(numerator);
    const denom = toNumber(denominator);
    
    // Prevent division by zero
    if (denom === 0) {
      return defaultValue;
    }
    
    return num / denom;
  } catch (err) {
    console.warn('Error in safe division:', err);
    return defaultValue;
  }
}

/**
 * Safely formats a percentage
 * @param {any} value - The value to format as percentage
 * @param {number} decimals - Number of decimal places
 * @param {string} defaultValue - Default value if formatting fails
 * @returns {string} Formatted percentage string
 */
export function safePercentage(value, decimals = 2, defaultValue = '0%') {
  try {
    const num = toNumber(value);
    return `${num.toFixed(decimals)}%`;
  } catch (err) {
    console.warn('Error formatting percentage:', err);
    return defaultValue;
  }
}