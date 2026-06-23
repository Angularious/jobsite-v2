/** A LinkedIn profile URL (/in/…) — gates the per-person enrich route. */
export function isValidLinkedInProfileUrl(url: string): boolean {
  return /^https:\/\/(www\.)?linkedin\.com\/in\//.test(url);
}
