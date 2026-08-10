/* ── Document registry ──
   Single source of truth for "what document types does this app offer" —
   Home, Documents, Drafts, and the mobile nav all read this instead of each
   hardcoding their own copy of the same list. This is metadata only (title,
   description, category, availability) — it deliberately does NOT try to
   hold components/handlers/routing logic, so it stays a plain data file
   that's safe to import from anywhere (including future code) without
   pulling in React or any document's own workflow module.

   JSA and Incident Report entries describe those existing, unmodified
   document types (their own code is untouched by this registry's
   existence) so every screen that lists "available documents" has one
   list to read instead of three hand-maintained ones.

   category is a light grouping used only for Documents-tab section
   headings — see DOCUMENT_CATEGORIES below. Do not over-build this into a
   real taxonomy system. */

export const DOCUMENT_CATEGORIES = {
  fieldSafety: 'Field Safety',
  employeeAction: 'Employee Action',
};

export const DOCUMENT_REGISTRY = [
  {
    id: 'jsa',
    title: 'Job Safety Analysis',
    shortTitle: 'JSA',
    description: 'Create a new JSA or begin from a saved template.',
    category: 'fieldSafety',
    status: 'available',
    supportsDrafts: true,
    supportsTemplates: true,
  },
  {
    id: 'incident',
    title: 'Incident Report',
    shortTitle: 'Incident Report',
    description: 'Document and investigate a workplace incident, step by step.',
    category: 'fieldSafety',
    status: 'available',
    supportsDrafts: true,
    supportsTemplates: false,
  },
  {
    id: 'uncontrolledEvent',
    title: 'Uncontrolled Event Report',
    shortTitle: 'Uncontrolled Event',
    description: 'Record a near miss, weather event, equipment failure, or other uncontrolled event.',
    category: 'fieldSafety',
    status: 'available',
    supportsDrafts: true,
    supportsTemplates: false,
  },
  {
    id: 'medicalEvent',
    title: 'Employee Medical Event',
    shortTitle: 'Medical Event',
    description: 'Document an employee-reported medical condition or event and the response taken.',
    category: 'fieldSafety',
    status: 'available',
    supportsDrafts: true,
    supportsTemplates: false,
  },
  {
    id: 'disciplinary',
    title: 'Employee Disciplinary Notice',
    shortTitle: 'Disciplinary Notice',
    description: 'Document a verbal, written, or final warning discussion with an employee.',
    category: 'employeeAction',
    status: 'available',
    supportsDrafts: true,
    supportsTemplates: false,
  },
  {
    id: 'separation',
    title: 'Employee Separation',
    shortTitle: 'Employee Separation',
    description: 'Document the reason and details of an employee separation.',
    category: 'employeeAction',
    status: 'available',
    supportsDrafts: true,
    supportsTemplates: false,
  },
];

export function getDocumentMeta(id) {
  return DOCUMENT_REGISTRY.find(d => d.id === id) || null;
}
