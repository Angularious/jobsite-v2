import { callOrthogonal } from "@/lib/orthogonal";
import { hostFromUrl } from "@/lib/domains";
import type { JobSearchParams, WebResult } from "@/types/job";

/**
 * Serper (Google Search) fallback for when the structured Fantastic Jobs feed
 * returns zero listings. Google understands fuzzy / semantic role queries that a
 * literal title filter misses (e.g. "GTM" → go-to-market roles), so this is a
 * cheap ($0.002) safety net that still hands the user real links to chase.
 *
 * These are raw web results (LinkedIn / Indeed / Greenhouse / aggregators), NOT
 * enriched listings — there's no company/apply/date structure, so they render as
 * a plain link list, separate from the JobListing cards.
 */

const EMP_PHRASE: Record<string, string> = {
  INTERN: "internship",
  FULL_TIME: "full time",
  PART_TIME: "part time",
  CONTRACTOR: "contract",
};

interface SerperOrganic {
  title?: string;
  link?: string;
  snippet?: string;
}
interface SerperResponse {
  organic?: SerperOrganic[];
}

function buildQuery(params: JobSearchParams): string {
  const emp = params.employmentType ? EMP_PHRASE[params.employmentType] ?? "" : "";
  return [params.role, emp, params.location, "jobs"].filter(Boolean).join(" ").trim();
}

/** Up to `limit` Google results for the search, mapped to WebResult. Returns []
 *  on any upstream error (the caller already has an empty-but-valid response). */
export async function webSearchJobs(
  params: JobSearchParams,
  limit = 10
): Promise<WebResult[]> {
  const q = buildQuery(params);
  if (!q) return [];
  try {
    const data = await callOrthogonal<SerperResponse>({
      api: "serper",
      path: "/search",
      method: "POST",
      body: { q, num: limit },
    });
    const organic = Array.isArray(data?.organic) ? data.organic : [];
    return organic
      .filter((o): o is SerperOrganic & { link: string; title: string } =>
        Boolean(o?.link && o?.title)
      )
      .slice(0, limit)
      .map((o) => ({
        title: o.title.trim(),
        url: o.link,
        snippet: typeof o.snippet === "string" && o.snippet.trim() ? o.snippet.trim() : null,
        source: hostFromUrl(o.link),
      }));
  } catch (err) {
    console.error("[jobs] Serper fallback failed:", err);
    return [];
  }
}
