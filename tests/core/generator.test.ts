import { describe, it, expect, vi, beforeEach } from "vitest";
import { Generator } from "../../src/core/generator";
import type { Config } from "../../src/types/config";
import { expectLine } from "../test-helpers";

const createMockPrisma = () => ({
  content_model: {
    findMany: vi.fn(),
  },
  component: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $disconnect: vi.fn(),
});

describe("Generator", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe("constructor", () => {
    it("creates generator with database input", () => {
      const config: Config = {
        connection: "file:./test.db",
        tables: {
          models: "content_model",
        },
        output: {
          schemaPath: "./test.prisma",
        },
      };

      expect(() => new Generator(config, mockPrisma)).not.toThrow();
    });

    it("creates generator with direct input", () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                {
                  key: "title",
                  label: "Title",
                  type: "text",
                  required: true,
                },
              ],
            },
          ],
        },
        output: {
          schemaPath: "./test.prisma",
        },
      };

      expect(() => new Generator(config)).not.toThrow();
    });

    it("throws error when database mode lacks Prisma client", () => {
      const config: Config = {
        connection: "file:./test.db",
        tables: {
          models: "content_model",
        },
      };

      expect(() => new Generator(config)).toThrow(
        /Prisma client is required when reading from database/
      );
    });
  });

  describe("generate - direct input", () => {
    it("generates schema from direct input", async () => {
      const config: Config = {
        input: {
          models: [
            {
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
            },
          ],
        },
        naming: {
          convention: "PascalCase",
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, "model Post {");
      expect(result.schema).toMatch(/title\s+String/);
      expect(result.componentsGenerated).toEqual(["post"]);
      expect(result.warnings).toHaveLength(0);
    });

    it("generates schema with loader function", async () => {
      const config: Config = {
        input: {
          loader: async () => ({
            models: [
              {
                slug: "post",
                name: "Post",
                fields: [
                  {
                    key: "title",
                    label: "Title",
                    type: "text",
                    required: true,
                  },
                ],
              },
            ],
          }),
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, "model Post {");
      expect(result.componentsGenerated).toEqual(["post"]);
    });

    it("applies mapper to transform input", async () => {
      const config: Config = {
        input: {
          models: [
            {
              identifier: "blog-post",
              display_name: "Blog Post",
              schema: [
                {
                  name: "title",
                  title: "Title",
                  field_type: "text",
                  mandatory: true,
                },
              ],
            },
          ],
        },
        mapper: {
          model: (row: any) => ({
            slug: row.identifier,
            name: row.display_name,
            fields: row.schema.map((f: any) => ({
              key: f.name,
              label: f.title,
              type: f.field_type,
              required: f.mandatory,
            })),
          }),
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, "model BlogPost {");
      expect(result.componentsGenerated).toEqual(["blog-post"]);
    });
  });

  describe("datasource configuration", () => {
    it("uses default sqlite datasource", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                { key: "title", label: "Title", type: "text", required: true },
              ],
            },
          ],
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, "datasource db {");
      expect(result.schema).toMatch(/provider\s*=\s*"sqlite"/);
      expect(result.schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    });

    it("uses custom datasource configuration", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                { key: "title", label: "Title", type: "text", required: true },
              ],
            },
          ],
        },
        output: {
          datasource: {
            provider: "postgresql",
            url: 'env("DATABASE_URL")',
            directUrl: 'env("DATABASE_URL_DIRECT")',
          },
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expect(result.schema).toMatch(/provider\s*=\s*"postgresql"/);
      expect(result.schema).toMatch(
        /directUrl\s*=\s*env\("DATABASE_URL_DIRECT"\)/
      );
    });
  });

  describe("warnings", () => {
    it("warns about missing component definitions", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                {
                  key: "hero",
                  label: "Hero",
                  type: "component",
                  required: false,
                  config: {
                    type: "component",
                    slug: "hero",
                    repeatable: false,
                  },
                },
              ],
            },
          ],
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Component "hero" not found');
    });

    it("warns about derived fields being skipped", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                {
                  key: "title",
                  label: "Title",
                  type: "text",
                  required: true,
                },
                {
                  key: "computed",
                  label: "Computed",
                  type: "text",
                  required: false,
                  derived: true,
                },
              ],
            },
          ],
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expect(result.warnings).toContain(
        'Skipped derived field "computed" in model "post"'
      );
    });
  });

  describe("generators", () => {
    it("includes default Prisma client generator", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                { key: "title", label: "Title", type: "text", required: true },
              ],
            },
          ],
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, "generator client {");
      expectLine(result.schema, 'provider = "prisma-client-js"');
    });

    it("includes custom generators", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                { key: "title", label: "Title", type: "text", required: true },
              ],
            },
          ],
        },
        generators: [
          {
            name: "zod",
            provider: "zod-prisma-types",
          },
        ],
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, "generator zod {");
      expectLine(result.schema, 'provider = "zod-prisma-types"');
    });

    it("includes preview features in client generator", async () => {
      const config: Config = {
        input: {
          models: [
            {
              slug: "post",
              name: "Post",
              fields: [
                { key: "title", label: "Title", type: "text", required: true },
              ],
            },
          ],
        },
        output: {
          client: {
            previewFeatures: ["metrics", "driverAdapters"],
          },
        },
      };

      const generator = new Generator(config);
      const result = await generator.generate();

      expectLine(result.schema, 
        'previewFeatures = ["metrics", "driverAdapters"]'
      );
    });
  });
});