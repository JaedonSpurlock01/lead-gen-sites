import type { HoursRow } from "@lead-gen/schema";

/** "Monday, Tuesday, …: 9 AM–5 PM · Saturday, Sunday: Closed" */
export const formattedHours = (hours: HoursRow[]) => hours.map((row) => `${row.days}: ${row.time}`).join(" · ");

export const openingHoursSpecification = (hours: HoursRow[]) =>
  hours
    .filter((row) => row.dayOfWeek && row.opens && row.closes)
    .map((row) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: row.dayOfWeek, opens: row.opens, closes: row.closes }));

export const servicePath = (slug: string) => `/services/${slug}/`;

/** Canonical paths always end in a slash, /404/ included. */
export const canonicalPath = (pathname: string) => (pathname.endsWith("/") ? pathname : `${pathname.replace(/\.html$/, "")}/`);
