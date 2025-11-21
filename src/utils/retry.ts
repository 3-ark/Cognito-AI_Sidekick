/**
 * A higher-order function that wraps an asynchronous function with retry logic.
 *
 * @param fn The asynchronous function to wrap.
 * @param options Configuration for the retry behavior.
 * @param options.retries The maximum number of retries (default: 3).
 * @param options.delay The initial delay in milliseconds (default: 1000).
 * @param options.backoff The exponential backoff factor (default: 2).
 * @param options.shouldRetry A function that takes an error and returns true if the function should be retried.
 * @returns A new function that will retry on failure.
 */
export const withRetry = <A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
) => {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    shouldRetry = () => true, // By default, retry on any error
  } = options;

  return async (...args: A): Promise<R> => {
    let lastError: unknown;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (i < retries && shouldRetry(error)) {
          const jitter = Math.random() * delay * 0.1; // 10% jitter
          const waitTime = delay * Math.pow(backoff, i) + jitter;

          console.log(
            `Attempt ${i + 1} failed. Retrying in ${waitTime.toFixed(0)}ms...`,
          );
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // If it's the last retry or the error should not be retried
          throw error;
        }
      }
    }

    // This line should be unreachable, but typescript needs it to know a value is always returned/thrown.
    throw lastError;
  };
};

// Example of a custom error to check for
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}
