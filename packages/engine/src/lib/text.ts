/** Splits "21 Oct 2025: OpenAI launches Atlas" into a leading figure and its qualifier, when the lead is short. */
export function splitLead(line: string): { lead: string; rest: string } | null {
  const m = /^([^:]{1,28}):\s+(.+)$/.exec(line);
  return m ? { lead: m[1], rest: m[2] } : null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
