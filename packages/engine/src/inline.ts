import type { OutboundLink } from "@lead-gen/schema";

const escape = (input: string) =>
  input.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);

const safeHref = (href: string) => /^(https?:\/\/|\/|#|tel:|mailto:)/.test(href);

export type InlineOptions = {
  outboundLinks?: OutboundLink[];
  /** Class for outbound links, e.g. "outbound-link". */
  outboundClass?: string;
};

/**
 * Turns block text into safe HTML. Everything is escaped except two forms:
 * `[text](href)` becomes a link (relative, http(s), tel: and mailto: only) and
 * `{{outbound:<id>}}` becomes the site's outbound link with that id, opening in a new tab.
 */
export function renderInline(input: string, options: InlineOptions = {}): string {
  const links = new Map((options.outboundLinks ?? []).filter((link) => link.id).map((link) => [link.id as string, link]));
  return escape(input)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
      const target = href.replace(/&amp;/g, "&");
      return safeHref(target) ? `<a href="${escape(target)}">${label}</a>` : match;
    })
    .replace(/\{\{outbound:([a-z0-9-]+)\}\}/g, (_match, id: string) => {
      const link = links.get(id);
      if (!link || !/^https:\/\//.test(link.href)) return "";
      const cls = options.outboundClass ? ` class="${escape(options.outboundClass)}"` : "";
      return `<a${cls} href="${escape(link.href)}" target="_blank" rel="noopener noreferrer">${escape(link.text)}</a>`;
    });
}
