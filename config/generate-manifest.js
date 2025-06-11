const manifestV3Object = require('./manifest/v3.js');

module.exports = function(browser) {
  let manifest = JSON.parse(JSON.stringify(manifestV3Object));

  if (manifest.content_security_policy && typeof manifest.content_security_policy.extension_pages === 'string') {
    manifest.content_security_policy.extension_pages = manifest.content_security_policy.extension_pages.replace(/\s+/g, ' ');
  }

  return JSON.stringify(manifest, null, 2);
};
