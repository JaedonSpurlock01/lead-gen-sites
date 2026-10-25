import type { HoursRow, ResolvedSite } from "@lead-gen/schema";

const short: Record<string, string> = { Monday: "Mo", Tuesday: "Tu", Wednesday: "We", Thursday: "Th", Friday: "Fr", Saturday: "Sa", Sunday: "Su" };

/** "Mon - Sat: 7am - 7pm" */
export const hoursDisplay = (hours: HoursRow[]) => hours.map((row) => `${row.days}: ${row.time}`).join(" · ");

/** schema.org openingHours, e.g. "Mo-Sa 07:00-19:00". */
export const openingHours = (hours: HoursRow[]) =>
  hours
    .filter((row) => row.dayOfWeek && row.opens && row.closes)
    .map((row) => {
      const days = row.dayOfWeek!.map((day) => short[day]);
      const range = days.length > 2 ? `${days[0]}-${days[days.length - 1]}` : days.join(",");
      return `${range} ${row.opens}-${row.closes}`;
    })
    .join(", ");

/** +18636952087 -> +1-863-695-2087 */
export const dashedPhone = (e164: string) => e164.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "+1-$1-$2-$3");

export const telHref = (site: ResolvedSite) => `tel:${site.business.phoneTel}`;
