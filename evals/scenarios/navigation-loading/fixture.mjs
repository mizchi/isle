// Settings passed to isle({ entry, mounts, ...options }).
export const options = {
  loading: 'lazy',
  speculation: {
    tag: 'isle-navigation',
    prefetch: [{ where: { and: [
      { href_matches: '/*' }, { selector_matches: 'a[data-isle-prefetch]' },
      { not: { selector_matches: '[download], [data-no-speculation]' } },
    ] }, eagerness: 'moderate' }],
    prerender: [{ where: { and: [
      { href_matches: '/*' }, { selector_matches: 'a[data-isle-prerender]' },
      { not: { selector_matches: '[download], [data-no-speculation]' } },
    ] }, eagerness: 'moderate' }],
  },
};
