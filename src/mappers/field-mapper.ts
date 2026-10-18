import type { PrismaField } from "../utils/prisma-ast";
import { toPascalCase, toCamelCase } from "../utils/naming";
import type { FieldDefinitionType } from "../field-config-schema";

export interface FieldMapperConfig {
  convention: "snake_case" | "camelCase" | "PascalCase";
  externalModelNames?: Set<string>;
}

/**
 * Map EAV field definition to Prisma field(s)
 */
export function mapFieldToPrisma(
  field: FieldDefinitionType,
  config: FieldMapperConfig
): PrismaField[] {
  switch (field.type) {
    case "text":
      return [mapTextField(field)];
    case "rich":
      return [mapRichTextField(field)];
    case "number":
      return [mapNumberField(field)];
    case "boolean":
      return [mapBooleanField(field)];
    case "date":
      return [mapDateField(field)];
    case "select":
      return [mapSelectField(field)];
    case "point":
    case "json":
      return [mapJsonField(field)];
    case "media":
      return mapMediaField(field, config);
    case "relation":
      return mapRelationField(field, config);
    case "component":
      return mapComponentField(field, config);
    default:
      throw new Error(`Unknown field type: ${field.type}`);
  }
}

function mapTextField(field: FieldDefinitionType): PrismaField {
  return {
    name: field.key,
    type: "String",
    optional: !field.required,
    validation: field.validation,
  };
}

function mapRichTextField(field: FieldDefinitionType): PrismaField {
  return {
    name: field.key,
    type: "String",
    optional: !field.required,
    validation: field.validation,
  };
}

function mapNumberField(field: FieldDefinitionType): PrismaField {
  const config = field.config;
  let type = "Float";

  if (config?.type === "number" && config.format === "integer") {
    type = "Int";
  }

  return {
    name: field.key,
    type,
    optional: !field.required,
    default: config?.type === "number" ? config.default : undefined,
    validation: field.validation,
  };
}

function mapBooleanField(field: FieldDefinitionType): PrismaField {
  const config = field.config;

  return {
    name: field.key,
    type: "Boolean",
    optional: !field.required,
    default: config?.type === "boolean" ? config.default : undefined,
    validation: field.validation,
  };
}

function mapDateField(field: FieldDefinitionType): PrismaField {
  return {
    name: field.key,
    type: field.config?.type === "date" && field.config.withTimezone === true ? "String" : "DateTime",
    optional: !field.required,
    validation: field.validation,
  };
}

function mapSelectField(field: FieldDefinitionType): PrismaField {
  const config = field.config;

  if (config?.type === "select" && config.multiple) {
    return {
      name: field.key,
      type: "String",
      optional: !field.required,
      validation: field.validation,
    };
  }

  return {
    name: field.key,
    type: "String",
    optional: !field.required,
    validation: field.validation,
  };
}

function mapJsonField(field: FieldDefinitionType): PrismaField {
  return {
    name: field.key,
    type: "String",
    optional: !field.required,
    validation: field.validation,
  };
}

function mapMediaField(
  field: FieldDefinitionType,
  config: FieldMapperConfig
): PrismaField[] {
  const fieldConfig = field.config;
  const externalModels = config.externalModelNames || new Set();
  const hasMediaModel = externalModels.has("Media");

  if (fieldConfig?.type === "media" && fieldConfig.multiple) {
    if (hasMediaModel) {
      return [
        {
          name: field.key,
          type: "Media",
          list: true,
          optional: true,
        },
      ];
    }
  }

  if (hasMediaModel) {
    return [
      {
        name: `${field.key}_id`,
        type: "String",
        optional: !field.required,
      },
    ];
  }

  return [
    {
      name: `${field.key}_id`,
      type: "String",
      optional: !field.required,
    },
  ];
}

function mapRelationField(
  field: FieldDefinitionType,
  config: FieldMapperConfig
): PrismaField[] {
  if (field.config?.type !== "relation") {
    throw new Error("Invalid relation field");
  }

  const relationConfig = field.config;
  const targetModel = toModelName(relationConfig.targetModel, config);

  switch (relationConfig.relationType) {
    case "oneToOne":
      return [
        {
          name: `${field.key}_id`,
          type: "String",
          optional: !field.required,
          attributes: ["@unique"],
        },
      ];

    case "manyToOne":
      return [
        {
          name: `${field.key}_id`,
          type: "String",
          optional: !field.required,
        },
      ];

    case "oneToMany":
      return [
        {
          name: field.key,
          type: targetModel,
          list: true,
          optional: true,
        },
      ];

    case "manyToMany":
      return [
        {
          name: field.key,
          type: targetModel,
          list: true,
          optional: true,
        },
      ];

    default:
      throw new Error(`Unknown relation type: ${relationConfig.relationType}`);
  }
}

function mapComponentField(
  field: FieldDefinitionType,
  config: FieldMapperConfig
): PrismaField[] {
  if (field.config?.type !== "component") {
    throw new Error("Invalid component field");
  }

  const componentConfig = field.config;
  const componentModel = toModelName(componentConfig.slug, config);

  if (componentConfig.repeatable) {
    return [
      {
        name: field.key,
        type: componentModel,
        list: true,
        optional: true,
      },
    ];
  } else {
    return [
      {
        name: field.key,
        type: componentModel,
        optional: !field.required,
      },
    ];
  }
}

function toModelName(slug: string, config: FieldMapperConfig): string {
  switch (config.convention) {
    case "PascalCase":
      return toPascalCase(slug);
    case "camelCase":
      return toCamelCase(slug);
    case "snake_case":
      return slug.replace(/-/g, "_");
    default:
      return toPascalCase(slug);
  }
}
