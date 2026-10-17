// src/utils/zod-comments.ts

import type { FieldValidationType } from '../field-config-schema';
import { compileValidationPattern } from './validation-pattern';

/**
 * Generate Zod comment for prisma-zod-generator
 * https://github.com/omar-dulaimi/zod-prisma-types
 */
export function buildZodComment(validation?: FieldValidationType): string | undefined {
  if (!validation) return undefined;

  const parts: string[] = [];

  // Type validations first (email, url, uuid, cuid)
  if (validation.email) {
    parts.push('email()');
  }
  if (validation.url) {
    parts.push('url()');
  }
  if (validation.uuid) {
    parts.push('uuid()');
  }
  if (validation.cuid) {
    parts.push('cuid()');
  }

  // Then constraint validations
  if (validation.minLength !== undefined) {
    parts.push(`min(${validation.minLength})`);
  }
  if (validation.maxLength !== undefined) {
    parts.push(`max(${validation.maxLength})`);
  }
  if (validation.pattern) {
    const pattern = compileValidationPattern(validation.pattern);
    if (pattern === null) throw new Error('Invalid validation pattern');
    parts.push(`regex(/${pattern.source}/${pattern.flags})`);
  }

  // Number validations
  if (validation.min !== undefined) {
    parts.push(`min(${validation.min})`);
  }
  if (validation.max !== undefined) {
    parts.push(`max(${validation.max})`);
  }
  if (validation.int) {
    parts.push('int()');
  }
  if (validation.positive) {
    parts.push('positive()');
  }
  if (validation.negative) {
    parts.push('negative()');
  }

  // Array validations - use length() not min/max
  if (validation.minItems !== undefined) {
    parts.push(`length(${validation.minItems})`);
  }
  if (validation.maxItems !== undefined) {
    parts.push(`length(${validation.maxItems})`);
  }

  // Custom
  if (validation.custom) {
    parts.push(validation.custom);
  }

  if (parts.length === 0) return undefined;

  return `/// @zod.${parts.join('.')}`;
}
