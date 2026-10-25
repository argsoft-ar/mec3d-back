const MAX_LOG_VALUE_LENGTH = 200;

export const sanitizeForLog = (value: unknown): string =>
  String(value)
    .replace(/[\r\n\u0000-\u001f\u007f\u2028\u2029]/g, "")
    .slice(0, MAX_LOG_VALUE_LENGTH);
