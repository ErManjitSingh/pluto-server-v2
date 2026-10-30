import mongoose from 'mongoose';
import PackageHome, {
  LAYOUT_VALUES,
  PACKAGE_HOME_KEY,
  SECTION_KINDS,
} from '../models/packageHome.model.js';

const MAX_SECTIONS = 60;
const MAX_ITEMS = 300;
const PLACE_TYPES = ['country', 'state', 'city'];

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

const asText = (value) => (value === undefined || value === null ? '' : String(value).trim());

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Rich text editor returns HTML ("<p><br></p>" when empty)
function isRichTextEmpty(html) {
  const text = String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return !text;
}

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    return value.includes('<') ? isRichTextEmpty(value) : !value.trim();
  }
  return false; // numbers / booleans count as content
}

/**
 * Keep only primitive values and Mongo-safe keys (no "$" / "." in keys).
 * Used for card items and single-block values whose fields differ per section type.
 */
function cleanObject(obj) {
  const out = {};
  if (!isPlainObject(obj)) return out;

  for (const [key, value] of Object.entries(obj)) {
    if (!key || key.startsWith('$') || key.includes('.')) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      out[key] = typeof value === 'string' ? value.trim() : value;
    }
  }
  return out;
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/* ---------------------------------------------------------------------------
 * Section sanitizer
 *
 * The server is the source of truth for `position`, `hasContent` and
 * `displayOrder`, so the website can trust them without recalculating.
 * ------------------------------------------------------------------------- */

function sanitizeSection(raw, index) {
  if (!isPlainObject(raw)) {
    return { error: `sections[${index}] must be an object` };
  }

  const type = asText(raw.type);
  const kind = SECTION_KINDS[type];
  if (!kind) {
    return { error: `sections[${index}]: unknown section type "${type}"` };
  }

  const section = {
    id: asText(raw.id) || `${type}_${Date.now().toString(36)}_${index}`,
    position: index + 1,
    type,
    enabled: raw.enabled !== false,
    title: asText(raw.title),
    hasContent: false,
  };

  switch (kind) {
    case 'header': {
      const images = (Array.isArray(raw.images) ? raw.images : [])
        .filter((img) => isPlainObject(img) && asText(img.url))
        .slice(0, MAX_ITEMS)
        .map((img, i) => ({ order: i + 1, url: asText(img.url), alt: asText(img.alt) }));

      section.heading = asText(raw.heading);
      section.subHeading = isRichTextEmpty(raw.subHeading) ? '' : String(raw.subHeading);
      section.images = images;
      section.hasContent = Boolean(section.heading || section.subHeading || images.length);
      break;
    }

    case 'list': {
      const isPlace = PLACE_TYPES.includes(type);
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .filter((item) => isPlainObject(item) && asText(item.name))
        .slice(0, MAX_ITEMS)
        .map((item, i) => {
          const base = {
            order: i + 1,
            name: asText(item.name),
            slug: asText(item.slug),
            image: asText(item.image), // single cover image
          };
          if (!isPlace) return base;
          return {
            ...base,
            tagline: asText(item.tagline),
            fromPrice: toNumberOrNull(item.fromPrice),
            featured: Boolean(item.featured),
          };
        });

      section.layout = LAYOUT_VALUES.includes(raw.layout) ? raw.layout : 'grid';
      section.maxVisible = Math.max(0, Number(raw.maxVisible) || 0);
      section.items = items;
      section.hasContent = items.length > 0;
      break;
    }

    case 'cards': {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map(cleanObject)
        .filter((item) => Object.entries(item).some(([key, v]) => key !== 'order' && !isEmptyValue(v)))
        .slice(0, MAX_ITEMS)
        .map((item, i) => ({ ...item, order: i + 1 }));

      section.layout = LAYOUT_VALUES.includes(raw.layout) ? raw.layout : 'grid';
      section.maxVisible = Math.max(0, Number(raw.maxVisible) || 0);
      section.items = items;
      section.hasContent = items.length > 0;
      break;
    }

    case 'content': {
      section.themeSlug = asText(raw.themeSlug);
      section.content = isRichTextEmpty(raw.content) ? '' : String(raw.content);
      section.image = asText(raw.image);
      section.hasContent = Boolean(section.content);
      break;
    }

    case 'faq': {
      const faqs = (Array.isArray(raw.faqs) ? raw.faqs : [])
        .filter((f) => isPlainObject(f) && asText(f.question) && !isRichTextEmpty(f.answer))
        .slice(0, MAX_ITEMS)
        .map((f, i) => ({ order: i + 1, question: asText(f.question), answer: String(f.answer) }));

      section.faqs = faqs;
      section.hasContent = faqs.length > 0;
      break;
    }

    case 'single': {
      const values = cleanObject(raw.values);
      section.values = values;
      section.hasContent = Object.values(values).some((v) => !isEmptyValue(v));
      break;
    }

    default:
      break;
  }

  return { section };
}

function sanitizeSections(rawSections) {
  if (!Array.isArray(rawSections)) {
    return { error: 'sections must be an array' };
  }
  if (rawSections.length > MAX_SECTIONS) {
    return { error: `A maximum of ${MAX_SECTIONS} sections is allowed` };
  }

  const sections = [];
  const seenIds = new Set();

  for (let i = 0; i < rawSections.length; i += 1) {
    const { section, error } = sanitizeSection(rawSections[i], i);
    if (error) return { error };

    if (seenIds.has(section.id)) {
      return { error: `sections[${i}]: duplicate id "${section.id}"` };
    }
    seenIds.add(section.id);
    sections.push(section);
  }

  const displayOrder = sections.filter((s) => s.enabled && s.hasContent).map((s) => s.type);
  return { sections, displayOrder };
}

function sanitizeSeo(rawSeo) {
  const seo = isPlainObject(rawSeo) ? rawSeo : {};
  return {
    metaTitle: asText(seo.metaTitle),
    metaDescription: isRichTextEmpty(seo.metaDescription) ? '' : String(seo.metaDescription),
    metaKeywords: asText(seo.metaKeywords),
    canonicalTag: asText(seo.canonicalTag),
  };
}

function handleError(res, error) {
  if (error?.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: error.message });
}

/* ---------------------------------------------------------------------------
 * Controllers
 * ------------------------------------------------------------------------- */

/**
 * POST /api/package-home/create
 * Body: { isActive?, seo?, sections }
 * Only works once. If the page already exists, use PUT /update/:id.
 */
export const createPackageHome = async (req, res) => {
  try {
    const existing = await PackageHome.findOne({ singletonKey: PACKAGE_HOME_KEY }).select('_id');
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Package home page already exists. Please update it instead.',
        data: { _id: existing._id },
      });
    }

    const parsed = sanitizeSections(req.body?.sections ?? []);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const doc = await PackageHome.create({
      isActive: req.body?.isActive !== false,
      seo: sanitizeSeo(req.body?.seo),
      sections: parsed.sections,
      displayOrder: parsed.displayOrder,
    });

    res.status(201).json({
      success: true,
      message: 'Package home page created successfully',
      data: doc,
    });
  } catch (error) {
    // Two requests racing: the unique index on singletonKey rejects the second one
    if (error?.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Package home page already exists. Please update it instead.',
      });
    }
    handleError(res, error);
  }
};

/**
 * GET /api/package-home/get
 * Returns the single package home page, or `data: null` if it was never saved
 * (the admin uses this to decide between create and update).
 */
export const getPackageHome = async (req, res) => {
  try {
    const doc = await PackageHome.findOne({ singletonKey: PACKAGE_HOME_KEY });

    res.status(200).json({
      success: true,
      data: doc || null,
    });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT / PATCH /api/package-home/update/:id
 * Body: any of { isActive, seo, sections }. `sections`, when sent, replaces all sections.
 */
export const updatePackageHome = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }

    const body = req.body ?? {};
    const update = {};

    if (body.isActive !== undefined) update.isActive = Boolean(body.isActive);

    if (body.seo !== undefined) {
      const seo = sanitizeSeo(body.seo);
      for (const [key, value] of Object.entries(seo)) update[`seo.${key}`] = value;
    }

    if (body.sections !== undefined) {
      const parsed = sanitizeSections(body.sections);
      if (parsed.error) {
        return res.status(400).json({ success: false, message: parsed.error });
      }
      update.sections = parsed.sections;
      update.displayOrder = parsed.displayOrder;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    const doc = await PackageHome.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Package home page not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Package home page updated successfully',
      data: doc,
    });
  } catch (error) {
    handleError(res, error);
  }
};
