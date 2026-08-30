import { z } from 'zod';

/**
 * Simplified schema for Prisma generation
 * Only includes fields relevant to schema generation
 * Uses .passthrough() to allow extra CMS-specific fields
 */

export const RESERVED_FIELD_KEYS = {
	COMPONENT_AB_TESTING: ['variant_id', 'enabled'] as const,
	SYSTEM: ['id', 'created_at', 'updated_at'] as const
} as const;

// `includes` on the `as const` tuples above only accepts their own literals;
// these widened views let a caller's arbitrary string be tested against them.
const SYSTEM_RESERVED_KEYS: readonly string[] = RESERVED_FIELD_KEYS.SYSTEM;
const AB_TESTING_RESERVED_KEYS: readonly string[] = RESERVED_FIELD_KEYS.COMPONENT_AB_TESTING;

export const VALIDATION_PATTERNS = {
	SLUG: /^[a-z][a-z0-9_-]*$/
} as const;

const VALIDATION_MESSAGES = {
	FIELD_KEY: 'Field key must be lowercase alphanumeric with underscores',
	MODEL_SLUG: 'Slug must be lowercase with hyphens',
	UNIQUE_FIELD_KEYS: 'Field keys must be unique',
	RESERVED_FIELD_KEY: 'Field key is reserved by the system',
	RESERVED_AB_FIELD: 'variant_id and enabled are reserved for A/B testing'
} as const;

export const FieldTypeEnum = z.enum([
	'text',
	'rich',
	'json',
	'relation',
	'media',
	'number',
	'boolean',
	'date',
	'select',
	'component'
]);

/**
 * Validation rules - used to generate Zod comments in Prisma schema
 * These map to zod-prisma-types generator annotations
 */
export const FieldValidationSchema = z
	.object({
		// String validations
		minLength: z.number().optional(),
		maxLength: z.number().optional(),
		pattern: z.string().optional(),
		email: z.boolean().optional(),
		url: z.boolean().optional(),
		uuid: z.boolean().optional(),
		cuid: z.boolean().optional(),

		// Number validations
		min: z.number().optional(),
		max: z.number().optional(),
		int: z.boolean().optional(),
		positive: z.boolean().optional(),
		negative: z.boolean().optional(),

		// Array validations
		minItems: z.number().optional(),
		maxItems: z.number().optional(),

		// Date validations
		minDate: z.string().optional(),
		maxDate: z.string().optional(),

		// Custom
		custom: z.string().optional(),
		errorMessage: z.string().optional()
	})
	.passthrough() // Allow extra validation fields
	.optional();

export type FieldValidationType = z.infer<typeof FieldValidationSchema>;

// Type-specific configs (only Prisma-relevant fields)

const TextConfigSchema = z.object({
	multiline: z.boolean().optional(),
	default: z.string().optional()
}).passthrough();

const RichConfigSchema = z.object({
	// No Prisma-relevant config for rich text
}).passthrough();

const NumberConfigSchema = z.object({
	step: z.number().optional(),
	default: z.number().optional(),
	format: z.enum(['integer', 'decimal', 'currency', 'percentage']).optional()
}).passthrough();

const SelectConfigSchema = z.object({
	multiple: z.boolean().default(false).optional(),
	options: z.array(z.union([z.string(), z.object({ value: z.string(), label: z.string() })])).min(1),
	default: z.union([z.string(), z.array(z.string())]).optional()
}).passthrough();

const JsonConfigSchema = z.object({
	// No strict validation needed for Prisma generation
}).passthrough();

const MediaConfigSchema = z.object({
	multiple: z.boolean().default(false)
}).passthrough();

const RelationConfigSchema = z.object({
	relationType: z.enum(['oneToOne', 'oneToMany', 'manyToOne', 'manyToMany']),
	targetModel: z.string(),
	displayField: z.string(),
	cascade: z.enum(['restrict', 'cascade', 'setNull']).default('restrict')
}).passthrough();

const DateConfigSchema = z.object({
	format: z.enum(['date', 'datetime', 'time']).default('date'),
	default: z.string().optional()
}).passthrough();

export const ComponentContextSchema = z.object({
	aiPrompt: z.object({
		template: z.string(),
		autoGenerate: z.boolean().default(false).optional(),
		includeHistory: z.boolean().default(true).optional()
	}).optional(),
	abTesting: z.object({
		enabled: z.boolean().default(false),
		variantCount: z.number().int().min(2).max(5).default(3).optional()
	}).optional()
}).passthrough().optional();

export type ComponentContextType = z.infer<typeof ComponentContextSchema>;

export const ComponentConfigSchema = z.object({
	slug: z.string().min(1).regex(VALIDATION_PATTERNS.SLUG),
	repeatable: z.boolean().default(false),
	context: ComponentContextSchema
}).passthrough();

export type ComponentConfigType = z.infer<typeof ComponentConfigSchema>;

export const FieldConfigSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('text'), ...TextConfigSchema.shape }),
	z.object({ type: z.literal('rich'), ...RichConfigSchema.shape }),
	z.object({ type: z.literal('number'), ...NumberConfigSchema.shape }),
	z.object({ type: z.literal('boolean'), default: z.boolean().optional() }).passthrough(),
	z.object({ type: z.literal('select'), ...SelectConfigSchema.shape }),
	z.object({ type: z.literal('json'), ...JsonConfigSchema.shape }),
	z.object({ type: z.literal('media'), ...MediaConfigSchema.shape }),
	z.object({ type: z.literal('relation'), ...RelationConfigSchema.shape }),
	z.object({ type: z.literal('component'), ...ComponentConfigSchema.shape }),
	z.object({ type: z.literal('date'), ...DateConfigSchema.shape })
]);

export type FieldConfigType = z.infer<typeof FieldConfigSchema>;

/**
 * Minimal field definition - only Prisma-relevant fields
 * Extra fields (ui, description, etc.) are passed through and ignored
 */
export const FieldDefinitionSchema = z
	.object({
		key: z
			.string()
			.min(1)
			.regex(VALIDATION_PATTERNS.SLUG)
			.refine((key) => !SYSTEM_RESERVED_KEYS.includes(key), {
				message: VALIDATION_MESSAGES.RESERVED_FIELD_KEY
			}),
		label: z.string().min(1),
		type: FieldTypeEnum,
		config: FieldConfigSchema.optional(),
		required: z.boolean().default(false),
		translatable: z.boolean().default(true).optional(),
		validation: FieldValidationSchema
	})
	.passthrough(); // Allow extra CMS fields

export type FieldDefinitionType = z.infer<typeof FieldDefinitionSchema>;

/**
 * Minimal model config - only Prisma-relevant fields
 */
const ModelConfigSchemaBase = z
	.object({
		slug: z.string().min(1).regex(VALIDATION_PATTERNS.SLUG),
		name: z.string().min(1),
		fields: z.array(FieldDefinitionSchema).min(1),
		settings: z
			.object({
				enableI18n: z.boolean().optional(), // Affects translation tables
				sortField: z.string().optional() // Affects indexes
			})
			.passthrough()
			.optional()
	})
	.passthrough(); // Allow extra CMS fields (description, permissions, etc.)

export type ModelConfigType = z.infer<typeof ModelConfigSchemaBase>;

export const ModelConfigSchema = ModelConfigSchemaBase.refine(
	(model) => {
		const keys = model.fields.map((f) => f.key);
		return keys.length === new Set(keys).size;
	},
	{ message: VALIDATION_MESSAGES.UNIQUE_FIELD_KEYS }
);

/**
 * Minimal component entity - only Prisma-relevant fields
 */
export const ComponentEntitySchema = z
	.object({
		slug: z.string().min(1).regex(/^[a-z][a-z0-9_-]*$/),
		name: z.string().min(1),
		fields: z.array(FieldDefinitionSchema).min(1)
	})
	.passthrough()
	.refine(
		(component) => {
			const hasReservedABFields = component.fields.some((f) =>
				AB_TESTING_RESERVED_KEYS.includes(f.key)
			);
			return !hasReservedABFields;
		},
		{
			message: VALIDATION_MESSAGES.RESERVED_AB_FIELD,
			path: ['fields']
		}
	);

export type ComponentEntityType = z.infer<typeof ComponentEntitySchema>;

// Validation helpers
export function getValidationErrors(errors: z.ZodError): string[] {
	return errors.issues.map((err) => `${err.path.join('.')}: ${err.message}`);
}

export function isReservedFieldKey(key: string, context: 'component' | 'model' = 'model'): boolean {
	const systemReserved = SYSTEM_RESERVED_KEYS.includes(key);
	const abReserved =
		context === 'component' && AB_TESTING_RESERVED_KEYS.includes(key);

	return systemReserved || abReserved;
}

export function validateFieldKey(
	key: string,
	context: 'component' | 'model' = 'model'
): {
	valid: boolean;
	error?: string;
} {
	if (!VALIDATION_PATTERNS.SLUG.test(key)) {
		return { valid: false, error: VALIDATION_MESSAGES.FIELD_KEY };
	}

	if (isReservedFieldKey(key, context)) {
		return {
			valid: false,
			error:
				context === 'component'
					? VALIDATION_MESSAGES.RESERVED_AB_FIELD
					: VALIDATION_MESSAGES.RESERVED_FIELD_KEY
		};
	}

	return { valid: true };
}