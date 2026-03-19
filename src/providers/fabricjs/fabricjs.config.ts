import type { ProviderSection, ExtractionConfig } from '../../core/provider.js'

const BASE_URL = 'https://fabricjs.com'

/** All navigable sections of the Fabric.js documentation site. */
export const SECTIONS: ProviderSection[] = [
  { name: 'api', indexUrl: `${BASE_URL}/api/`, urlPrefix: 'api' },
  { name: 'docs', indexUrl: `${BASE_URL}/docs/`, urlPrefix: 'docs' },
]

/** HTML extraction settings for fabricjs.com (Starlight / TypeDoc). */
export const EXTRACTION: ExtractionConfig = {
  contentSelector: 'div.sl-markdown-content',
  baseUrl: BASE_URL,
  detectSection: (url: string) => (url.includes('/api/') ? 'api' : 'docs'),
}

/**
 * Known Fabric.js classes that can be used as shorthand targets
 * (e.g. `"Canvas"` instead of the full URL).
 */
export const KNOWN_CLASSES = [
  'ActiveSelection',
  'BaseBrush',
  'Canvas',
  'Circle',
  'CircleBrush',
  'Color',
  'Control',
  'Ellipse',
  'FabricImage',
  'FabricObject',
  'FabricText',
  'Gradient',
  'Group',
  'IText',
  'InteractiveFabricObject',
  'Intersection',
  'LayoutManager',
  'Line',
  'Observable',
  'Path',
  'Pattern',
  'PatternBrush',
  'PencilBrush',
  'Point',
  'Polygon',
  'Polyline',
  'Rect',
  'Shadow',
  'SprayBrush',
  'StaticCanvas',
  'Textbox',
  'Triangle',
  'WebGLFilterBackend',
] as const

/** Builds a full API URL from a class name shorthand. */
export function buildApiUrl(target: string): string {
  if (target.startsWith('http')) return target
  const name = target.toLowerCase()
  return `${BASE_URL}/api/classes/${name}/`
}

/** Classifies a fabricjs.com URL into a page kind for the search index. */
export function classifyPage(url: string): string {
  if (url.includes('/api/classes/')) return 'class'
  if (url.includes('/api/interfaces/')) return 'interface'
  if (url.includes('/api/type-aliases/')) return 'type-alias'
  if (url.includes('/api/functions/')) return 'function'
  if (url.includes('/api/variables/')) return 'variable'
  if (url.includes('/api/namespaces/')) return 'namespace'
  if (url.includes('/docs/')) return 'guide'
  return 'other'
}

export { BASE_URL }
