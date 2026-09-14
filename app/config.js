// app/config.js - site-wide runtime constants (ES module).
export const SITE_ORIGIN = 'https://devops.lucasluize.com';
export const CONTACT_ENDPOINT = '/api/contact'; // CloudFront -> OAC -> Lambda -> SES

// giscus (GitHub Discussions comments). Empty repo = comments UI stays off.
// Setup: public repo -> Settings enable Discussions -> install github.com/apps/giscus
// -> paste the four values from https://giscus.app configurator.
export const GISCUS = {
  repo: '',        // e.g. 'lucasluize-tech/s3-bucket-landing'
  repoId: '',
  category: 'Announcements',
  categoryId: '',
};
