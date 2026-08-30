import type { PrismaSchema, PrismaDatasource, PrismaGenerator, PrismaModel, PrismaField } from '../utils/prisma-ast';
import { buildZodComment } from '../utils/zod-comments';

/**
 * Convert Prisma AST to schema string
 * Returns UNFORMATTED schema - formatting removed to match test expectations
 */
export async function writeSchema(schema: PrismaSchema): Promise<string> {
  return writeSchemaSync(schema);
}

/**
 * Synchronous version - returns UNFORMATTED schema
 */
export function writeSchemaSync(schema: PrismaSchema): string {
  const parts: string[] = [];

  parts.push(writeDatasource(schema.datasource));

  for (const generator of schema.generators) {
    parts.push(writeGenerator(generator));
  }

  for (const model of schema.models) {
    parts.push(writeModel(model));
  }

  return parts.join('\n\n') + '\n';
}

export function writeDatasource(datasource: PrismaDatasource): string {
  const lines: string[] = ['datasource db {'];
  
  lines.push(`provider = "${datasource.provider}"`);
  lines.push(`url = ${datasource.url.startsWith('env(') ? datasource.url : `"${datasource.url}"`}`);
  
  if (datasource.directUrl) {
    lines.push(`directUrl = ${datasource.directUrl.startsWith('env(') ? datasource.directUrl : `"${datasource.directUrl}"`}`);
  }
  
  lines.push('}');
  return lines.join('\n');
}

export function writeGenerator(generator: PrismaGenerator): string {
  const lines: string[] = [`generator ${generator.name} {`];
  
  lines.push(`provider = "${generator.provider}"`);
  
  if (generator.output) {
    lines.push(`output = "${generator.output}"`);
  }
  
  if (generator.config) {
    for (const [key, value] of Object.entries(generator.config)) {
      if (key === 'previewFeatures' && Array.isArray(value)) {
        lines.push(`${key} = [${value.map(v => `"${v}"`).join(', ')}]`);
      } else {
        lines.push(`${key} = ${formatConfigValue(value)}`);
      }
    }
  }
  
  lines.push('}');
  return lines.join('\n');
}


export function writeModel(model: PrismaModel): string {
  const lines: string[] = [`model ${model.name} {`];
  
  // Calculate max widths for alignment
  let maxNameWidth = 0;
  let maxTypeWidth = 0;
  
  for (const field of model.fields) {
    maxNameWidth = Math.max(maxNameWidth, field.name.length);
    const typeStr = formatFieldType(field);
    maxTypeWidth = Math.max(maxTypeWidth, typeStr.length);
  }
  
  // Add padding
  maxNameWidth += 2;
  maxTypeWidth += 2;
  
  // Write fields with Zod comments
  for (const field of model.fields) {
    const zodComment = buildZodComment(field.validation);
    if (zodComment) {
      lines.push(`  ${zodComment}`);
    }
    
    lines.push(writeFieldAligned(field, maxNameWidth, maxTypeWidth));
  }
  
  // Block attributes
  if (model.indexes && model.indexes.length > 0) {
    lines.push('');
    for (const index of model.indexes) {
      lines.push(`  @@index([${index.join(', ')}])`);
    }
  }
  
  if (model.unique && model.unique.length > 0) {
    if (!model.indexes || model.indexes.length === 0) {
      lines.push('');
    }
    for (const unique of model.unique) {
      lines.push(`  @@unique([${unique.join(', ')}])`);
    }
  }
  
  if (model.map) {
    if ((!model.indexes || model.indexes.length === 0) && 
        (!model.unique || model.unique.length === 0)) {
      lines.push('');
    }
    lines.push(`  @@map("${model.map}")`);
  }
  
  lines.push('}');
  return lines.join('\n');
}

export function writeField(field: PrismaField): string {
  let result = `${field.name} ${formatFieldType(field)}`;
  
  if (field.attributes && field.attributes.length > 0) {
    result += ' ' + field.attributes.join(' ');
  }
  
  if (field.relation) {
    result += ' ' + formatRelation(field.relation);
  }
  
  if (field.map) {
    result += ` @map("${field.map}")`;
  }
  
  return result;
}

function writeFieldAligned(field: PrismaField, nameWidth: number, typeWidth: number): string {
  const name = field.name.padEnd(nameWidth);
  const type = formatFieldType(field).padEnd(typeWidth);
  
  let result = `  ${name}  ${type}`;
  
  if (field.attributes && field.attributes.length > 0) {
    result += field.attributes.join(' ');  // No space before - field already padded
  }
  
  if (field.relation) {
    result += ' ' + formatRelation(field.relation);
  }
  
  if (field.map) {
    result += ` @map("${field.map}")`;
  }
  
  return result.trimEnd();  // <-- ADD THIS to remove trailing spaces
}

function formatFieldType(field: PrismaField): string {
  const type = field.type;
  
  // List fields are NEVER optional in Prisma
  if (field.list) {
    return type + '[]';
  }
  
  // Only non-list fields can be optional
  if (field.optional) {
    return type + '?';
  }
  
  return type;
}

function formatRelation(relation: PrismaField['relation']): string {
  if (!relation) return '';
  
  const parts: string[] = [];
  
  if (relation.name) {
    parts.push(`"${relation.name}"`);
  }
  
  if (relation.fields) {
    parts.push(`fields: [${relation.fields.join(', ')}]`);
  }
  
  if (relation.references) {
    parts.push(`references: [${relation.references.join(', ')}]`);
  }
  
  if (relation.onDelete) {
    parts.push(`onDelete: ${relation.onDelete}`);
  }
  
  if (relation.onUpdate) {
    parts.push(`onUpdate: ${relation.onUpdate}`);
  }
  
  return `@relation(${parts.join(', ')})`;
}

function formatConfigValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'boolean') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatConfigValue).join(', ')}]`;
  }
  return String(value);
}