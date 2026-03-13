import type { Components } from 'react-markdown';

/**
 * Safe overrides for HTML void elements in LLM-generated markdown.
 *
 * LLMs occasionally emit raw `<br>` tags whose surrounding text gets parsed
 * as children. React throws when a void element receives children, so we
 * render a plain `<br />` and discard any accidental children.
 */
export const safeMarkdownComponents: Components = {
  br: () => <br />,
};
