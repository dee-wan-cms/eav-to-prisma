// src/utils/prisma-ast.ts

import type { FieldValidationType } from '../field-config-schema';

/**
 * Minimal AST for Prisma schema generation
 */

export interface PrismaSchema {
  datasource: PrismaDatasource;
  generators: PrismaGenerator[];
  models: PrismaModel[];
}

export interface PrismaDatasource {
  provider: 'sqlite' | 'postgresql' | 'mysql';
  url: string;
  directUrl?: string;
}

export interface PrismaGenerator {
  name: string;
  provider: string;
  output?: string;
  config?: Record<string, unknown>;
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  indexes?: string[][];
  unique?: string[][];
  map?: string; // @@map("table_name")
}

export interface PrismaField {
  name: string;
  type: string;
  optional?: boolean;
  list?: boolean;
  default?: string | number | boolean;
  attributes?: string[]; // @id, @default(cuid()), etc
  relation?: {
    name?: string;
    fields?: string[];
    references?: string[];
    onDelete?: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
    onUpdate?: 'Cascade' | 'SetNull' | 'Restrict' | 'NoAction';
  };
  map?: string; // @map("field_name")
  validation?: FieldValidationType; // For Zod comment generation
}