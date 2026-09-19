/**
 * Request Validation Middleware.
 * SEC-002: All inputs validated server-side — never trust client data.
 * 
 * Uses Zod schemas for type-safe, declarative validation.
 * Returns structured error messages for each invalid field.
 */

const { ZodError } = require('zod');
const logger = require('../utils/logger');

/**
 * Validate request data against a Zod schema.
 * 
 * @param {import('zod').ZodSchema} schema - The Zod schema to validate against.
 * @param {'body'|'query'|'params'} source - Which part of the request to validate.
 * @returns {Function} Express middleware
 * 
 * Usage:
 *   router.post('/register', validate(registerSchema, 'body'), controller.register);
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const result = schema.parse(req[source]);
      // Replace the source with parsed/transformed data (trimmed, coerced, etc.)
      req[source] = result;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        return res.status(400).json({
          success: false,
          error: 'Validation failed.',
          details: errors,
        });
      }

      logger.error({ err }, 'Validation middleware: unexpected error');
      return res.status(500).json({
        success: false,
        error: 'Validation service error.',
      });
    }
  };
}

module.exports = { validate };
