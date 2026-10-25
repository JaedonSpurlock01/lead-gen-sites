import niche from "virtual:niche";
import site from "virtual:site";
import type { FaqItem, ServicePage } from "@lead-gen/schema";

export function faqPageSchema(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

export function serviceSchema(service: ServicePage, pageUrl: string) {
  const { business } = site;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: service.title,
    description: service.description,
    url: pageUrl,
    areaServed: {
      "@type": "City",
      name: business.city,
      containedInPlace: {
        "@type": "State",
        name: business.regionName,
      },
    },
    provider: {
      "@type": niche.schemaOrgType,
      name: business.name,
      telephone: business.phoneTel,
      url: site.url,
    },
  };
}
