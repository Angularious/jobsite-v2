import { getDomain } from "tldts";

/**
 * Shared domain / company-name helpers. Used by the role-first job search
 * (`lib/jobs/searchJobs.ts`, the Serper web fallback) and the people-finder
 * route (company-name normalization). Single source of truth for ATS/host
 * detection and apex-domain reduction.
 */

// Hosts that are ATS / job-board infrastructure — never a hiring company's own
// domain (a posting on greenhouse.io belongs to the employer, not Greenhouse).
export const ATS_HOSTS =
  /(^|\.)(myworkdayjobs\.com|bamboohr\.com|greenhouse\.io|gem\.com|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|icims\.com|jobvite\.com|taleo\.net|successfactors\.com|paylocity\.com|eddy\.com|jobs\.[a-z]+)$/i;

// Social / aggregator hosts that are never a company's marketing domain either.
export const NON_COMPANY_HOSTS =
  /(^|\.)(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|crunchbase\.com|glassdoor\.com|indeed\.com|youtube\.com)$/i;

/** True if a host is ATS/board infrastructure or a social/aggregator site —
 *  i.e. never the hiring company's own domain. */
export function isInfraHost(host: string): boolean {
  return ATS_HOSTS.test(host) || NON_COMPANY_HOSTS.test(host);
}

/** Best-effort registrable (apex) domain from a URL or bare host string, backed
 *  by the Public Suffix List (tldts): "careers.sharkninja.com" → "sharkninja.com",
 *  "jobs.acme.co.uk" → "acme.co.uk". People providers index companies by their
 *  apex marketing domain, never a careers/jobs/apply subdomain — collapsing to
 *  the registrable domain here is what makes the domain-first search match.
 *  Handles multi-part TLDs, so there's no hand-maintained prefix list to keep in
 *  sync. Returns null if nothing parses. */
export function hostFromUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  return getDomain(withProto) || null;
}

/** Apex company domain from a candidate string, or null if it's blank,
 *  unparseable, or an ATS/social/aggregator host. */
export function normalizeCompanyDomain(raw: unknown): string | null {
  const host = hostFromUrl(raw);
  return host && !isInfraHost(host) ? host : null;
}

// Unambiguous legal forms — safe to strip even without a comma.
const LEGAL_HARD =
  /[,.]?\s+(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|gmbh|plc|pte\.?\s*ltd|pty\.?\s*ltd|llp|s\.?a\.?r\.?l\.?|srl)\.?$/i;
// Words that are often part of a real brand ("The Walt Disney Company", a spa,
// "<X> Co") — only strip when clearly a legal suffix, i.e. set off by a comma.
const LEGAL_SOFT = /,\s*(co|company|spa|ag|s\.?a\.?|b\.?v\.?|n\.?v\.?|kk|lp)\.?$/i;

/** Strip trailing legal suffixes so "Crocs, Inc." → "Crocs" — the people
 *  providers index companies by common name, not legal entity. Ambiguous words
 *  (Co/Company/Spa/…) are only stripped after a comma so brand names like
 *  "The Walt Disney Company" survive. */
export function normalizeCompany(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  // Suffixes can stack ("Foo, Inc. LLC"); strip repeatedly.
  for (let i = 0; i < 3; i++) {
    const next = name.replace(LEGAL_HARD, "").replace(LEGAL_SOFT, "").trim();
    if (next === name || !next) break;
    name = next;
  }
  return name;
}
