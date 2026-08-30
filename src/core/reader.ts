// src/core/reader.ts

import { ModelConfigSchema,  getValidationErrors } from '../field-config-schema';
import type { ModelConfigType } from '../field-config-schema';
import { getModelDelegate } from '../types/prisma-client';
import type { EAVDatabaseRow, EAVPrismaClient } from '../types/prisma-client';
import { ZodError } from 'zod';

export type { EAVDatabaseRow } from '../types/prisma-client';

export type MapperFunction = (row: EAVDatabaseRow, prisma?: EAVPrismaClient) => unknown;

/**
 * Read EAV model definitions from database
 */
export class EAVReader {
  constructor(
    private prisma: EAVPrismaClient,
    private tableName: string = 'content_model',
    private mapper?: MapperFunction
  ) {}

  /**
   * Read all models from database and validate
   */
  async readModels(): Promise<ModelConfigType[]> {
    try {
      // Query database for model definitions
      const rows: EAVDatabaseRow[] = await getModelDelegate(this.prisma, this.tableName).findMany();

      if (rows.length === 0) {
        return [];
      }

      // Parse and validate each model
      const models: ModelConfigType[] = [];

      for (const row of rows) {
        try {
          // Transform row using mapper or default
          const transformed = this.mapper 
            ? await this.mapper(row, this.prisma)
            : this.defaultMapper(row);

          // Validate with Zod
          const validated = ModelConfigSchema.parse(transformed);

          models.push(validated);
        } catch (error) {
          if (error instanceof SyntaxError) {
            throw new Error(
              `Invalid JSON in model "${row.slug}" (id: ${row.id}): ${error.message}`
            );
          }

          if (error instanceof ZodError) {
            const errors = getValidationErrors(error);
            throw new Error(
              `Validation failed for model "${row.slug}" (id: ${row.id}):\n${errors.join('\n')}`
            );
          }

          throw error;
        }
      }

      return models;
    } catch (error) {
      if (error instanceof Error && error.message.includes('validation')) {
        throw error; // Re-throw validation errors as-is
      }

      throw new Error(`Failed to read models from database: ${(error as Error).message}`);
    }
  }

  /**
   * Read a single model by slug
   */
  async readModel(slug: string): Promise<ModelConfigType | null> {
    try {
      const row: EAVDatabaseRow | null = await getModelDelegate(
        this.prisma,
        this.tableName
      ).findFirst({ where: { slug } });

      if (!row) {
        return null;
      }

      // Transform row using mapper or default
      const transformed = this.mapper 
        ? await this.mapper(row, this.prisma)
        : this.defaultMapper(row);

      // Validate with Zod
      const validated = ModelConfigSchema.parse(transformed);

      return validated;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in model "${slug}": ${error.message}`);
      }

      if (error instanceof ZodError) {
        const errors = getValidationErrors(error);
        throw new Error(`Validation failed for model "${slug}":\n${errors.join('\n')}`);
      }

      throw error;
    }
  }

  /**
   * Default mapper - expects JSON in 'definition' column
   */
  private defaultMapper(row: EAVDatabaseRow): unknown {
    return JSON.parse(row.definition);
  }

  /**
   * Disconnect database connection
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}