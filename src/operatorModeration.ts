// Operator-only "report → remove" shortcut. Mirrors the admin app's project-level actOnReport
// (apps/admin/src/lib/moderation.ts): file the report, then resolve it as "removed" via the
// operator-only endpoint, which moderates the target AND resolves the report in one server call —
// so the report is preserved in the moderated queue (moderation history).
//
// This is the demo's ONLY raw HTTP call — everything else goes through SDK hooks. It exists because
// the SDK's useCreateReport discards the POST response, so it can't hand back the new report's id
// (needed for the resolve call). Unlike the SDK's axios client this does NOT auto-refresh on 401;
// useTokenRefresh() in Shell keeps the token fresh proactively, so in practice it won't 401 — if it
// does, the caller surfaces the error and the operator retries. Fine for a manual test harness.
import { API_BASE_URL, PROJECT_ID } from "./config";

async function authed(path: string, accessToken: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/${PROJECT_ID}${path}`, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

export async function reportAndRemove(opts: {
  targetType: "entity" | "comment";
  targetId: string;
  reason: string;
  details?: string;
  accessToken: string;
}): Promise<any> {
  const { targetType, targetId, reason, details, accessToken } = opts;
  const note = details?.trim() || undefined;
  // 1. File the report (returns it, incl. id).
  const report = await authed(`/reports`, accessToken, {
    method: "POST",
    body: JSON.stringify({ targetType, targetId, reason, details: note }),
  });
  // 2. Resolve as "removed" — moderates the target + resolves the report (operator god-view).
  await authed(`/reports/${report.id}/resolve`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ action: "removed", reason: note }),
  });
  return report;
}
