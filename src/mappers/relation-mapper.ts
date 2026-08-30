// src/mappers/relation-mapper.ts

import type { PrismaModel } from '../utils/prisma-ast';
import type { FieldDefinitionType } from '../field-config-schema';
import type { SchemaBuilderConfig } from '../core/schema-builder';
import { toSnakeCase, toPascalCase } from '../utils/naming';

/**
 * Check if a relation field needs an explicit junction table
 */
export function needsJunctionTable(field: FieldDefinitionType): boolean {
  if (field.type !== 'relation' || field.config?.type !== 'relation') {
    return false;
  }
  
  return field.config.relationType === 'manyToMany';
}

/**
 * Build junction table for many-to-many relations
 * 
 * Example: Post <-> Category becomes PostCategory with:
 * - post_id + category_id (unique together)
 * - order (for sorting)
 * - timestamps
 */
export function buildJunctionTable(
  fromModel: string,
  field: FieldDefinitionType,
  config: SchemaBuilderConfig
): PrismaModel {
  if (field.config?.type !== 'relation') {
    throw new Error('Field must be a relation');
  }
  
  const relationConfig = field.config;
  const toModel = toPascalCase(relationConfig.targetModel);
  
  const tableName = buildJunctionTableName(fromModel, toModel, config);
  const fromFk = `${toSnakeCase(fromModel)}_id`;
  const toFk = `${toSnakeCase(toModel)}_id`;
  
  return {
    name: tableName,
    fields: [
      {
        name: 'id',
        type: 'String',
        attributes: ['@id', '@default(cuid())']
      },
      {
        name: fromFk,
        type: 'String'
      },
      {
        name: toFk,
        type: 'String'
      },
      {
        name: 'order',
        type: 'Int',
        optional: true
      },
      {
        name: 'created_at',
        type: 'DateTime',
        attributes: ['@default(now())']
      },
      // Relation to from model
      {
        name: toSnakeCase(fromModel),
        type: fromModel,
        relation: {
          fields: [fromFk],
          references: ['id'],
          onDelete: relationConfig.cascade === 'cascade' ? 'Cascade' : 'Restrict'
        }
      },
      // Relation to target model
      {
        name: toSnakeCase(toModel),
        type: toModel,
        relation: {
          fields: [toFk],
          references: ['id'],
          onDelete: 'Cascade' // Always cascade delete from junction on target delete
        }
      }
    ],
    unique: [[fromFk, toFk]],
    indexes: [[fromFk], [toFk]] // Indexes for both FKs
  };
}

export function buildJunctionTableName(
  fromModel: string,
  toModel: string,
  config: SchemaBuilderConfig
): string {
  if (config.convention === 'snake_case') {
    return `${toSnakeCase(fromModel)}_${toSnakeCase(toModel)}`;
  }
  
  // PascalCase: PostCategory
  return `${fromModel}${toModel}`;
}
/**
 * The scalar foreign-key column this model owns for a relation field.
 * Only oneToOne and manyToOne own one; list sides own no column on this model.
 */
export function relationScalarColumn(field: FieldDefinitionType): string | null {
  if (field.type !== 'relation' || field.config?.type !== 'relation') {
    return null;
  }

  const { relationType } = field.config;

  if (relationType !== 'oneToOne' && relationType !== 'manyToOne') {
    return null;
  }

  return `${field.key}_id`;
}

/**
 * oneToOne emits its scalar column with `@unique`, which is already a unique
 * index on every supported provider; a second plain index would be redundant.
 */
export function relationScalarNeedsIndex(field: FieldDefinitionType): boolean {
  if (relationScalarColumn(field) === null) {
    return false;
  }

  return field.config?.type === 'relation' && field.config.relationType === 'manyToOne';
}

/**
 * Scalar relation columns needing an explicit `@@index`, in field order.
 */
export function relationIndexColumns(fields: FieldDefinitionType[]): string[] {
  return fields.flatMap((field) => {
    if (!relationScalarNeedsIndex(field)) {
      return [];
    }

    const column = relationScalarColumn(field);
    return column ? [column] : [];
  });
}
