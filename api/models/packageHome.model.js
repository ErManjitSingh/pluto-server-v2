import mongoose from 'mongoose';

/**
 * Packages home page configuration (admin "Package Home Page").
 *
 * There is exactly ONE document: it is created once and edited afterwards.
 * `singletonKey` has a unique index, so a second document can never be created.
 */
export const PACKAGE_HOME_KEY = 'packages-home';

/**
 * Every section type the admin can add -> how its data is shaped.
 *  - header  : heading, subHeading, images[]
 *  - list    : items[] -> { order, name, slug, image, tagline?, fromPrice?, featured? }
 *  - content : themeSlug, content, image
 *  - faq     : faqs[]
 *  - cards   : items[] with fields that differ per section type (offer, blog, ...)
 *  - single  : values{} with fields that differ per section type (cta, video, ...)
 */
export const SECTION_KINDS = {
  announcement: 'single',
  header: 'header',
  country: 'list',
  state: 'list',
  city: 'list',
  theme: 'list',
  content: 'content',
  offer: 'cards',
  travelStyle: 'cards',
  season: 'cards',
  whyChoose: 'cards',
  stats: 'cards',
  testimonial: 'cards',
  partner: 'cards',
  gallery: 'cards',
  video: 'single',
  blog: 'cards',
  cta: 'single',
  newsletter: 'single',
  faq: 'faq',
  seoContent: 'single',
};

export const SECTION_TYPE_LIST = Object.keys(SECTION_KINDS);

export const LAYOUT_VALUES = ['grid', 'slider', 'list'];

const headerImageSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    url: { type: String, default: '', trim: true },
    alt: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const faqSchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true }, // rich text (HTML)
  },
  { _id: false }
);

const sectionSchema = new mongoose.Schema(
  {
    // Frontend generated id (e.g. "sec_lq3k_ab12c"), kept so the admin can reload the same sections
    id: { type: String, required: true, trim: true },
    // Top-to-bottom position on the page (1-based)
    position: { type: Number, required: true, min: 1 },
    type: { type: String, required: true, enum: SECTION_TYPE_LIST },
    enabled: { type: Boolean, default: true },
    // false when the section has nothing to show -> skipped in displayOrder
    hasContent: { type: Boolean, default: false },
    title: { type: String, default: '', trim: true },

    // header
    heading: { type: String, default: '', trim: true },
    subHeading: { type: String, default: '' }, // rich text (HTML)
    images: { type: [headerImageSchema], default: undefined },

    // list + cards
    layout: { type: String, enum: LAYOUT_VALUES, default: undefined },
    maxVisible: { type: Number, min: 0, default: undefined }, // 0 = show all
    // list items: { order, name, slug, image, tagline, fromPrice, featured }
    // card items: fields depend on the section type (title, subtitle, link, image, ...)
    items: { type: [mongoose.Schema.Types.Mixed], default: undefined },

    // content (theme content block)
    themeSlug: { type: String, default: '', trim: true },
    content: { type: String, default: '' }, // rich text (HTML)
    image: { type: String, default: '', trim: true },

    // faq
    faqs: { type: [faqSchema], default: undefined },

    // single blocks (announcement, video, cta, newsletter, seoContent)
    values: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

const packageHomeSchema = new mongoose.Schema(
  {
    // Unique -> guarantees a single document
    singletonKey: {
      type: String,
      default: PACKAGE_HOME_KEY,
      unique: true,
      immutable: true,
    },
    pageType: { type: String, default: PACKAGE_HOME_KEY },
    isActive: { type: Boolean, default: true },

    seo: {
      metaTitle: { type: String, default: '', trim: true },
      metaDescription: { type: String, default: '' }, // rich text (HTML)
      metaKeywords: { type: String, default: '', trim: true },
      canonicalTag: { type: String, default: '', trim: true },
    },

    // Section types shown on the page, top to bottom (enabled + has content only)
    displayOrder: { type: [String], default: [] },
    sections: { type: [sectionSchema], default: [] },
  },
  { timestamps: true }
);

const PackageHome = mongoose.model('PackageHome', packageHomeSchema);

export default PackageHome;
