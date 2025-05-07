export const formatBytes = (bytes, decimals = 2) => {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  // Ensure 'i' is within the bounds of the 'sizes' array
  const unitIndex = Math.max(0, Math.min(i, sizes.length - 1));
  return parseFloat((bytes / Math.pow(k, unitIndex)).toFixed(dm)) + ' ' + sizes[unitIndex];
};

export const formatSpeed = (bytesPerSecond, decimals = 2) => {
  if (!Number.isFinite(bytesPerSecond)) return '0 Bytes/s';
  // Handle cases where speed might be 0 or very close to 0 after smoothing.
  if (bytesPerSecond === 0) return '0 Bytes/s';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s', 'PB/s', 'EB/s', 'ZB/s', 'YB/s'];
  
  // Ensure we are working with a positive number for log, handle 0 separately.
  if (bytesPerSecond === 0) return '0 Bytes/s';
  
  const i = Math.floor(Math.log(Math.abs(bytesPerSecond)) / Math.log(k));
  
  // Ensure 'i' is within the bounds of the 'sizes' array
  // If bytesPerSecond is less than 1 (e.g. 0.5 Bytes/s), log will be negative, i will be negative.
  // In such cases, we should default to Bytes/s.
  let unitIndex = Math.max(0, Math.min(i, sizes.length - 1));
  if (Math.abs(bytesPerSecond) < k && Math.abs(bytesPerSecond) > 0) {
    unitIndex = 0; // Default to Bytes/s if less than 1KB/s but not 0
  }


  // Special handling for 0 to avoid log(0) and ensure "0 Bytes/s"
  if (bytesPerSecond === 0) {
    return '0 Bytes/s';
  }


  return parseFloat((bytesPerSecond / Math.pow(k, unitIndex)).toFixed(dm)) + ' ' + sizes[unitIndex];
}; 