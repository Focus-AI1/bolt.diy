export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeout: NodeJS.Timeout;

  const executedFunction = function (...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };

  executedFunction.cancel = function() {
    clearTimeout(timeout);
  };

  return executedFunction;
}
