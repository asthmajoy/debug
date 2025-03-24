// src/utils/tokenFormatters.js
import { ethers } from 'ethers';

/**
 * Format a token value from wei to a user-friendly display format with 5 decimal places
 * @param {string|number} value - Token value in wei
 * @returns {string} Formatted value with 5 decimal places
 */
export const formatTokenAmount = (value) => {
  try {
    // Return default for empty/falsy values
    if (!value) return "0.00000";
    
    // Convert the value to a string if it's not already
    const valueStr = value.toString();
    
    // Determine if this might be a wei value (large number)
    const isWeiValue = valueStr.length > 10 || valueStr.includes('e+');
    
    let etherValue;
    if (isWeiValue) {
      // Convert from wei to ether
      etherValue = ethers.utils.formatEther(valueStr);
    } else {
      // Already in a reasonable range or pre-formatted, just parse it
      etherValue = valueStr;
    }
    
    // Parse and format with 5 decimal places
    return parseFloat(etherValue).toFixed(5);
  } catch (error) {
    console.error("Error formatting token amount:", error, {value});
    return "0.00000";
  }
};

/**
 * Format a token value for display in header - more compact
 * @param {string|number} value - Token value in wei
 * @returns {string} Formatted value for header display
 */
export const formatTokenForHeader = (value) => {
  const formatted = formatTokenAmount(value);
  const num = parseFloat(formatted);
  
  // For header display, we use a more compact format
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  if (num >= 1000) return `${Math.floor(num).toLocaleString()}`;
  return formatted;
};

/**
 * Format a token value to a standard format with proper ETH units, automatically 
 * determining how many decimals to show based on the value
 * @param {string|number} value - Token value in wei
 * @returns {string} Formatted value with automatic decimal precision
 */
export const formatTokenStandard = (value) => {
  try {
    // Return default for empty/falsy values
    if (!value) return "0";
    
    // Convert the value to a string if it's not already
    const valueStr = value.toString();
    
    // Handle large numbers (likely wei values)
    const isWeiValue = valueStr.length > 10 || valueStr.includes('e+');
    
    let etherValue;
    if (isWeiValue) {
      // Convert from wei to ether
      etherValue = ethers.utils.formatEther(valueStr);
    } else {
      // Already in a reasonable range, just parse it
      etherValue = valueStr;
    }
    
    const numValue = parseFloat(etherValue);
    
    // Format based on value size
    if (numValue === 0) return "0";
    if (numValue < 0.001) return "<0.001";
    if (numValue < 1) return numValue.toFixed(3);
    if (numValue < 1000) return numValue.toFixed(2);
    
    // For larger values, use locale string formatting with no decimals
    return Math.floor(numValue).toLocaleString();
  } catch (error) {
    console.error("Error formatting token standard:", error, {value});
    return "0";
  }
};

/**
 * Calculate how much of a value is delegated and return a formatted string
 * @param {string|number} total - Total token amount
 * @param {string|number} delegated - Delegated token amount
 * @returns {string} Formatted percentage
 */
export const formatDelegationPercentage = (total, delegated) => {
  try {
    if (!total || !delegated) return "0%";
    
    // Convert to numbers in ETH
    const totalNum = parseFloat(formatTokenAmount(total));
    const delegatedNum = parseFloat(formatTokenAmount(delegated));
    
    if (totalNum === 0) return "0%";
    
    // Calculate percentage
    const percentage = (delegatedNum / totalNum) * 100;
    
    // Format based on value
    if (percentage < 0.1) return "<0.1%";
    if (percentage > 99.9 && percentage < 100) return ">99.9%";
    return `${percentage.toFixed(1)}%`;
  } catch (error) {
    console.error("Error formatting delegation percentage:", error);
    return "0%";
  }
};