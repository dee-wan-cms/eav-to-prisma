import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EAVReader } from '../../src/core/reader';

const createMockPrisma = () => ({
  content_model: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  $disconnect: vi.fn(),
});

describe('EAVReader', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let reader: EAVReader;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    reader = new EAVReader(mockPrisma, 'content_model');
  });

  describe('readModels', () => {
    it('reads and validates models from database', async () => {
      const mockRows = [
        {
          id: '1',
          slug: 'post',
          definition: JSON.stringify({
            slug: 'post',
            name: 'Post',
            fields: [
              {
                key: 'title',
                label: 'Title',
                type: 'text',
                required: true,
                translatable: false
              }
            ]
          })
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      const result = await reader.readModels();

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('post');
      expect(result[0].name).toBe('Post');
      expect(result[0].fields).toHaveLength(1);
    });

    it('returns empty array when no models found', async () => {
      mockPrisma.content_model.findMany.mockResolvedValue([]);

      const result = await reader.readModels();

      expect(result).toEqual([]);
    });

    it('throws error on invalid JSON', async () => {
      const mockRows = [
        {
          id: '1',
          slug: 'post',
          definition: 'invalid json {'
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      await expect(reader.readModels()).rejects.toThrow(
        /Invalid JSON in model "post"/
      );
    });

    it('throws error on validation failure', async () => {
      const mockRows = [
        {
          id: '1',
          slug: 'post',
          definition: JSON.stringify({
            slug: 'post',
            name: 'Post',
            fields: [] // Invalid - requires at least 1 field
          })
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      await expect(reader.readModels()).rejects.toThrow(
        /Validation failed for model "post"/
      );
    });

    it('validates field keys are unique', async () => {
      const mockRows = [
        {
          id: '1',
          slug: 'post',
          definition: JSON.stringify({
            slug: 'post',
            name: 'Post',
            fields: [
              {
                key: 'title',
                label: 'Title',
                type: 'text',
                required: true
              },
              {
                key: 'title', // Duplicate key
                label: 'Title 2',
                type: 'text',
                required: false
              }
            ]
          })
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      await expect(reader.readModels()).rejects.toThrow(
        /Field keys must be unique/
      );
    });

    it('allows extra fields with passthrough', async () => {
      const mockRows = [
        {
          id: '1',
          slug: 'post',
          definition: JSON.stringify({
            slug: 'post',
            name: 'Post',
            description: 'This is ignored',
            permissions: ['read', 'write'],
            ui: { icon: 'post' },
            fields: [
              {
                key: 'title',
                label: 'Title',
                type: 'text',
                required: true,
                ui: { width: '100%' }, // Extra field
                description: 'Post title' // Extra field
              }
            ]
          })
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      const result = await reader.readModels();

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('post');
    });
  });

  describe('readModel', () => {
    it('reads single model by slug', async () => {
      const mockRow = {
        id: '1',
        slug: 'post',
        definition: JSON.stringify({
          slug: 'post',
          name: 'Post',
          fields: [
            {
              key: 'title',
              label: 'Title',
              type: 'text',
              required: true
            }
          ]
        })
      };

      mockPrisma.content_model.findFirst.mockResolvedValue(mockRow);

      const result = await reader.readModel('post');

      expect(result).not.toBeNull();
      expect(result?.slug).toBe('post');
    });

    it('returns null when model not found', async () => {
      mockPrisma.content_model.findFirst.mockResolvedValue(null);

      const result = await reader.readModel('nonexistent');

      expect(result).toBeNull();
    });

    it('throws error on invalid JSON for single model', async () => {
      const mockRow = {
        id: '1',
        slug: 'post',
        definition: 'invalid json'
      };

      mockPrisma.content_model.findFirst.mockResolvedValue(mockRow);

      await expect(reader.readModel('post')).rejects.toThrow(
        /Invalid JSON in model "post"/
      );
    });
  });

  describe('custom mapper', () => {
    it('uses custom mapper to transform rows', async () => {
      const mapper = (row: any) => ({
        slug: row.identifier,
        name: row.display_name,
        fields: row.schema
      });

      const customReader = new EAVReader(
        mockPrisma,
        'content_model',
        mapper
      );

      const mockRows = [
        {
          identifier: 'post',
          display_name: 'Blog Post',
          schema: [
            {
              key: 'title',
              label: 'Title',
              type: 'text',
              required: true
            }
          ]
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      const result = await customReader.readModels();

      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('post');
      expect(result[0].name).toBe('Blog Post');
    });

    it('supports async mapper functions', async () => {
      const asyncMapper = async (row: any, prisma: any) => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 1));
        return {
          slug: row.slug,
          name: row.name,
          fields: row.fields
        };
      };

      const customReader = new EAVReader(
        mockPrisma,
        'content_model',
        asyncMapper
      );

      const mockRows = [
        {
          slug: 'post',
          name: 'Post',
          fields: [
            {
              key: 'title',
              label: 'Title',
              type: 'text',
              required: true
            }
          ]
        }
      ];

      mockPrisma.content_model.findMany.mockResolvedValue(mockRows);

      const result = await customReader.readModels();

      expect(result).toHaveLength(1);
    });
  });

  describe('disconnect', () => {
    it('disconnects from database', async () => {
      await reader.disconnect();

      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });
});