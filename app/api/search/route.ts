import { NextResponse } from "next/server";
import { normalizeCompany } from "@/lib/domains";
import { guardRequest, type GuardBody } from "@/lib/security/guard";
import { findSimilarPeople, findRecruiters, simplifyJobTitle } from "@/lib/people";

const MAX_FIELD_LEN = 200;

// Two parallel people/recruiter waterfalls can chain several upstream calls;
// give it headroom (Hobby+Fluid allows up to 300s).
export const maxDuration = 60;

// "Find people" for a job listing. The caller already knows the company
// (the role-first search page passes the structured fields Fantastic Jobs
// returned), so this runs the people + recruiter waterfalls directly — there is
// no URL scrape/resolve step. (The old URL-paste flow now lives separately at
// jobenrich.vercel.app.)
interface SearchBody extends GuardBody {
  companyName?: string;
  companyDomain?: string;
  jobTitle?: string;
  jobLocation?: string;
}

export async function POST(request: Request) {
  let body: SearchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "search");
  if (!guard.ok) return guard.response;

  const presetCompany =
    typeof body.companyName === "string" ? body.companyName.trim().slice(0, MAX_FIELD_LEN) : "";
  if (!presetCompany) {
    return NextResponse.json({ error: "Run a job search first." }, { status: 400 });
  }

  const companyName = normalizeCompany(presetCompany);
  const domain =
    typeof body.companyDomain === "string" && body.companyDomain.trim()
      ? body.companyDomain.trim().slice(0, MAX_FIELD_LEN)
      : null;
  const jobTitle =
    typeof body.jobTitle === "string" && body.jobTitle.trim()
      ? body.jobTitle.trim().slice(0, MAX_FIELD_LEN)
      : null;
  const jobLocation =
    typeof body.jobLocation === "string" && body.jobLocation.trim()
      ? body.jobLocation.trim().slice(0, MAX_FIELD_LEN)
      : null;

  // Valid input, a call will be made — reserve its cost against the daily cap.
  const capErr = await guard.reserveSpend();
  if (capErr) return capErr;

  // jobTitle may be null → company-only people search.
  const searchTitle = jobTitle ? simplifyJobTitle(jobTitle) : null;
  console.log(
    `[search] "${jobTitle ?? "—"}" → "${searchTitle ?? "—"}" @ "${companyName}" (domain: ${domain ?? "—"}, location: ${jobLocation ?? "—"})`
  );

  // Two waterfalls in parallel — people in similar roles + recruiters.
  const [similar, recruiters] = await Promise.allSettled([
    findSimilarPeople({
      company: companyName,
      domain,
      ...(searchTitle ? { jobTitle: searchTitle } : {}),
    }),
    findRecruiters({ company: companyName, domain, location: jobLocation }),
  ]);

  return NextResponse.json({
    jobTitle,
    company: companyName,
    domain,
    people: similar.status === "fulfilled" ? similar.value : [],
    peopleError: similar.status === "rejected",
    recruiters: recruiters.status === "fulfilled" ? recruiters.value : [],
    recruitersError: recruiters.status === "rejected",
  });
}
