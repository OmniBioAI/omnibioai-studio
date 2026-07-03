declare module '@tmcp/adapter-valibot' {
	import type { GenericSchema } from 'valibot';
	import type { JsonSchemaAdapter } from 'tmcp/adapter';
	import type { toJsonSchema } from '@valibot/to-json-schema';
	/**
	 * Valibot adapter for converting Valibot schemas to JSON Schema format
	 * 
	 */
	export class ValibotJsonSchemaAdapter extends JsonSchemaAdapter<GenericSchema> {
		constructor();
		/**
		 * Converts a Valibot schema to JSON Schema format
		 * @param schema - The Valibot schema to convert
		 * @returns - The converted JSON Schema
		 */
		toJsonSchema(schema: GenericSchema): Promise<ReturnType<typeof toJsonSchema>>;
	}

	export {};
}

//# sourceMappingURL=index.d.ts.map