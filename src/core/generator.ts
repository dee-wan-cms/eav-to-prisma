import { EAVReader } from "./reader";
import { buildModel, type SchemaBuilderConfig } from "./schema-builder";
import { writeSchema } from "./schema-writer";
import {
  buildComponentTable,
  buildComponentTranslationTable,
} from "../mappers/component-mapper";
import {
  needsJunctionTable,
  buildJunctionTable,
} from "../mappers/relation-mapper";
import { extractModelsFromPrismaFile } from "../utils/prisma-parser";
import type { Config } from "../types/config";
import type { EAVPrismaClient } from "../types/prisma-client";
import type {
  PrismaSchema,
  PrismaModel,
  PrismaGenerator,
} from "../utils/prisma-ast";
import type {
  ComponentEntityType,
  ModelConfigType,
} from "../field-config-schema";
import fs from "fs/promises";
import path from "path";

export interface GenerateResult {
  schema: string;
  componentsGenerated: string[];
  warnings: string[];
}

/**
 * Main generator class - orchestrates the entire generation process
 */
export class Generator {
  private reader: EAVReader | null = null;
  private warnings: string[] = [];
  private prismaClient: EAVPrismaClient | null;
  private externalModelNames: Set<string> = new Set();

  constructor(
    private config: Config,
    prismaClient?: EAVPrismaClient
  ) {
    if (config.input) {
      this.prismaClient = null;
    } else {
      if (!prismaClient) {
        throw new Error("Prisma client is required when reading from database");
      }
      this.prismaClient = prismaClient;
      this.reader = new EAVReader(prismaClient, config.tables!.models);
    }
  }

  /**
   * Generate Prisma schema from EAV database or direct input
   */
  async generate(): Promise<GenerateResult> {
    this.warnings = [];

    const externalModels = this.loadExternalModels();
    this.externalModelNames = new Set(externalModels.map((m) => m.name));

    let models = await this.readModelsFromSource();

    if (this.config.mapper?.model) {
      models = models.map((m) => this.config.mapper!.model!(m));
    }

    const components = await this.readComponents();

    const schemaBuilderConfig: SchemaBuilderConfig = {
      convention: this.config.naming?.convention || "PascalCase",
      prefix: this.config.naming?.prefix,
      i18nEnabled: this.config.i18n?.enabled || false,
      i18nTableNaming:
        this.config.i18n?.tableNaming || "${identifier}_translation",
      externalModelNames: this.externalModelNames,
    };

    const prismaModels: PrismaModel[] = [];
    const junctionTables = new Set<string>();

    for (const model of models) {
      const fieldsWithoutDerived = model.fields.filter((field) => {
        if (field.derived) {
          this.warnings.push(
            `Skipped derived field "${field.key}" in model "${model.slug}"`
          );
          return false;
        }
        return true;
      });

      const modelWithoutDerived = {
        ...model,
        fields: fieldsWithoutDerived,
      };

      const generated = buildModel(modelWithoutDerived, schemaBuilderConfig);
      prismaModels.push(...generated);

      // buildModel always emits the owning model first; the component and
      // junction tables below are named after it.
      const rootModel = generated[0];
      if (!rootModel) {
        throw new Error(`No Prisma model was built for "${model.slug}"`);
      }

      for (const field of model.fields) {
        if (
          field.type === "component" &&
          field.config?.type === "component"
        ) {
          const componentConfig = field.config;
          const component = components.get(componentConfig.slug);

          if (!component) {
            this.warnings.push(
              `Component "${componentConfig.slug}" not found for field "${field.key}" in model "${model.slug}"`
            );
            continue;
          }

          const componentTable = buildComponentTable(
            rootModel.name,
            field.key,
            component,
            componentConfig.repeatable || false,
            schemaBuilderConfig,
            componentConfig.context
          );

          prismaModels.push(componentTable);

          if (schemaBuilderConfig.i18nEnabled) {
            const translationTable = buildComponentTranslationTable(
              rootModel.name,
              field.key,
              component,
              schemaBuilderConfig
            );

            if (translationTable) {
              prismaModels.push(translationTable);
            }
          }
        }

        if (needsJunctionTable(field)) {
          const junctionTable = buildJunctionTable(
            rootModel.name,
            field,
            schemaBuilderConfig
          );

          if (!junctionTables.has(junctionTable.name)) {
            prismaModels.push(junctionTable);
            junctionTables.add(junctionTable.name);
          }
        }
      }
    }

    const schema: PrismaSchema = {
      datasource: {
        provider: this.config.output?.datasource?.provider || "sqlite",
        url: this.config.output?.datasource?.url || 'env("DATABASE_URL")',
        directUrl: this.config.output?.datasource?.directUrl,
      },
      generators: this.buildGenerators(),
      models: [...externalModels, ...prismaModels],
    };

    const schemaString = await writeSchema(schema);

    return {
      schema: schemaString,
      componentsGenerated: models.map((m) => m.slug),
      warnings: this.warnings,
    };
  }

  /**
   * Load external Prisma models from files
   */
  private loadExternalModels(): PrismaModel[] {
    if (!this.config.externalModels) {
      return [];
    }

    const models: PrismaModel[] = [];
    const paths = this.resolveExternalPaths();

    for (const filePath of paths) {
      try {
        const extractedModels = extractModelsFromPrismaFile(filePath);

        const filtered = this.filterExternalModels(extractedModels);

        models.push(...filtered);
      } catch (error) {
        this.warnings.push(
          `Failed to load external models from "${filePath}": ${(error as Error).message}`
        );
      }
    }

    return models;
  }

  /**
   * Resolve external model file paths
   */
  private resolveExternalPaths(): string[] {
    const { externalModels } = this.config;
    if (!externalModels) return [];

    if (typeof externalModels === "string") {
      return [externalModels];
    }

    if (Array.isArray(externalModels)) {
      return externalModels;
    }

    return Array.isArray(externalModels.path)
      ? externalModels.path
      : [externalModels.path];
  }

  /**
   * Filter external models by include/exclude lists
   */
  private filterExternalModels(models: PrismaModel[]): PrismaModel[] {
    const { externalModels } = this.config;

    if (typeof externalModels === "string" || Array.isArray(externalModels)) {
      return models;
    }

    if (externalModels?.include) {
      const includeSet = new Set(externalModels.include);
      models = models.filter((m) => includeSet.has(m.name));
    }

    if (externalModels?.exclude) {
      const excludeSet = new Set(externalModels.exclude);
      models = models.filter((m) => !excludeSet.has(m.name));
    }

    return models;
  }

  /**
   * Read models from configured source (direct input or database)
   */
  private async readModelsFromSource(): Promise<ModelConfigType[]> {
    if (this.config.input && "models" in this.config.input) {
      return this.config.input.models;
    }

    if (this.config.input && "loader" in this.config.input) {
      const result = await this.config.input.loader();
      return result.models;
    }

    if (!this.reader) {
      throw new Error(
        "No reader available - provide either input or Prisma client"
      );
    }
    return await this.reader.readModels();
  }

  /**
   * Read component definitions from database or input
   */
  private async readComponents(): Promise<Map<string, ComponentEntityType>> {
    const map = new Map<string, ComponentEntityType>();

    if (
      this.config.input &&
      "components" in this.config.input &&
      this.config.input.components
    ) {
      let components = this.config.input.components;

      if (this.config.mapper?.component) {
        components = components.map((c) => this.config.mapper!.component!(c));
      }

      for (const comp of components) {
        map.set(comp.slug, comp);
      }
      return map;
    }

    if (this.config.input && "loader" in this.config.input) {
      const result = await this.config.input.loader();
      if (result.components) {
        let components = result.components;

        if (this.config.mapper?.component) {
          components = components.map((c) => this.config.mapper!.component!(c));
        }

        for (const comp of components) {
          map.set(comp.slug, comp);
        }
      }
      return map;
    }

    if (!this.config.tables?.components) {
      return map;
    }

    // Reachable when `input` supplies models but `tables.components` still names
    // a component table: there is no client to read it from. Previously this
    // surfaced as a caught TypeError with the same warning shape.
    if (!this.prismaClient) {
      this.warnings.push(
        "Failed to read components: no Prisma client was provided"
      );
      return map;
    }

    try {
      const componentReader = new EAVReader(
        this.prismaClient,
        this.config.tables.components
      );

      let components = await componentReader.readModels();

      if (this.config.mapper?.component) {
        components = components.map((c) => this.config.mapper!.component!(c));
      }

      for (const comp of components) {
        map.set(comp.slug, comp);
      }
    } catch (error) {
      this.warnings.push(
        `Failed to read components: ${(error as Error).message}`
      );
    }

    return map;
  }

  /**
   * Generate schema and write to file
   */
  async write(): Promise<void> {
    const result = await this.generate();

    const outputPath =
      this.config.output?.schemaPath || "./prisma/schema.prisma";

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(outputPath, result.schema, "utf-8");
  }

  /**
   * Build generator configurations
   */
  private buildGenerators() {
    const generators = [];

    const clientGenerator: PrismaGenerator = {
      name: "client",
      provider: "prisma-client-js",
      output: this.config.output?.clientPath,
    };

    if (this.config.output?.client?.previewFeatures) {
      clientGenerator.config = {
        previewFeatures: this.config.output.client.previewFeatures,
      };
    }

    generators.push(clientGenerator);

    if (this.config.generators) {
      generators.push(...this.config.generators);
    }

    return generators;
  }
}