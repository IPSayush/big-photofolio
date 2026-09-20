/**
 * Security Hardening Middleware — SEC-008, NFR-SEC-001.
 * 
 * Additional security headers and protections beyond helmet defaults.
 */

/**
 * Apply production security headers.
 */
function securityHeaders(req, res, next) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy — restrict browser features
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), interest-cohort=()');

  // Remove server fingerprint
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = { securityHeaders };
