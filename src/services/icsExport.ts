// ICS (RFC 5545) calendar export — works with Google/Apple/Outlook.

export interface ICSEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  url?: string;
  geo?: { lat: number; lon: number };
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function toICSDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function fold(line: string): string {
  // RFC5545: a content line is limited to 75 octets, excluding the CRLF.
  // Folding inserts CRLF + a single leading space; that space counts toward
  // the 75-octet budget of every continuation line. So the first line may be
  // 75 chars, and each continuation may be 74 chars (1 reserved for the space).
  if (line.length <= 75) return line;
  const out: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    out.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  out.push(" " + rest);
  return out.join("\r\n");
}

export function buildICS(events: ICSEvent[], calendarName = "Travel Itinerary"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TravelApp//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
  ];
  const now = toICSDate(new Date());
  for (const e of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${toICSDate(e.start)}`);
    lines.push(`DTEND:${toICSDate(e.end)}`);
    lines.push(fold(`SUMMARY:${escapeICS(e.title)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${escapeICS(e.description)}`));
    if (e.location) lines.push(fold(`LOCATION:${escapeICS(e.location)}`));
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.geo) lines.push(`GEO:${e.geo.lat};${e.geo.lon}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(events: ICSEvent[], filename = "trip.ics"): void {
  const blob = new Blob([buildICS(events)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
