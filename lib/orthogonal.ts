interface OrthogonalPayload {
  api: string;
  path: string;
  method: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | boolean | number>;
}

/** User-facing message when the Orthogonal API key's own spend limit is hit
 *  (distinct from our per-site daily cap and from a generic upstream error). */
export const QUOTA_MSG =
  "This demo has reached its usage limit for now. Please try again later.";

/** Error thrown by callOrthogonal. `quotaExceeded` is set when the failure looks
 *  like the API key's spend/quota limit (HTTP 402, or a payment/quota message),
 *  so routes can surface a clear "try again later" 503 instead of a generic 502. */
export class OrthogonalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly quotaExceeded: boolean
  ) {
    super(message);
    this.name = "OrthogonalError";
  }
}

/** True if `err` is an Orthogonal failure caused by the key's spend/quota limit. */
export function isQuotaError(err: unknown): boolean {
  return err instanceof OrthogonalError && err.quotaExceeded;
}

const QUOTA_SIGNAL = /quota|payment.?required|spend.?limit|insufficient|exceeded|402/i;

export async function callOrthogonal<T = unknown>(
  payload: OrthogonalPayload
): Promise<T> {
  const res = await fetch("https://api.orthogonal.com/v1/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ORTHOGONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    // 402 Payment Required (or a quota-ish status) → the key's spend limit.
    const body = await res.text().catch(() => "");
    const quota = res.status === 402 || QUOTA_SIGNAL.test(body);
    throw new OrthogonalError(
      `Orthogonal HTTP error: ${res.status} ${res.statusText}`,
      res.status,
      quota
    );
  }

  const json = await res.json();

  if (!json.success) {
    const detail = JSON.stringify(json);
    throw new OrthogonalError(
      `Orthogonal API failure: ${detail}`,
      200,
      QUOTA_SIGNAL.test(detail)
    );
  }

  return json.data as T;
}
