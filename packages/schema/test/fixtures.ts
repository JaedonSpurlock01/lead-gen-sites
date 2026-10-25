import type { NicheInput } from "../src/niche";
import type { SiteInput } from "../src/site";

export const nicheFixture: NicheInput = {
  id: "asphalt-paving",
  name: "Asphalt Paving",
  schemaOrgType: "PavingContractor",
  services: [
    { slug: "asphalt-driveway-paving", nav: "Driveway Paving", formValue: "Asphalt Driveway Paving", imageSlot: "driveway" },
    { slug: "asphalt-repair", nav: "Asphalt Repair", formValue: "Asphalt Repair", imageSlot: "repair" },
  ],
  imageSlots: [
    { name: "logoLight" },
    { name: "logoDark" },
    { name: "favicon", required: false },
    { name: "hero" },
    { name: "driveway" },
    { name: "repair" },
  ],
  marketFields: [{ name: "climateLabel" }, { name: "climateSummary" }, { name: "pavingSeason" }],
  theme: {
    colors: { surface: "#e8eddf", surfaceAlt: "#cfdbd5", accent: "#f5cb5c", ink: "#242423", inkSoft: "#333533" },
    themeColor: "#242423",
  },
  layout: { heroVariants: ["default", "split"], sections: ["intro", "services", "faq"], optionalSections: ["form"] },
};

export const siteFixture: SiteInput = {
  id: "blackfoot",
  domain: "asphaltpavingblackfoot.com",
  cloudflareProject: "asphalt-paving-blackfoot",
  market: {
    climateLabel: "Snake River Plain freeze-thaw",
    climateSummary: "Freezing winters and spring thaw make drainage critical.",
    pavingSeason: "late spring through early fall",
  },
  assets: {
    logoLight: "assets/logo-light.png",
    logoDark: "assets/logo-dark.png",
    hero: "assets/hero.jpg",
    driveway: "assets/driveway.jpg",
    repair: "../../assets/photos/asphalt-repair.webp",
  },
  business: {
    name: "Asphalt Paving Blackfoot",
    phoneDisplay: "(208) 782-7152",
    phoneTel: "+12087827152",
    email: "info@asphaltpavingblackfoot.com",
    city: "Blackfoot",
    region: "ID",
    regionName: "Idaho",
    country: "US",
    latitude: "43.1905",
    longitude: "-112.3450",
    priceRange: "$$",
    serviceAreaLabel: "Blackfoot, Idaho",
  },
  socials: [{ name: "Facebook", href: "https://www.facebook.com" }],
  hours: [
    { days: "Monday–Friday", time: "8 AM–5 PM" },
    { days: "Sunday", time: "Closed" },
  ],
  serviceOptions: ["Asphalt Driveway Paving", "Asphalt Repair", "Other"],
  outboundLinks: [{ href: "https://pocatelloasphaltpaving.com/", text: "asphalt paving" }],
};
