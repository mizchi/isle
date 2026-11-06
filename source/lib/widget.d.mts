export type WidgetEmbedSource =
  /** Compatibility shorthand for widget.json + widget.js under a base URL. */
  | { src: string; descriptorURL?: never; loaderURL?: string }
  | { descriptorURL: string; loaderURL: string; src?: never };
export type WidgetEmbedOptions = WidgetEmbedSource & {
  /** Chooses the default element name; must match the loader distribution. Default: shared. */
  runtime?: 'shared' | 'standalone';
  /** Must match the name registered by the chosen loader. */
  tagName?: string;
  /** Optional standalone fallback page. Defaults to src in shorthand mode. */
  href?: string;
  title: string;
  /** Required integer CSS pixel dimensions, between 1 and 8192. Height never auto-resizes. */
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
};
/** Fixed-size custom element and a shared module script. Inline sizing works before upgrade. */
export function renderWidgetEmbed(options: WidgetEmbedOptions): string;
