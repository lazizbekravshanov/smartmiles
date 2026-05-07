// Telegram-specific text helpers: 4096-char truncation at word boundary and Markdown escaping.

const TELEGRAM_MAX_MESSAGE = 4096;

/**
 * Truncate `text` to fit Telegram's 4096-char message limit, breaking on the
 * last word/newline boundary so we never cut mid-sentence.
 */
export function truncateAtWordBoundary(text: string, max: number = TELEGRAM_MAX_MESSAGE): string {
  if (text.length <= max) return text;
  const ellipsis = "…";
  const budget = max - ellipsis.length;
  const slice = text.slice(0, budget);
  const breakers = [slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), slice.lastIndexOf(". "), slice.lastIndexOf(" ")];
  const cut = Math.max(...breakers);
  if (cut > budget * 0.6) {
    return slice.slice(0, cut).trimEnd() + ellipsis;
  }
  return slice + ellipsis;
}

/**
 * Escape characters that Telegram legacy-Markdown treats as formatting markers.
 * Use only on user-supplied content embedded in a formatted reply — not on the
 * formatting we author (since that would defeat the purpose).
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}
