// tests/mappers/relation-mapper.test.ts

import { describe, it, expect } from 'vitest';
import { SchemaBuilderConfig } from '../../src/core/schema-builder';
import { FieldDefinitionType } from '../../src/field-config-schema';
import {
  needsJunctionTable,
  buildJunctionTable,
  relationScalarColumn,
  relationScalarNeedsIndex,
  relationIndexColumns
} from '../../src/mappers/relation-mapper';
import { mapFieldToPrisma } from '../../src/mappers/field-mapper';

// FIXED: Changed to PascalCase
const baseConfig: SchemaBuilderConfig = {
  convention: 'PascalCase',
  i18nEnabled: false,
  i18nTableNaming: '${identifier}_translation'
};

describe('needsJunctionTable', () => {
  it('returns false for oneToOne', () => {
    const field: FieldDefinitionType = {
      key: 'profile',
      label: 'Profile',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'oneToOne',
        targetModel: 'profile',
        displayField: 'name',
        cascade: 'cascade'
      }
    };

    expect(needsJunctionTable(field)).toBe(false);
  });

  it('returns false for manyToOne', () => {
    const field: FieldDefinitionType = {
      key: 'author',
      label: 'Author',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'manyToOne',
        targetModel: 'user',
        displayField: 'name',
        cascade: 'restrict'
      }
    };

    expect(needsJunctionTable(field)).toBe(false);
  });

  it('returns false for oneToMany', () => {
    const field: FieldDefinitionType = {
      key: 'posts',
      label: 'Posts',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'oneToMany',
        targetModel: 'post',
        displayField: 'title',
        cascade: 'cascade'
      }
    };

    expect(needsJunctionTable(field)).toBe(false);
  });

  it('returns true for manyToMany', () => {
    const field: FieldDefinitionType = {
      key: 'categories',
      label: 'Categories',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'manyToMany',
        targetModel: 'category',
        displayField: 'name',
        cascade: 'restrict'
      }
    };

    expect(needsJunctionTable(field)).toBe(true);
  });
});

describe('buildJunctionTable', () => {
  it('builds junction table for manyToMany relation', () => {
    const field: FieldDefinitionType = {
      key: 'categories',
      label: 'Categories',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'manyToMany',
        targetModel: 'category',
        displayField: 'name',
        cascade: 'restrict'
      }
    };

    const result = buildJunctionTable('Post', field, baseConfig);

    expect(result.name).toBe('PostCategory');
    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'id', type: 'String' }),
        expect.objectContaining({ name: 'post_id', type: 'String' }),
        expect.objectContaining({ name: 'category_id', type: 'String' }),
        expect.objectContaining({ name: 'order', type: 'Int' }),
        // Relations
        expect.objectContaining({
          name: 'post',
          type: 'Post',
          relation: expect.objectContaining({
            fields: ['post_id'],
            references: ['id']
          })
        }),
        expect.objectContaining({
          name: 'category',
          type: 'Category',
          relation: expect.objectContaining({
            fields: ['category_id'],
            references: ['id']
          })
        })
      ])
    );

    // Should have unique constraint on both FKs
    expect(result.unique).toContainEqual(['post_id', 'category_id']);
  });

  it('uses proper naming convention', () => {
    const field: FieldDefinitionType = {
      key: 'tags',
      label: 'Tags',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'manyToMany',
        targetModel: 'tag',
        displayField: 'name',
        cascade: 'restrict'
      }
    };

    const snakeConfig: SchemaBuilderConfig = {
      ...baseConfig,
      convention: 'snake_case'
    };

    const result = buildJunctionTable('blog_post', field, snakeConfig);

    expect(result.name).toBe('blog_post_tag');
  });

  it('handles cascade delete configuration', () => {
    const field: FieldDefinitionType = {
      key: 'categories',
      label: 'Categories',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'manyToMany',
        targetModel: 'category',
        displayField: 'name',
        cascade: 'cascade'
      }
    };

    const result = buildJunctionTable('Post', field, baseConfig);

    const postRelation = result.fields.find(f => f.name === 'post')?.relation;
    expect(postRelation?.onDelete).toBe('Cascade');
  });

  it('adds timestamps to junction table', () => {
    const field: FieldDefinitionType = {
      key: 'categories',
      label: 'Categories',
      type: 'relation',
      required: false,
      config: {
        type: 'relation',
        relationType: 'manyToMany',
        targetModel: 'category',
        displayField: 'name',
        cascade: 'restrict'
      }
    };

    const result = buildJunctionTable('Post', field, baseConfig);

    expect(result.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'created_at', type: 'DateTime' })
      ])
    );
  });
});
const relationField = (
  key: string,
  relationType: 'oneToOne' | 'manyToOne' | 'oneToMany' | 'manyToMany',
  targetModel: string
): FieldDefinitionType => ({
  key,
  label: key,
  type: 'relation',
  required: false,
  config: {
    type: 'relation',
    relationType,
    targetModel,
    displayField: 'name',
    cascade: 'restrict'
  }
});

describe('relationScalarColumn', () => {
  it('returns the owning scalar column for manyToOne', () => {
    expect(relationScalarColumn(relationField('author', 'manyToOne', 'user'))).toBe('author_id');
  });

  it('returns the owning scalar column for oneToOne', () => {
    expect(relationScalarColumn(relationField('profile', 'oneToOne', 'profile'))).toBe('profile_id');
  });

  it('returns null for oneToMany, which owns no scalar column', () => {
    expect(relationScalarColumn(relationField('posts', 'oneToMany', 'post'))).toBeNull();
  });

  it('returns null for manyToMany, which owns no scalar column', () => {
    expect(relationScalarColumn(relationField('categories', 'manyToMany', 'category'))).toBeNull();
  });

  it('returns null for non-relation fields', () => {
    const field: FieldDefinitionType = {
      key: 'title',
      label: 'Title',
      type: 'text',
      required: true,
      translatable: false
    };

    expect(relationScalarColumn(field)).toBeNull();
  });
});

describe('relationScalarNeedsIndex', () => {
  it('marks the manyToOne scalar column as needing an index', () => {
    expect(relationScalarNeedsIndex(relationField('author', 'manyToOne', 'user'))).toBe(true);
  });

  it('does not mark oneToOne, whose @unique already indexes the column', () => {
    expect(relationScalarNeedsIndex(relationField('profile', 'oneToOne', 'profile'))).toBe(false);
  });

  it('does not mark list sides', () => {
    expect(relationScalarNeedsIndex(relationField('posts', 'oneToMany', 'post'))).toBe(false);
    expect(relationScalarNeedsIndex(relationField('categories', 'manyToMany', 'category'))).toBe(false);
  });
});

describe('relationIndexColumns', () => {
  it('collects owning scalar columns in field order', () => {
    const fields: FieldDefinitionType[] = [
      relationField('author', 'manyToOne', 'user'),
      relationField('categories', 'manyToMany', 'category'),
      relationField('section', 'manyToOne', 'section'),
      relationField('posts', 'oneToMany', 'post'),
      relationField('profile', 'oneToOne', 'profile')
    ];

    expect(relationIndexColumns(fields)).toEqual(['author_id', 'section_id']);
  });

  it('returns nothing for a model without owning relations', () => {
    expect(relationIndexColumns([relationField('posts', 'oneToMany', 'post')])).toEqual([]);
  });
});

describe('mapFieldToPrisma - relation scalar columns', () => {
  it('produces the manyToOne scalar column without @unique', () => {
    const result = mapFieldToPrisma(relationField('author', 'manyToOne', 'user'), baseConfig);

    expect(result).toEqual([
      expect.objectContaining({ name: 'author_id', type: 'String', optional: true })
    ]);
    expect(result[0].attributes ?? []).not.toContain('@unique');
  });

  it('produces the oneToOne scalar column with @unique', () => {
    const result = mapFieldToPrisma(relationField('profile', 'oneToOne', 'profile'), baseConfig);

    expect(result).toEqual([
      expect.objectContaining({ name: 'profile_id', type: 'String', attributes: ['@unique'] })
    ]);
  });

  it('produces a list field, not a scalar column, for manyToMany', () => {
    const result = mapFieldToPrisma(relationField('categories', 'manyToMany', 'category'), baseConfig);

    expect(result).toEqual([
      expect.objectContaining({ name: 'categories', type: 'Category', list: true })
    ]);
  });
});
