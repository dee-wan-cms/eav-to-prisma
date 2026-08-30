// tests/core/schema-builder.test.ts

import { describe, it, expect } from "vitest";
import { SchemaBuilderConfig, buildModel } from "../../src/core/schema-builder";
import {
  ModelConfigType,
  FieldDefinitionType,
} from "../../src/field-config-schema";

const relationField = (
  key: string,
  relationType: "oneToOne" | "manyToOne" | "oneToMany" | "manyToMany",
  targetModel: string
): FieldDefinitionType => ({
  key,
  label: key,
  type: "relation",
  required: false,
  config: {
    type: "relation",
    relationType,
    targetModel,
    displayField: "name",
    cascade: "restrict",
  },
});


// FIXED: Changed from snake_case to PascalCase
const baseConfig: SchemaBuilderConfig = {
  convention: "PascalCase",
  i18nEnabled: false,
  i18nTableNaming: "${identifier}_translation",
};

describe("buildModel - Basic Models", () => {
  it("builds simple model with non-translatable fields only", () => {
    const model: ModelConfigType = {
      slug: "category",
      name: "Category",
      fields: [
        {
          key: "name",
          label: "Name",
          type: "text",
          required: true,
          translatable: false,
        },
        {
          key: "slug",
          label: "Slug",
          type: "text",
          required: true,
          translatable: false,
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    expect(result).toHaveLength(1); // Only main model, no translation table
    expect(result[0].name).toBe("Category");
    expect(result[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "id", type: "String" }),
        expect.objectContaining({
          name: "name",
          type: "String",
          optional: false,
        }),
        expect.objectContaining({
          name: "slug",
          type: "String",
          optional: false,
        }),
        expect.objectContaining({ name: "created_at", type: "DateTime" }),
        expect.objectContaining({ name: "updated_at", type: "DateTime" }),
      ])
    );
  });

  it("builds model with translatable fields and i18n enabled", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Blog Post",
      fields: [
        {
          key: "slug",
          label: "Slug",
          type: "text",
          required: true,
          translatable: false,
        },
        {
          key: "title",
          label: "Title",
          type: "text",
          required: true,
          translatable: true,
        },
        {
          key: "content",
          label: "Content",
          type: "rich",
          required: true,
          translatable: true,
        },
      ],
    };

    const config: SchemaBuilderConfig = {
      ...baseConfig,
      i18nEnabled: true,
    };

    const result = buildModel(model, config);

    expect(result).toHaveLength(2); // Main model + translation table

    // Main model should have non-translatable fields + relation to translations
    const mainModel = result[0];
    expect(mainModel.name).toBe("Post");
    expect(mainModel.fields.find((f) => f.name === "slug")).toBeDefined();
    expect(
      mainModel.fields.find((f) => f.name === "translations")
    ).toMatchObject({
      name: "translations",
      type: "PostTranslation",
      list: true,
      optional: true,
    });

    // Translation model should have translatable fields
    const translationModel = result[1];
    expect(translationModel.name).toBe("PostTranslation");
    expect(translationModel.map).toBe("post_translation");
    expect(
      translationModel.fields.find((f) => f.name === "title")
    ).toBeDefined();
    expect(
      translationModel.fields.find((f) => f.name === "content")
    ).toBeDefined();
    expect(
      translationModel.fields.find((f) => f.name === "lang")
    ).toBeDefined();
    expect(translationModel.unique).toContainEqual(["post_id", "lang"]);
  });
});

describe("buildModel - Media Fields", () => {
  it("builds model with single media field as FK", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "featured_image",
          label: "Featured Image",
          type: "media",
          required: false,
          translatable: false,
          config: {
            type: "media",
            multiple: false,
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "featured_image_id",
          type: "String",
          optional: true,
        }),
      ])
    );
  });

  it("builds model with multiple media as relation", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "gallery",
          label: "Gallery",
          type: "media",
          required: false,
          translatable: false,
          config: {
            type: "media",
            multiple: true,
          },
        },
      ],
    };

    const config: SchemaBuilderConfig = {
      convention: "PascalCase",
      i18nEnabled: false,
      i18nTableNaming: "",
      externalModelNames: new Set(["Media"]),
    };

    const result = buildModel(model, config);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "gallery",
          type: "Media",
          list: true,
          optional: true,
        }),
      ])
    );
  });
});

describe("buildModel - Relation Fields", () => {
  it("builds oneToOne relation as FK with @unique", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "seo",
          label: "SEO",
          type: "relation",
          required: false,
          translatable: false,
          config: {
            type: "relation",
            relationType: "oneToOne",
            targetModel: "seo",
            displayField: "title",
            cascade: "cascade",
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "seo_id",
          type: "String",
          optional: true,
          attributes: expect.arrayContaining(["@unique"]),
        }),
      ])
    );
  });

  it("builds manyToOne relation as FK without @unique", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "author",
          label: "Author",
          type: "relation",
          required: true,
          translatable: false,
          config: {
            type: "relation",
            relationType: "manyToOne",
            targetModel: "user",
            displayField: "name",
            cascade: "restrict",
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "author_id",
          type: "String",
          optional: false,
        }),
      ])
    );
    // Should NOT have @unique
    const authorIdField = mainModel.fields.find((f) => f.name === "author_id");
    // FIXED: Added fallback to empty array
    expect(authorIdField?.attributes || []).not.toContain("@unique");
  });

  it("builds oneToMany relation as implicit relation (no FK)", () => {
    const model: ModelConfigType = {
      slug: "user",
      name: "User",
      fields: [
        {
          key: "posts",
          label: "Posts",
          type: "relation",
          required: false,
          translatable: false,
          config: {
            type: "relation",
            relationType: "oneToMany",
            targetModel: "post",
            displayField: "title",
            cascade: "cascade",
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "posts",
          type: "Post", // FIXED: PascalCase because baseConfig uses PascalCase
          list: true,
          optional: true,
        }),
      ])
    );
    // Should NOT have posts_id field
    expect(mainModel.fields.find((f) => f.name === "posts_id")).toBeUndefined();
  });

  it("builds manyToMany relation as list relation", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "categories",
          label: "Categories",
          type: "relation",
          required: false,
          translatable: false,
          config: {
            type: "relation",
            relationType: "manyToMany",
            targetModel: "category",
            displayField: "name",
            cascade: "restrict",
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "categories",
          type: "Category", // FIXED: PascalCase
          list: true,
          optional: true,
        }),
      ])
    );
  });
});

describe("buildModel - Component Fields", () => {
  it("builds non-repeatable component as oneToOne relation", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "seo",
          label: "SEO",
          type: "component",
          required: false,
          translatable: false,
          config: {
            type: "component",
            slug: "seo",
            repeatable: false,
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "seo",
          type: "PostSeo",  // FIXED: Component becomes PostSeo table
          optional: true,
        }),
      ])
    );
  });

  it("builds repeatable component as oneToMany relation", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "blocks",
          label: "Content Blocks",
          type: "component",
          required: false,
          translatable: false,
          config: {
            type: "component",
            slug: "content-block",
            repeatable: true,
          },
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "blocks",
          type: "PostBlock",  // FIXED: Component becomes PostBlock table (singular)
          list: true,
          optional: true,
        }),
      ])
    );
  });
});

describe("buildModel - Indexes", () => {
  it("adds index for sortField if specified", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "order",
          label: "Order",
          type: "number",
          required: false,
          translatable: false,
        },
      ],
      settings: {
        sortField: "order",
      },
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.indexes).toContainEqual(["order"]);
  });

  it("adds composite index for status + published_at", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "status",
          label: "Status",
          type: "select",
          required: true,
          translatable: false,
          config: {
            type: "select",
            options: ["draft", "published"],
          },
        },
        {
          key: "published_at",
          label: "Published At",
          type: "date",
          required: false,
          translatable: false,
        },
      ],
    };

    const result = buildModel(model, baseConfig);

    const mainModel = result[0];
    expect(mainModel.indexes).toContainEqual(["status", "published_at"]);
  });

  it("indexes the scalar column of a manyToOne relation", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        relationField("author", "manyToOne", "user"),
        relationField("section", "manyToOne", "section"),
      ],
    };

    const result = buildModel(model, baseConfig);

    expect(result[0].indexes).toEqual([["author_id"], ["section_id"]]);
  });

  it("does not index list relations, which own no scalar column", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        relationField("comments", "oneToMany", "comment"),
        relationField("categories", "manyToMany", "category"),
      ],
    };

    const result = buildModel(model, baseConfig);

    expect(result[0].indexes).toEqual([]);
  });

  it("leaves the oneToOne column to its @unique instead of a second index", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [relationField("profile", "oneToOne", "profile")],
    };

    const result = buildModel(model, baseConfig);

    expect(result[0].indexes).toEqual([]);
    expect(result[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "profile_id",
          attributes: ["@unique"],
        }),
      ])
    );
  });

  it("deduplicates a relation index colliding with the sortField", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [relationField("author", "manyToOne", "user")],
      settings: {
        sortField: "author_id",
      },
    };

    const result = buildModel(model, baseConfig);

    expect(result[0].indexes).toEqual([["author_id"]]);
  });

  it("emits sortField, status composite and relation indexes in a stable order", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        relationField("author", "manyToOne", "user"),
        {
          key: "status",
          label: "Status",
          type: "select",
          required: true,
          translatable: false,
          config: {
            type: "select",
            options: ["draft", "published"],
          },
        },
        {
          key: "published_at",
          label: "Published At",
          type: "date",
          required: false,
          translatable: false,
        },
      ],
      settings: {
        sortField: "published_at",
      },
    };

    const first = buildModel(model, baseConfig)[0];
    const second = buildModel(model, baseConfig)[0];

    expect(first.indexes).toEqual([
      ["published_at"],
      ["status", "published_at"],
      ["author_id"],
    ]);
    expect(second.indexes).toEqual(first.indexes);
  });

  it("indexes relation columns with i18n enabled and preserves the translation unique", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "title",
          label: "Title",
          type: "text",
          required: true,
          translatable: true,
        },
        relationField("author", "manyToOne", "user"),
      ],
    };

    const [mainModel, translationModel] = buildModel(model, {
      ...baseConfig,
      i18nEnabled: true,
    });

    expect(mainModel.indexes).toEqual([["author_id"]]);
    expect(translationModel.unique).toEqual([["post_id", "lang"]]);
  });
});

describe("buildModel - Naming Conventions", () => {
  it("uses PascalCase convention", () => {
    const model: ModelConfigType = {
      slug: "blog-post",
      name: "Blog Post",
      fields: [
        {
          key: "title",
          label: "Title",
          type: "text",
          required: true,
          translatable: false,
        },
      ],
    };

    const config: SchemaBuilderConfig = {
      ...baseConfig,
      convention: "PascalCase",
    };

    const result = buildModel(model, config);

    expect(result[0].name).toBe("BlogPost");
  });

  it("adds prefix to model names", () => {
    const model: ModelConfigType = {
      slug: "post",
      name: "Post",
      fields: [
        {
          key: "title",
          label: "Title",
          type: "text",
          required: true,
          translatable: false,
        },
      ],
    };

    const config: SchemaBuilderConfig = {
      ...baseConfig,
      prefix: "Content",
    };

    const result = buildModel(model, config);

    expect(result[0].name).toBe("ContentPost");
  });
});
