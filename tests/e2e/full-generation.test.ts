// tests/e2e/full-generation.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../src/types/config";
import { Generator } from "../../src/core/generator";
import { expectLine } from "../test-helpers";

const mockPrismaClient = {
  content_model: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  component: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $disconnect: vi.fn(),
};

const config: Config = {
  connection: "file:./test.db",
  tables: {
    models: "content_model",
    components: "component",
  },
  output: {
    schemaPath: "./test/schema.prisma",
  },
  i18n: {
    enabled: true,
    defaultLang: "en",
    tableNaming: "${identifier}_translation",
  },
  naming: {
    convention: "PascalCase",
  },
};

describe("Full Schema Generation E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates complete schema with models, components, relations, and media", async () => {
    // Mock database data
    const models = [
      {
        id: "1",
        slug: "post",
        definition: JSON.stringify({
          slug: "post",
          name: "Blog Post",
          fields: [
            // Basic fields
            {
              key: "title",
              label: "Title",
              type: "text",
              required: true,
              translatable: true,
            },
            {
              key: "slug",
              label: "Slug",
              type: "text",
              required: true,
              translatable: false,
            },
            {
              key: "content",
              label: "Content",
              type: "rich",
              required: true,
              translatable: true,
            },
            // Media field
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
            // Component field
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
            // Many-to-one relation
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
            // Many-to-many relation
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
          settings: {
            enableI18n: true,
            sortField: "created_at",
          },
        }),
      },
      {
        id: "2",
        slug: "category",
        definition: JSON.stringify({
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
          ],
        }),
      },
      {
        id: "3",
        slug: "user",
        definition: JSON.stringify({
          slug: "user",
          name: "User",
          fields: [
            {
              key: "name",
              label: "Name",
              type: "text",
              required: true,
              translatable: false,
            },
            {
              key: "email",
              label: "Email",
              type: "text",
              required: true,
              translatable: false,
            },
          ],
        }),
      },
    ];

    const components = [
      {
        id: "c1",
        slug: "seo",
        definition: JSON.stringify({
          slug: "seo",
          name: "SEO",
          fields: [
            {
              key: "meta_title",
              label: "Meta Title",
              type: "text",
              required: false,
              translatable: true,
            },
            {
              key: "meta_description",
              label: "Meta Description",
              type: "text",
              required: false,
              translatable: true,
            },
          ],
        }),
      },
    ];

    mockPrismaClient.content_model.findMany.mockResolvedValue(models);
    mockPrismaClient.component.findMany.mockResolvedValue(components);

    const generator = new Generator(config, mockPrismaClient);
    const result = await generator.generate();

    // Verify datasource
    expectLine(result.schema, "datasource db {");
    expectLine(result.schema, 'provider = "sqlite"');

    // Verify generator
    expectLine(result.schema, "generator client {");
    expectLine(result.schema, 'provider = "prisma-client-js"');

    // Verify Post model
    expectLine(result.schema, "model Post {");
    expectLine(result.schema, "slug");
    expectLine(result.schema, "featured_image_id");
    expectLine(result.schema, "author_id");

    // Verify PostTranslation model
    expectLine(result.schema, "model PostTranslation {");
    expectLine(result.schema, "title");
    expectLine(result.schema, "content");

    // Verify PostSeo component table
    expectLine(result.schema, "model PostSeo {");
    expectLine(result.schema, "post_id");

    // Verify PostSeoTranslation (component with translatable fields)
    expectLine(result.schema, "model PostSeoTranslation {");
    expectLine(result.schema, "meta_title");
    expectLine(result.schema, "meta_description");

    // Verify PostCategory junction table
    expectLine(result.schema, "model PostCategory {");
    expectLine(result.schema, "post_id");
    expectLine(result.schema, "category_id");

    // Verify Category model
    expectLine(result.schema, "model Category {");

    // Verify User model
    expectLine(result.schema, "model User {");

    // Verify indexes
    expectLine(result.schema, "@@index([created_at])");

    // No warnings for this valid structure
    expect(result.warnings).toHaveLength(0);
  });

  it("handles models without components gracefully", async () => {
    const models = [
      {
        id: "1",
        slug: "simple",
        definition: JSON.stringify({
          slug: "simple",
          name: "Simple",
          fields: [
            {
              key: "name",
              label: "Name",
              type: "text",
              required: true,
              translatable: false,
            },
          ],
        }),
      },
    ];

    mockPrismaClient.content_model.findMany.mockResolvedValue(models);
    // No components
    mockPrismaClient.component.findMany.mockResolvedValue([]);

    const generator = new Generator(config, mockPrismaClient);
    const result = await generator.generate();

    expectLine(result.schema, "model Simple {");
    expect(result.warnings).toHaveLength(0);
  });

  it("warns about missing component definitions", async () => {
    const models = [
      {
        id: "1",
        slug: "post",
        definition: JSON.stringify({
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
            {
              key: "hero",
              label: "Hero",
              type: "component",
              required: false,
              translatable: false,
              config: {
                type: "component",
                slug: "hero", // This component doesn't exist
                repeatable: false,
              },
            },
          ],
        }),
      },
    ];

    mockPrismaClient.content_model.findMany.mockResolvedValue(models);
    mockPrismaClient.component.findMany.mockResolvedValue([]);

    const generator = new Generator(config, mockPrismaClient);
    const result = await generator.generate();

    // Check that warning exists - exact format comes from generator.ts line 108
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Component "hero" not found');
    expect(result.warnings[0]).toContain('field "hero"');
    expect(result.warnings[0]).toContain('model "post"');
  });
});

describe("Full Schema Generation E2E - relation indexes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const modelBlock = (schema: string, name: string): string[] => {
    const lines = schema.split("\n");
    const start = lines.findIndex((line) => line.trim() === `model ${name} {`);

    if (start === -1) {
      throw new Error(`Model "${name}" not found in schema:\n${schema}`);
    }

    const end = lines.findIndex((line, i) => i > start && line.trim() === "}");

    return lines
      .slice(start + 1, end)
      .map((line) => line.trim().replace(/\s+/g, " "))
      .filter((line) => line.length > 0);
  };

  it("indexes only owning scalar relation columns across every relation type", async () => {
    const models = [
      {
        id: "1",
        slug: "article",
        definition: JSON.stringify({
          slug: "article",
          name: "Article",
          fields: [
            {
              key: "title",
              label: "Title",
              type: "text",
              required: false,
              translatable: true,
            },
            {
              key: "author",
              label: "Author",
              type: "relation",
              required: false,
              config: {
                type: "relation",
                relationType: "manyToOne",
                targetModel: "user",
                displayField: "name",
                cascade: "restrict",
              },
            },
            {
              key: "section",
              label: "Section",
              type: "relation",
              required: false,
              config: {
                type: "relation",
                relationType: "manyToOne",
                targetModel: "section",
                displayField: "name",
                cascade: "restrict",
              },
            },
            {
              key: "profile",
              label: "Profile",
              type: "relation",
              required: false,
              config: {
                type: "relation",
                relationType: "oneToOne",
                targetModel: "profile",
                displayField: "name",
                cascade: "cascade",
              },
            },
            {
              key: "comments",
              label: "Comments",
              type: "relation",
              required: false,
              config: {
                type: "relation",
                relationType: "oneToMany",
                targetModel: "comment",
                displayField: "body",
                cascade: "cascade",
              },
            },
            {
              key: "tags",
              label: "Tags",
              type: "relation",
              required: false,
              config: {
                type: "relation",
                relationType: "manyToMany",
                targetModel: "tag",
                displayField: "name",
                cascade: "restrict",
              },
            },
          ],
          settings: {
            sortField: "author_id",
          },
        }),
      },
    ];

    mockPrismaClient.content_model.findMany.mockResolvedValue(models);
    mockPrismaClient.component.findMany.mockResolvedValue([]);

    const generator = new Generator(config, mockPrismaClient);
    const result = await generator.generate();

    expect(result.schema.match(/^model .+ \{$/gm)).toEqual([
      "model Article {",
      "model ArticleTranslation {",
      "model ArticleTag {",
    ]);

    expect(modelBlock(result.schema, "Article")).toEqual([
      "id String @id @default(cuid())",
      "author_id String?",
      "section_id String?",
      "profile_id String? @unique",
      "comments Comment[]",
      "tags Tag[]",
      "created_at DateTime @default(now())",
      "updated_at DateTime @updatedAt",
      "translations ArticleTranslation[]",
      "@@index([author_id])",
      "@@index([section_id])",
    ]);

    expect(modelBlock(result.schema, "ArticleTranslation")).toEqual([
      "id String @id @default(cuid())",
      "article_id String",
      "lang String",
      "title String?",
      "article Article @relation(fields: [article_id], references: [id], onDelete: Cascade)",
      "@@unique([article_id, lang])",
      '@@map("article_translation")',
    ]);

    expect(modelBlock(result.schema, "ArticleTag")).toEqual([
      "id String @id @default(cuid())",
      "article_id String",
      "tag_id String",
      "order Int?",
      "created_at DateTime @default(now())",
      "article Article @relation(fields: [article_id], references: [id], onDelete: Restrict)",
      "tag Tag @relation(fields: [tag_id], references: [id], onDelete: Cascade)",
      "@@index([article_id])",
      "@@index([tag_id])",
      "@@unique([article_id, tag_id])",
    ]);

    expect(result.warnings).toHaveLength(0);
  });
});
