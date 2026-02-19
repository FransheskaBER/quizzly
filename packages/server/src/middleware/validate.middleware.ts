import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

interface ValidateSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * Validates req.body/params/query against Zod schema(s).
 * On success: replaces the parsed fields with coerced/transformed values.
 * On failure: passes ZodError to next() — global error middleware formats it as 400.
 *
 * Usage:
 *   validate({ body: signupSchema })              — validate body only
 *   validate({ body: schema, params: idSchema })  — validate multiple parts
 */
export const validate = (schema: ZodSchema | ValidateSchemas) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if ('parse' in schema) {
        // Single schema — applies to body
        req.body = schema.parse(req.body);
      } else {
        if (schema.body) req.body = schema.body.parse(req.body);
        if (schema.params) req.params = schema.params.parse(req.params);
        if (schema.query) {
          Object.assign(req.query, schema.query.parse(req.query));
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
