import { t as instructions_default } from "./instructions-Cl0vcW2j.js";
import { McpServer } from "tmcp";
import { ValibotJsonSchemaAdapter } from "@tmcp/adapter-valibot";
import { HttpTransport } from "@tmcp/transport-http";
import * as v from "valibot";

//#region package.json
var name = "@storybook/mcp";
var version = "0.7.0";
var description = "MCP server that serves knowledge about your components based on your Storybook stories and documentation";

//#endregion
//#region src/types.ts
const JSDocTag = v.record(v.string(), v.array(v.string()));
const Error$1 = v.object({
	name: v.string(),
	message: v.string()
});
const BaseManifest = v.object({
	name: v.string(),
	description: v.optional(v.string()),
	jsDocTags: v.optional(JSDocTag),
	error: v.optional(Error$1)
});
const Story = v.object({
	...BaseManifest.entries,
	id: v.optional(v.string()),
	snippet: v.optional(v.string()),
	summary: v.optional(v.string())
});
/**
* A docs entry represents MDX documentation that can be attached to a component
* or standalone (unattached).
*/
const Doc = v.object({
	id: v.string(),
	name: v.string(),
	title: v.string(),
	path: v.string(),
	content: v.string(),
	summary: v.optional(v.string()),
	error: v.optional(Error$1)
});
const BaseComponentProperties = v.object({
	...BaseManifest.entries,
	path: v.string(),
	summary: v.optional(v.string()),
	import: v.optional(v.string()),
	reactDocgen: v.optional(v.any()),
	reactDocgenTypescript: v.optional(v.any()),
	reactComponentMeta: v.optional(v.any())
});
const SubcomponentManifest = v.object({ ...BaseComponentProperties.entries });
const ComponentManifest = v.object({
	...BaseComponentProperties.entries,
	id: v.string(),
	stories: v.optional(v.array(Story)),
	subcomponents: v.optional(v.record(v.string(), SubcomponentManifest)),
	docs: v.optional(v.record(v.string(), Doc))
});
const ComponentManifestMap = v.object({
	v: v.number(),
	components: v.record(v.string(), ComponentManifest)
});
/**
* Manifest for unattached/standalone documentation entries.
* Served at /manifests/docs.json
*/
const DocsManifestMap = v.object({
	v: v.number(),
	docs: v.record(v.string(), Doc)
});
/**
* Shared Valibot field for the storybookId input, used in multi-source mode.
* Reused across tools that support source selection.
*/
const StorybookIdField = { storybookId: v.pipe(v.string(), v.description("The Storybook source ID (e.g., \"local\", \"tetra\"). Required when multiple Storybooks are composed. See list-all-documentation for available sources.")) };

//#endregion
//#region src/utils/get-manifest.ts
/**
* The paths to the manifest files relative to the Storybook build
*/
const COMPONENT_MANIFEST_PATH = "./manifests/components.json";
const DOCS_MANIFEST_PATH = "./manifests/docs.json";
/**
* Error thrown when getting or parsing a manifest fails
*/
var ManifestGetError = class extends Error {
	url;
	cause;
	constructor(message, url, cause) {
		super(message);
		this.name = "ManifestGetError";
		this.url = url ?? "No source URL provided";
		this.cause = cause;
	}
};
/**
* Converts an error to MCP-compatible content format
*
* @param error - The error to convert (can be any type)
* @returns A tool result with error content and isError flag
*/
const errorToMCPContent = (error) => {
	let fullMessage = `${error instanceof ManifestGetError ? "Error getting manifest" : "Unexpected error"}: ${error instanceof Error ? error.message : String(error)}`;
	if (error instanceof ManifestGetError && error.cause) {
		const causeMessage = error.cause instanceof Error ? error.cause.message : String(error.cause);
		fullMessage += `\nCaused by: ${causeMessage}`;
	}
	return {
		content: [{
			type: "text",
			text: fullMessage
		}],
		isError: true
	};
};
/**
* Parses a JSON string and validates it against a Valibot schema
*/
function parseManifest({ jsonString, schema, name, url }) {
	try {
		return v.parse(v.pipe(v.string(), v.parseJson(), schema), jsonString);
	} catch (error) {
		throw new ManifestGetError(`Failed to parse ${name} manifest:
${error instanceof v.ValiError ? error.issues.map((i) => i.message).join("\n") : String(error)}`, url);
	}
}
/**
* Gets component and docs manifest from a request or using a custom provider
*
* @param request - The HTTP request to get the manifest for (optional when using custom manifestProvider)
* @param manifestProvider - Optional custom function to get the manifest
* @param source - Optional source for multi-source mode
* @returns A promise that resolves to the parsed ComponentManifestMap
* @throws {ManifestGetError} If getting the manifest fails or the response is invalid
*/
async function getManifests(request, manifestProvider, source) {
	const provider = manifestProvider ?? defaultManifestProvider;
	const [componentResult, docsResult] = await Promise.allSettled([provider(request, COMPONENT_MANIFEST_PATH, source), provider(request, DOCS_MANIFEST_PATH, source)]);
	const getUrl = (path) => request ? getManifestUrlFromRequest(request, path) : "Unknown manifest source";
	if (componentResult.status === "rejected") {
		const reason = componentResult.reason;
		const hint = reason instanceof ManifestGetError && reason.message.includes("404") ? `\nHint: The Storybook at this URL may not have the component manifest enabled. Add \`features: { componentsManifest: true }\` (or \`features: { experimentalComponentsManifest: true }\` for older Storybook versions) to its main.ts config.` : "";
		throw new ManifestGetError(`Failed to get component manifest: ${reason instanceof Error ? reason.message : String(reason)}${hint}`, getUrl(COMPONENT_MANIFEST_PATH), reason instanceof Error ? reason : void 0);
	}
	const componentManifest = parseManifest({
		jsonString: componentResult.value,
		schema: ComponentManifestMap,
		name: "component",
		url: getUrl(COMPONENT_MANIFEST_PATH)
	});
	if (Object.keys(componentManifest.components).length === 0) throw new ManifestGetError(`No components found in the manifest`, getUrl(COMPONENT_MANIFEST_PATH));
	if (docsResult.status === "rejected") return { componentManifest };
	return {
		componentManifest,
		docsManifest: parseManifest({
			jsonString: docsResult.value,
			schema: DocsManifestMap,
			name: "docs",
			url: getUrl(DOCS_MANIFEST_PATH)
		})
	};
}
/**
* Constructs the manifest URL from a request by replacing /mcp with the provided path
*/
function getManifestUrlFromRequest(request, path) {
	const url = new URL(request.url);
	const normalizedPath = path.replace(/^\.\//, "");
	url.pathname = url.pathname.replace(/\/mcp\/?$/, `/${normalizedPath}`);
	return url.toString();
}
/**
* Default manifest provider that fetches from the same origin as the request,
* replacing /mcp with the provided path
*/
async function defaultManifestProvider(request, path) {
	if (!request) throw new ManifestGetError("Request is required when using the default manifest provider. You must either pass the original request forward to the server context, or set a custom manifestProvider that doesn't need the request.");
	const manifestUrl = getManifestUrlFromRequest(request, path);
	const response = await fetch(manifestUrl);
	if (!response.ok) throw new ManifestGetError(`Failed to fetch manifest: ${response.status} ${response.statusText}`, manifestUrl);
	const contentType = response.headers.get("content-type");
	if (!contentType?.includes("application/json")) throw new ManifestGetError(`Invalid content type: expected application/json, got ${contentType}`, manifestUrl);
	return response.text();
}
/**
* Gets manifests from multiple sources.
* Returns an array of source manifests, each containing the source info and its manifests.
* Failures for individual sources are captured as errors rather than failing the entire request.
*
* @param sources - Array of source configurations
* @param request - The HTTP request (used for local source)
* @param manifestProvider - Function to fetch manifests, receives source as third parameter
* @returns Promise resolving to array of source manifests
* @throws {ManifestGetError} If no sources could be fetched successfully
*/
async function getMultiSourceManifests(sources, request, manifestProvider) {
	const results = await Promise.all(sources.map(async (source) => {
		try {
			const manifests = await getManifests(request, manifestProvider, source);
			return {
				source,
				componentManifest: manifests.componentManifest,
				docsManifest: manifests.docsManifest
			};
		} catch (error) {
			return {
				source,
				componentManifest: {
					v: 1,
					components: {}
				},
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}));
	if (results.filter((r) => !r.error).length === 0) throw new ManifestGetError(`Failed to fetch manifests from any source. Errors:\n${results.map((r) => `- ${r.source.title}: ${r.error}`).join("\n")}`);
	return results;
}

//#endregion
//#region src/utils/parse-react-docgen.ts
function serializeTsType(tsType) {
	if (!tsType) return void 0;
	if ("raw" in tsType && typeof tsType.raw === "string" && tsType.raw.trim().length > 0) return tsType.raw;
	if (!tsType.name) return void 0;
	if ("elements" in tsType) {
		const serializeElements = () => (tsType.elements ?? []).map((el) => serializeTsType(el) ?? "unknown");
		switch (tsType.name) {
			case "union": return serializeElements().join(" | ");
			case "intersection": return serializeElements().join(" & ");
			case "Array": return `${serializeTsType((tsType.elements ?? [])[0]) ?? "unknown"}[]`;
			case "tuple": return `[${serializeElements().join(", ")}]`;
		}
	}
	if ("value" in tsType && tsType.name === "literal") return tsType.value;
	if ("signature" in tsType && tsType.name === "signature") {
		if (tsType.type === "function") {
			const args = (tsType.signature?.arguments ?? []).map((a) => {
				const argType = serializeTsType(a.type) ?? "any";
				return `${a.name}: ${argType}`;
			});
			const ret = serializeTsType(tsType.signature?.return) ?? "void";
			return `(${args.join(", ")}) => ${ret}`;
		}
		if (tsType.type === "object") return `{ ${(tsType.signature?.properties ?? []).map((p) => {
			const req = Boolean(p.value?.required);
			const propType = serializeTsType(p.value) ?? "any";
			return `${p.key}${req ? "" : "?"}: ${propType}`;
		}).join("; ")} }`;
		return "unknown";
	}
	if ("elements" in tsType) {
		const inner = (tsType.elements ?? []).map((el) => serializeTsType(el) ?? "unknown");
		if (inner.length > 0) return `${tsType.name}<${inner.join(", ")}>`;
	}
	return tsType.name;
}
const parseReactDocgen = (reactDocgen) => {
	const props = reactDocgen?.props ?? {};
	return { props: Object.fromEntries(Object.entries(props).map(([propName, prop]) => [propName, {
		description: prop.description,
		type: serializeTsType(prop.tsType ?? prop.type),
		defaultValue: prop.defaultValue?.value,
		required: prop.required
	}])) };
};
/**
* Parse react-docgen-typescript output into the same simplified ParsedDocgen format.
* RDT uses flat type strings (prop.type.name / prop.type.raw) instead of react-docgen's
* nested tsType structure, so no serialization is needed.
*/
const parseComponentDocLike = (componentDoc) => {
	const props = componentDoc.props ?? {};
	return { props: Object.fromEntries(Object.entries(props).map(([propName, prop]) => [propName, {
		description: prop.description || void 0,
		type: prop.type?.raw ?? prop.type?.name,
		defaultValue: prop.defaultValue?.value,
		required: prop.required
	}])) };
};
const parseReactDocgenTypescript = (reactDocgenTypescript) => parseComponentDocLike(reactDocgenTypescript);
const parseReactComponentMeta = (reactComponentMeta) => parseComponentDocLike(reactComponentMeta);

//#endregion
//#region src/utils/dedent.ts
/**
* Copied from https://github.com/tamino-martinius/node-ts-dedent/blob/18c4736c79806d7fe78bdaaaf5ae307b79f9574a/src/index.ts
*
* Rationale for vendoring instead of using the ts-dedent package:
* 1. The package has a broken ESM distribution - the IDE auto-imports as
*    `import dedent from 'ts-dedent'` but that breaks at runtime, requiring
*    manual changes to named imports. See:
*    - https://github.com/tamino-martinius/node-ts-dedent/issues/42
*    - https://github.com/tamino-martinius/node-ts-dedent/pull/41
* 2. Keeps bundle size smaller for such a simple utility (avoid "is-even" syndrome)
*/
function dedent(templ, ...values) {
	let strings = Array.from(typeof templ === "string" ? [templ] : templ);
	strings[strings.length - 1] = strings.at(-1).replace(/\r?\n([\t ]*)$/, "");
	const indentLengths = strings.reduce((arr, str) => {
		const matches = str.match(/\n([\t ]+|(?!\s).)/g);
		if (matches) return arr.concat(matches.map((match) => match.match(/[\t ]/g)?.length ?? 0));
		return arr;
	}, []);
	if (indentLengths.length) {
		const pattern = new RegExp(`\n[\t ]{${Math.min(...indentLengths)}}`, "g");
		strings = strings.map((str) => str.replace(pattern, "\n"));
	}
	strings[0] = strings[0].replace(/^\r?\n/, "");
	let string = strings[0];
	values.forEach((value, i) => {
		const endentations = string.match(/(?:^|\n)( *)$/);
		const endentation = endentations ? endentations[1] : "";
		let indentedValue = value;
		if (typeof value === "string" && value.includes("\n")) indentedValue = String(value).split("\n").map((str, i) => {
			return i === 0 ? str : `${endentation}${str}`;
		}).join("\n");
		string += `${String(indentedValue)}${strings[i + 1]}`;
	});
	return string;
}

//#endregion
//#region src/utils/manifest-formatter/extract-docs-summary.ts
/**
* Maximum length for a summary before truncation.
*/
const MAX_SUMMARY_LENGTH = 90;
/**
* Extracts a summary from MDX content.
* The summary is created by:
* 1. Removing import statements
* 2. Removing JSX/MDX expressions
* 3. Extracting only text content from JSX/HTML elements
* 4. Truncating to MAX_SUMMARY_LENGTH characters if needed
*
* @param content - The MDX content string
* @returns A summary string, or undefined if no meaningful text content is found
*/
function extractDocsSummary(content) {
	let result = content;
	result = result.replace(/^\s*import\s+(?:[\s\S]*?from\s+)?['"][^'"]+['"];?\s*$/gm, "");
	let prevResult = "";
	while (prevResult !== result) {
		prevResult = result;
		result = result.replace(/\{[^{}]*\}/g, "");
	}
	result = result.replace(/<[^>]+\/>/g, "");
	prevResult = "";
	while (prevResult !== result) {
		prevResult = result;
		result = result.replace(/<(\w+)[^>]*>([\s\S]*?)<\/\1>/g, "$2");
	}
	result = result.replace(/<[^>]+>/g, "");
	result = result.replace(/\s+/g, " ").trim();
	if (!result) return;
	if (result.length > MAX_SUMMARY_LENGTH) return `${result.slice(0, MAX_SUMMARY_LENGTH)}...`;
	return result;
}

//#endregion
//#region src/utils/manifest-formatter/markdown.ts
/**
* Maximum number of stories to show in full detail in component manifests.
* Remaining stories will be shown as names only.
*/
const MAX_STORIES_TO_SHOW = 3;
function formatComponentLine(component) {
	const summary = component.summary ?? (component.description ? component.description.length > MAX_SUMMARY_LENGTH ? `${component.description.slice(0, MAX_SUMMARY_LENGTH)}...` : component.description : void 0);
	if (summary) return `- ${component.name} (${component.id}): ${summary}`;
	return `- ${component.name} (${component.id})`;
}
function formatDocLine(doc) {
	const summary = doc.summary ?? extractDocsSummary(doc.content);
	return `- ${doc.title} (${doc.id})${summary ? `: ${summary}` : ""}`;
}
function formatStorySubLine(story) {
	return `  - ${story.name}` + (story.id ? ` (${story.id})` : "");
}
/**
* Extracts a summary from an object with optional summary and description fields.
* Prefers summary if available, otherwise truncates description to maxLength.
*/
function extractSummary(item, maxLength = MAX_SUMMARY_LENGTH) {
	if (item.summary) return item.summary;
	if (item.description) return item.description.length > maxLength ? `${item.description.slice(0, maxLength)}...` : item.description;
}
/**
* Extract parsed docgen from a component manifest, preferring reactDocgen over
* reactDocgenTypescript over reactComponentMeta.
*/
function getParsedDocgen(componentManifest) {
	if (componentManifest.reactDocgen) return parseReactDocgen(componentManifest.reactDocgen);
	if (componentManifest.reactDocgenTypescript) return parseReactDocgenTypescript(componentManifest.reactDocgenTypescript);
	if (componentManifest.reactComponentMeta) return parseReactComponentMeta(componentManifest.reactComponentMeta);
}
/**
* Formats a story's content (description + code snippet) into markdown.
* Reusable helper for both formatComponentManifest and formatStoryDocumentation.
*/
function formatStoryContent(story, importStatement) {
	const parts = [];
	if (story.description) {
		parts.push(story.description);
		parts.push("");
	}
	parts.push("```");
	if (importStatement) {
		parts.push(importStatement);
		parts.push("");
	}
	parts.push(story.snippet ?? "");
	parts.push("```");
	return parts;
}
function formatPropsSection(parsedDocgen, options = {}) {
	const propEntries = parsedDocgen ? Object.entries(parsedDocgen.props) : [];
	if (propEntries.length === 0) return [];
	const title = options.title ?? "## Props";
	const typeName = options.typeName ?? "Props";
	const parts = [];
	parts.push(title);
	parts.push("");
	parts.push("```");
	parts.push(`export type ${typeName} = {`);
	for (const [propName, propInfo] of propEntries) {
		const type = propInfo.type ?? "any";
		const isRequired = propInfo.required ?? true;
		const hasDefault = propInfo.defaultValue !== void 0;
		if (propInfo.description !== void 0) {
			parts.push("  /**");
			parts.push(`    ${propInfo.description}`);
			parts.push("  */");
		}
		let propLine = `  ${propName}`;
		if (!isRequired) propLine += "?";
		propLine += `: ${type}`;
		if (hasDefault) propLine += ` = ${propInfo.defaultValue}`;
		propLine += ";";
		parts.push(propLine);
	}
	parts.push("}");
	parts.push("```");
	parts.push("");
	return parts;
}
function formatSubcomponentsSection(subcomponents) {
	if (!subcomponents || Object.keys(subcomponents).length === 0) return [];
	const parts = [];
	parts.push("## Subcomponents");
	parts.push("");
	for (const [key, subcomponent] of Object.entries(subcomponents)) {
		parts.push(`### ${subcomponent.name || key}`);
		parts.push("");
		if (subcomponent.summary) {
			parts.push(subcomponent.summary);
			parts.push("");
		}
		if (subcomponent.description) {
			parts.push(subcomponent.description);
			parts.push("");
		}
		if (subcomponent.import) {
			parts.push("```");
			parts.push(subcomponent.import);
			parts.push("```");
			parts.push("");
		}
		if (subcomponent.error) {
			parts.push(`Error: ${subcomponent.error.name}`);
			parts.push("");
			parts.push("```");
			parts.push(subcomponent.error.message);
			parts.push("```");
			parts.push("");
			continue;
		}
		const parsedDocgen = getParsedDocgen(subcomponent);
		const typeName = `${(subcomponent.name || key).replace(/\W+/g, "")}Props`;
		parts.push(...formatPropsSection(parsedDocgen, {
			title: "#### Props",
			typeName
		}));
	}
	return parts;
}
/**
* Format a single component manifest into markdown.
*/
function formatComponentManifest(componentManifest) {
	const parts = [];
	parts.push(`# ${componentManifest.name}`);
	parts.push("");
	parts.push(`ID: ${componentManifest.id}`);
	parts.push("");
	if (componentManifest.description) {
		parts.push(componentManifest.description);
		parts.push("");
	}
	parts.push(...formatSubcomponentsSection(componentManifest.subcomponents));
	const parsedDocgen = getParsedDocgen(componentManifest);
	if (componentManifest.stories && componentManifest.stories.length > 0) {
		parts.push("## Stories");
		parts.push("");
		const storiesWithSnippets = componentManifest.stories.filter((s) => s.snippet);
		const hasProps = parsedDocgen && Object.keys(parsedDocgen.props).length > 0;
		const storiesToShow = hasProps ? storiesWithSnippets.slice(0, MAX_STORIES_TO_SHOW) : storiesWithSnippets;
		const remainingStories = hasProps ? storiesWithSnippets.slice(MAX_STORIES_TO_SHOW) : [];
		for (const story of storiesToShow) {
			parts.push(`### ${story.name}`);
			parts.push("");
			if (story.id) {
				parts.push(`Story ID: ${story.id}`);
				parts.push("");
			}
			parts.push(...formatStoryContent(story, componentManifest.import));
			parts.push("");
		}
		if (remainingStories.length > 0) {
			if (storiesToShow.length > 0) parts.push("### Other Stories");
			parts.push("");
			for (const story of remainingStories) {
				const summary = extractSummary(story);
				const summaryPart = summary ? `: ${summary}` : "";
				const storyLabel = story.id ? `${story.name} (${story.id})` : story.name;
				parts.push(`- ${storyLabel}${summaryPart}`);
			}
			parts.push("");
		}
	}
	parts.push(...formatPropsSection(parsedDocgen));
	if (componentManifest.docs && Object.keys(componentManifest.docs).length > 0) {
		const docsWithContent = Object.values(componentManifest.docs).filter((doc) => doc.content.trim().length > 0);
		if (docsWithContent.length > 0) {
			parts.push("## Docs");
			parts.push("");
			for (const doc of docsWithContent) {
				parts.push(`### ${doc.name}`);
				parts.push("");
				parts.push(doc.content);
				parts.push("");
			}
		}
	}
	return parts.join("\n").trim();
}
/**
* Format a single doc manifest into markdown.
*/
function formatDocsManifest(doc) {
	return dedent`# ${doc.title}

			${doc.content}`;
}
/**
* Format a component manifest map into a markdown list.
* @param manifest - The component manifest map to format
* @returns Formatted string representation of the component list
*/
function formatManifestsToLists(manifests, options = {}) {
	const parts = [];
	parts.push("# Components");
	parts.push("");
	for (const component of Object.values(manifests.componentManifest.components)) {
		parts.push(formatComponentLine(component));
		if (options.withStoryIds) for (const story of component.stories ?? []) parts.push(formatStorySubLine(story));
	}
	parts.push("");
	if (!manifests.docsManifest) return parts.join("\n").trim();
	parts.push("# Docs");
	parts.push("");
	for (const doc of Object.values(manifests.docsManifest.docs)) parts.push(formatDocLine(doc));
	return parts.join("\n").trim();
}
function formatMultiSourceManifestsToLists(manifests, options = {}) {
	const parts = [];
	for (const { source, componentManifest, docsManifest, error } of manifests) {
		parts.push(`# ${source.title}`);
		parts.push(`id: ${source.id}`);
		parts.push("");
		if (error) {
			parts.push(`error: ${error}`);
			parts.push("");
			continue;
		}
		const components = Object.values(componentManifest.components);
		if (components.length > 0) {
			parts.push("## Components");
			parts.push("");
			for (const component of components) {
				parts.push(formatComponentLine(component));
				if (options.withStoryIds) for (const story of component.stories ?? []) parts.push(formatStorySubLine(story));
			}
			parts.push("");
		}
		if (docsManifest && Object.keys(docsManifest.docs).length > 0) {
			parts.push("## Docs");
			parts.push("");
			for (const doc of Object.values(docsManifest.docs)) parts.push(formatDocLine(doc));
			parts.push("");
		}
	}
	return parts.join("\n").trim();
}
/**
* Format a single story's documentation.
*/
function formatStoryDocumentation(componentManifest, storyName) {
	const story = componentManifest.stories?.find((s) => s.name === storyName);
	if (!story || !story.snippet) return "";
	const parts = [];
	parts.push(`# ${componentManifest.name} - ${story.name}`);
	parts.push("");
	parts.push(...formatStoryContent(story, componentManifest.import));
	return parts.join("\n").trim();
}

//#endregion
//#region src/tools/list-all-documentation.ts
const LIST_TOOL_NAME = "list-all-documentation";
const ListAllDocumentationInput = v.object({ withStoryIds: v.optional(v.pipe(v.boolean(), v.description("When true, includes story sub-bullets under each component with story name and story ID. Use this to discover IDs for downstream story-focused workflows without filesystem lookup.")), false) });
async function addListAllDocumentationTool(server, enabled) {
	server.tool({
		name: LIST_TOOL_NAME,
		title: "List All Documentation",
		description: "List all available UI components and documentation entries from the Storybook",
		schema: ListAllDocumentationInput,
		enabled
	}, async (input) => {
		try {
			const ctx = server.ctx.custom;
			const withStoryIds = input.withStoryIds ?? false;
			if (ctx?.sources?.some((s) => s.url)) {
				const multiSourceManifests = await getMultiSourceManifests(ctx.sources, ctx.request, ctx.manifestProvider);
				const lists = formatMultiSourceManifestsToLists(multiSourceManifests, { withStoryIds });
				const firstSuccess = multiSourceManifests.find((m) => !m.error);
				if (firstSuccess) await ctx.onListAllDocumentation?.({
					context: ctx,
					manifests: {
						componentManifest: firstSuccess.componentManifest,
						docsManifest: firstSuccess.docsManifest
					},
					resultText: lists,
					sources: multiSourceManifests
				});
				return { content: [{
					type: "text",
					text: lists
				}] };
			}
			const manifests = await getManifests(ctx?.request, ctx?.manifestProvider);
			const lists = formatManifestsToLists(manifests, { withStoryIds });
			await ctx?.onListAllDocumentation?.({
				context: ctx,
				manifests,
				resultText: lists
			});
			return { content: [{
				type: "text",
				text: lists
			}] };
		} catch (error) {
			return errorToMCPContent(error);
		}
	});
}

//#endregion
//#region src/tools/get-documentation-for-story.ts
const GET_STORY_TOOL_NAME = "get-documentation-for-story";
const BaseInput$1 = {
	componentId: v.string(),
	storyName: v.string()
};
async function addGetStoryDocumentationTool(server, enabled, options) {
	const schema = options?.multiSource ? v.object({
		...BaseInput$1,
		...StorybookIdField
	}) : v.object(BaseInput$1);
	server.tool({
		name: GET_STORY_TOOL_NAME,
		title: "Get Documentation for Story",
		description: "Get detailed documentation for a specific story variant of a UI component. Use this when you need to see more usage examples of a component, via the stories written for it.",
		schema,
		enabled
	}, async (input) => {
		try {
			const ctx = server.ctx.custom;
			const { componentId, storyName, storybookId } = input;
			const sources = ctx?.sources;
			const isMultiSource = sources && sources.some((s) => s.url);
			let source;
			if (isMultiSource) {
				if (!storybookId) return {
					content: [{
						type: "text",
						text: `storybookId is required. Available sources: ${sources.map((s) => s.id).join(", ")}. Use the ${LIST_TOOL_NAME} tool to see available sources.`
					}],
					isError: true
				};
				source = sources.find((s) => s.id === storybookId);
				if (!source) return {
					content: [{
						type: "text",
						text: `Storybook source not found: "${storybookId}". Available sources: ${sources.map((s) => s.id).join(", ")}. Use the ${LIST_TOOL_NAME} tool to see available sources.`
					}],
					isError: true
				};
			}
			const component = (await getManifests(ctx?.request, ctx?.manifestProvider, source)).componentManifest?.components[componentId];
			if (!component) return {
				content: [{
					type: "text",
					text: `Component not found: "${componentId}". Use the list-all-documentation tool to see available components.`
				}],
				isError: true
			};
			if (!component.stories?.find((s) => s.name === storyName)) return {
				content: [{
					type: "text",
					text: `Story "${storyName}" not found for component "${componentId}". Available stories: ${component.stories?.map((s) => s.name).join(", ") ?? "none"}`
				}],
				isError: true
			};
			return { content: [{
				type: "text",
				text: formatStoryDocumentation(component, storyName)
			}] };
		} catch (error) {
			return errorToMCPContent(error);
		}
	});
}

//#endregion
//#region src/tools/get-documentation.ts
const GET_TOOL_NAME = "get-documentation";
const BaseInput = { id: v.pipe(v.string(), v.description("The component or docs entry ID (e.g., \"button\")")) };
async function addGetDocumentationTool(server, enabled, options) {
	const schema = options?.multiSource ? v.object({
		...BaseInput,
		...StorybookIdField
	}) : v.object(BaseInput);
	server.tool({
		name: GET_TOOL_NAME,
		title: "Get Documentation",
		description: `Get documentation for a UI component or docs entry.

Returns the first ${MAX_STORIES_TO_SHOW} stories (including story IDs) with code snippets showing how props are used, plus TypeScript prop definitions. Call this before using a component to avoid hallucinating prop names, types, or valid combinations. Stories reveal real prop usage patterns, interactions, and edge cases that type definitions alone don't show. If the example stories don't show the prop you need, use the ${GET_STORY_TOOL_NAME} tool to fetch the story documentation for the specific story variant you need.

Example: id="button" returns Primary, Secondary, Large stories with code like <Button variant="primary" size="large"> showing actual prop combinations.`,
		schema,
		enabled
	}, async (input) => {
		try {
			const ctx = server.ctx.custom;
			const { id, storybookId } = input;
			const sources = ctx?.sources;
			const isMultiSource = sources && sources.some((s) => s.url);
			let source;
			if (isMultiSource) {
				if (!storybookId) return {
					content: [{
						type: "text",
						text: `storybookId is required. Available sources: ${sources.map((s) => s.id).join(", ")}. Use the ${LIST_TOOL_NAME} tool to see available sources.`
					}],
					isError: true
				};
				source = sources.find((s) => s.id === storybookId);
				if (!source) return {
					content: [{
						type: "text",
						text: `Storybook source not found: "${storybookId}". Available sources: ${sources.map((s) => s.id).join(", ")}. Use the ${LIST_TOOL_NAME} tool to see available sources.`
					}],
					isError: true
				};
			}
			const { componentManifest, docsManifest } = await getManifests(ctx?.request, ctx?.manifestProvider, source);
			const component = componentManifest.components[id];
			const docsEntry = docsManifest?.docs[id];
			if (!component && !docsEntry) {
				const suffix = storybookId ? ` in source "${storybookId}"` : "";
				await ctx?.onGetDocumentation?.({
					context: ctx,
					input
				});
				return {
					content: [{
						type: "text",
						text: `Component or Docs Entry not found: "${id}"${suffix}. Use the ${LIST_TOOL_NAME} tool to see available components and documentation entries.`
					}],
					isError: true
				};
			}
			const documentation = component ?? docsEntry;
			const text = component ? formatComponentManifest(documentation) : formatDocsManifest(documentation);
			await ctx?.onGetDocumentation?.({
				context: ctx,
				input,
				foundDocumentation: documentation,
				resultText: text
			});
			return { content: [{
				type: "text",
				text
			}] };
		} catch (error) {
			return errorToMCPContent(error);
		}
	});
}

//#endregion
//#region src/index.ts
const createStorybookMcpHandler = async (options = {}) => {
	const { onSessionInitialize, ...defaultContext } = options;
	const adapter = new ValibotJsonSchemaAdapter();
	const server = new McpServer({
		name,
		version,
		description
	}, {
		adapter,
		instructions: instructions_default,
		capabilities: { tools: { listChanged: true } }
	}).withContext();
	if (onSessionInitialize) server.on("initialize", onSessionInitialize);
	await addListAllDocumentationTool(server);
	await addGetStoryDocumentationTool(server);
	await addGetDocumentationTool(server);
	const transport = new HttpTransport(server, { path: null });
	return (async (req, context) => {
		return await transport.respond(req, {
			...defaultContext,
			...context,
			request: req
		});
	});
};

//#endregion
export { COMPONENT_MANIFEST_PATH, ComponentManifestMap, DOCS_MANIFEST_PATH, DocsManifestMap, GET_STORY_TOOL_NAME, GET_TOOL_NAME, LIST_TOOL_NAME, instructions_default as STORYBOOK_MCP_INSTRUCTIONS, addGetDocumentationTool, addGetStoryDocumentationTool, addListAllDocumentationTool, createStorybookMcpHandler, getMultiSourceManifests };