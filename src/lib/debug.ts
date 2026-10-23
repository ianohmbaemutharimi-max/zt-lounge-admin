/**
 * Lightweight API trace helper.
 *
 * NO-OP BY DEFAULT. Tracing is emitted only when the environment flag
 * API_TRACE=1 is set, so importing/calling this module can never change
 * API behaviour, response shape, authorization or logging in normal runs.
 *
 * This module exists because the admin resource route
 * (src/app/api/admin/[resource]/route.ts) imports `{ trace }` and calls it
 * optionally at lifecycle points:
 *     trace?.('RESOURCE_GET', resource, { n, total, page, limit })
 *
 * It intentionally never throws — tracing must not be able to break a request.
 */

type TraceValue = unknown;

const TRACE_ENABLED = process.env.API_TRACE === "1";

/**
 * Emit a single-line, greppable trace entry.
 *
 * @param label   Short event label, e.g. 'RESOURCE_GET'
 * @param subject Primary subject, e.g. the resource name
 * @param detail  Optional structured detail
 */
export function trace(label: string, subject?: TraceValue, detail?: TraceValue): void {
  if (!TRACE_ENABLED) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[trace] ${label}`, subject ?? "", detail ?? "");
  } catch {
    /* never let tracing break a request */
  }
}

export default trace;