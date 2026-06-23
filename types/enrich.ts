/** Shared shape of the /api/enrich response — the contact details + profile
 *  context surfaced for one person. Imported by the route (return type) and the
 *  EnrichDrawer / pages (render type) so the two never drift apart. */

export interface EnrichLink {
  label: string;
  url: string;
}

export type EnrichSource = "apollo" | "bytemine" | "contactout" | "none";

export interface EnrichData {
  emails: string[];
  phones: string[];
  source: EnrichSource;
  // Extra profile context surfaced alongside the contact details.
  company: string | null;
  position: string | null;
  location: string | null;
  links: EnrichLink[];
}
