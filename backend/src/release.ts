// Identifies the exact running candidate. Render provides the deployed commit; RELEASE can override it.
export const RELEASE = (process.env.RELEASE || process.env.RENDER_GIT_COMMIT || 'local').slice(0, 12);
