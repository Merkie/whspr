export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  label = "API call",
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `${label} attempt ${attempt}/${maxAttempts} failed:`,
        lastError.message,
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError;
}
