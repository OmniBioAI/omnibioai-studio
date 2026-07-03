import { McpServer } from "tmcp";
import { ValibotJsonSchemaAdapter } from "@tmcp/adapter-valibot";
import { HttpTransport } from "@tmcp/transport-http";
import url from "node:url";
import * as v from "valibot";
import { logger } from "storybook/internal/node-logger";
import { telemetry } from "storybook/internal/telemetry";
import { stringify } from "picoquery";
import path from "node:path";
import { normalizeStoryPath } from "storybook/internal/common";
import { storyNameFromExport } from "storybook/internal/csf";
import { ComponentManifestMap, DocsManifestMap, GET_TOOL_NAME, LIST_TOOL_NAME, STORYBOOK_MCP_INSTRUCTIONS, addGetDocumentationTool, addGetStoryDocumentationTool, addListAllDocumentationTool } from "@storybook/mcp";
import fs from "node:fs/promises";
import { buffer } from "node:stream/consumers";

//#region package.json
var name = "@storybook/addon-mcp";
var version = "0.6.0";
var description = "Help agents automatically write and test stories for your UI components";

//#endregion
//#region src/telemetry.ts
async function collectTelemetry({ event, server, ...payload }) {
	try {
		return await telemetry("addon-mcp", {
			event,
			mcpSessionId: server.ctx.sessionId,
			clientInfo: server.ctx.sessionInfo?.clientInfo,
			clientCapabilities: server.ctx.sessionInfo?.clientCapabilities,
			...payload
		});
	} catch (error) {
		logger.debug(`Error collecting telemetry: ${String(error)}`);
	}
}

//#endregion
//#region src/utils/build-args-param.ts
const HEX_REGEXP = /^#([a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i;
const COLOR_REGEXP = /^(rgba?|hsla?)\(([0-9]{1,3}),\s?([0-9]{1,3})%?,\s?([0-9]{1,3})%?,?\s?([0-9](\.[0-9]{1,2})?)?\)$/i;
/**
* Encodes special values for Storybook's args URL format.
* Handles undefined, null, booleans, dates, hex colors, and rgba/hsla colors.
*/
function encodeSpecialValues(value) {
	if (value === void 0) return "!undefined";
	if (value === null) return "!null";
	if (typeof value === "string") {
		if (HEX_REGEXP.test(value)) return `!hex(${value.slice(1)})`;
		if (COLOR_REGEXP.test(value)) return `!${value.replace(/[\s%]/g, "")}`;
		return value;
	}
	if (typeof value === "boolean") return `!${value}`;
	if (value instanceof Date) return `!date(${value.toISOString()})`;
	if (Array.isArray(value)) return value.map(encodeSpecialValues);
	if (typeof value === "object" && value !== null) return Object.entries(value).reduce((acc, [key, val]) => Object.assign(acc, { [key]: encodeSpecialValues(val) }), {});
	return value;
}
/**
* Replaces some url-encoded characters with their decoded equivalents.
* The URI RFC specifies these should be encoded, but all browsers will
* tolerate them being decoded, so we opt to go with it for cleaner looking URIs.
*/
function decodeKnownQueryChar(chr) {
	switch (chr) {
		case "%20": return "+";
		case "%5B": return "[";
		case "%5D": return "]";
		case "%2C": return ",";
		case "%3A": return ":";
	}
	return chr;
}
const KNOWN_QUERY_CHAR_REGEXP = /%[0-9A-F]{2}/g;
/**
* Builds a Storybook args query parameter string from an object of props.
*
* The format uses semicolons as delimiters and colons for key:value pairs,
* with special encoding for booleans, null, undefined, dates, and colors.
*
* Example output: "disabled:!true;label:Hello+World;count:42"
*/
function buildArgsParam(args) {
	if (!args || Object.keys(args).length === 0) return "";
	return stringify(encodeSpecialValues(args), {
		delimiter: ";",
		nesting: true,
		nestingSyntax: "js"
	}).replace(KNOWN_QUERY_CHAR_REGEXP, decodeKnownQueryChar).split(";").map((part) => part.replace("=", ":")).join(";");
}

//#endregion
//#region src/utils/fetch-story-index.ts
/**
* Fetches the Storybook story index from the running Storybook instance.
*
* @param origin - The origin URL of the Storybook instance (e.g., http://localhost:6006)
* @returns A promise that resolves to the StoryIndex
* @throws If the fetch fails or returns invalid data
*/
async function fetchStoryIndex(origin) {
	const indexUrl = `${origin}/index.json`;
	logger.debug(`Fetching story index from: ${indexUrl}`);
	const response = await fetch(indexUrl);
	if (!response.ok) throw new Error(`Failed to fetch story index: ${response.status} ${response.statusText}`);
	const index = await response.json();
	logger.debug(`Story index entries found: ${Object.keys(index.entries).length}`);
	return index;
}

//#endregion
//#region src/utils/slash.ts
/**
* Normalize paths to forward slashes for cross-platform compatibility
* Storybook import paths always use forward slashes
*/
function slash(path) {
	return path.replace(/\\/g, "/");
}

//#endregion
//#region src/utils/find-story-ids.ts
function isStoryIdInput(input) {
	return "storyId" in input;
}
function normalizeImportPath(importPath) {
	return slash(normalizeStoryPath(path.posix.normalize(slash(importPath))));
}
/**
* Finds story IDs in the story index that match the given story inputs.
*
* @param index - The Storybook story index
* @param stories - Array of story inputs to search for
* @returns Array of per-input lookup results in the exact same order as the input stories
*/
function findStoryIds(index, stories) {
	const entriesList = Object.values(index.entries);
	const result = [];
	for (const storyInput of stories) {
		if (isStoryIdInput(storyInput)) {
			const foundEntry = index.entries[storyInput.storyId];
			if (foundEntry) {
				logger.debug(`Found story ID: ${foundEntry.id}`);
				result.push({
					id: foundEntry.id,
					input: storyInput
				});
			} else {
				logger.debug("No story found");
				result.push({
					input: storyInput,
					errorMessage: `No story found for story ID "${storyInput.storyId}"`
				});
			}
			continue;
		}
		const { exportName, explicitStoryName, absoluteStoryPath } = storyInput;
		const normalizedCwd = slash(process.cwd());
		const normalizedAbsolutePath = slash(absoluteStoryPath);
		const relativePath = normalizeImportPath(path.posix.relative(normalizedCwd, normalizedAbsolutePath));
		logger.debug("Searching for:");
		logger.debug({
			exportName,
			explicitStoryName,
			absoluteStoryPath,
			relativePath
		});
		const foundEntry = entriesList.find((entry) => normalizeImportPath(entry.importPath) === relativePath && [explicitStoryName, storyNameFromExport(exportName)].includes(entry.name));
		if (foundEntry) {
			logger.debug(`Found story ID: ${foundEntry.id}`);
			result.push({
				id: foundEntry.id,
				input: storyInput
			});
		} else {
			logger.debug("No story found");
			let errorMessage = `No story found for export name "${exportName}" with absolute file path "${absoluteStoryPath}"`;
			if (!explicitStoryName) errorMessage += ` (did you forget to pass the explicit story name?)`;
			result.push({
				input: storyInput,
				errorMessage
			});
		}
	}
	return result;
}

//#endregion
//#region src/utils/errors.ts
/**
* Converts an error to MCP-compatible content format
*
* @param error - The error to convert (can be any type)
* @returns A tool result with error content and isError flag
*/
const errorToMCPContent = (error) => {
	return {
		content: [{
			type: "text",
			text: `Error: ${error instanceof Error ? error.message : String(error)}`
		}],
		isError: true
	};
};

//#endregion
//#region src/tools/tool-names.ts
/**
* Tool name constants extracted to avoid circular dependencies.
*/
const PREVIEW_STORIES_TOOL_NAME = "preview-stories";
const GET_UI_BUILDING_INSTRUCTIONS_TOOL_NAME = "get-storybook-story-instructions";
const RUN_STORY_TESTS_TOOL_NAME = "run-story-tests";

//#endregion
//#region src/types.ts
const AddonOptions = v.object({ toolsets: v.optional(v.object({
	dev: v.exactOptional(v.boolean(), true),
	docs: v.exactOptional(v.boolean(), true),
	test: v.exactOptional(v.boolean(), true)
}), {
	dev: true,
	docs: true,
	test: true
}) });
const StoryInputProps = {
	props: v.pipe(v.optional(v.record(v.string(), v.any())), v.description(`Optional custom props to pass to the story for rendering. Use this when you don't want to render the default story,
but you want to customize some args or other props.
You can look up the component's documentation using the ${GET_UI_BUILDING_INSTRUCTIONS_TOOL_NAME} tool to see what props are available.`)),
	globals: v.pipe(v.optional(v.record(v.string(), v.any())), v.description(`Optional Storybook globals to set for the story preview. Globals are used for things like theme, locale, viewport, and other cross-cutting concerns.
Common globals include 'theme' (e.g., 'dark', 'light'), 'locale' (e.g., 'en', 'fr'), and 'backgrounds' (e.g., { value: '#000' }).`))
};
/**
* Schema for a single story input when requesting story URLs.
*/
const StoryInput = v.union([v.object({
	exportName: v.pipe(v.string(), v.description(`The export name of the story from the story file.
Use this path-based shape only when you're already editing a .stories.* file and know the export names in that file.
If you do not already have story file context, prefer the storyId shape instead of searching files.`)),
	explicitStoryName: v.pipe(v.optional(v.string()), v.description(`If the story has an explicit name set via the "name" property, that is different from the export name, provide it here.
Otherwise don't set this.`)),
	absoluteStoryPath: v.pipe(v.string(), v.description("Absolute path to the story file. Use together with exportName only when story file context is already available.")),
	...StoryInputProps
}), v.object({
	storyId: v.pipe(v.string(), v.description(`The full Storybook story ID (for example "button--primary").
Prefer this shape whenever you are not already working in a specific story file.
Use IDs discovered from ${LIST_TOOL_NAME} (withStoryIds=true) or ${GET_TOOL_NAME}.`)),
	...StoryInputProps
})]);
/**
* Schema for the array of stories to fetch URLs for.
*/
const StoryInputArray = v.array(StoryInput);

//#endregion
//#region src/tools/preview-stories/preview-stories-app-template.html
var preview_stories_app_template_default = "<!doctype html>\n<html>\n	<head>\n		<meta charset=\"utf-8\" />\n		<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n		<style>\n			* {\n				margin: 0;\n				padding: 0;\n				box-sizing: border-box;\n			}\n			html[data-theme='light'] {\n				color-scheme: light;\n			}\n			html[data-theme='dark'] {\n				color-scheme: dark;\n			}\n			html,\n			body {\n				width: 100%;\n				margin: 0;\n				padding: 0;\n				background-color: var(--color-background-secondary);\n			}\n			body {\n				display: flex;\n				flex-direction: column;\n				gap: 1rem;\n			}\n			:root {\n				/*\n				These are fallback values, if the MCP client doesn't set them.\n				See https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx#theming\n				*/\n				--color-text-primary: light-dark(black, white);\n				--color-border-primary: light-dark(#ccc, #444);\n				--color-background-secondary: light-dark(#f9f9f9, #1e1e1e);\n				--font-sans:\n					-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Oxygen-Sans', Ubuntu, Cantarell,\n					'Helvetica Neue', sans-serif;\n				--font-heading-xs-size: 1rem;\n				--font-heading-xs-line-height: 1.25;\n				--border-width-regular: 1px;\n			}\n			.story-heading {\n				font-family: var(--font-sans);\n				font-size: var(--font-heading-xs-size);\n				line-height: var(--font-heading-xs-line-height);\n				color: var(--color-text-primary);\n				padding: 0.5rem 0;\n			}\n			.story-iframe {\n				background-color: white;\n				border: var(--border-width-regular) solid var(--color-border-primary);\n			}\n			body:has(> article:only-child) h1 {\n				/* if there is only one story rendered, hide its heading */\n				display: none;\n			}\n		</style>\n		<template id=\"preview-template\">\n			<article>\n				<h1 class=\"story-heading\"></h1>\n				<iframe class=\"story-iframe\"></iframe>\n			</article>\n		</template>\n		<script type=\"module\">\n			// APP_SCRIPT_PLACEHOLDER\n		<\/script>\n	</head>\n	<body></body>\n</html>\n";

//#endregion
//#region src/tools/preview-stories.ts
const PREVIEW_STORIES_RESOURCE_URI = `ui://${PREVIEW_STORIES_TOOL_NAME}/preview.html`;
const PreviewStoriesInput = v.object({ stories: v.pipe(StoryInputArray, v.description(`Stories to preview.
Prefer { storyId } when you don't already have story file context, since this avoids filesystem discovery.
Use { storyId } when IDs were discovered from documentation tools.
Use { absoluteStoryPath + exportName } only when you're already working in a specific .stories.* file and already have that context.`)) });
const PreviewStoriesOutput = v.object({ stories: v.array(v.union([v.object({
	title: v.string(),
	name: v.string(),
	previewUrl: v.pipe(v.string(), v.description("Direct URL to open the story preview. Always include this URL in the final user-facing response so users can open it directly."))
}), v.object({
	input: StoryInput,
	error: v.string()
})])) });
async function addPreviewStoriesTool(server) {
	const previewStoryAppScript = await fs.readFile(url.fileURLToPath(import.meta.resolve("@storybook/addon-mcp/internal/preview-stories-app-script")), "utf-8");
	const appHtml = preview_stories_app_template_default.replace("// APP_SCRIPT_PLACEHOLDER", previewStoryAppScript);
	server.resource({
		name: PREVIEW_STORIES_RESOURCE_URI,
		description: "App resource for the Preview Stories tool",
		uri: PREVIEW_STORIES_RESOURCE_URI,
		mimeType: "text/html;profile=mcp-app"
	}, () => {
		const origin = server.ctx.custom.origin;
		return { contents: [{
			uri: PREVIEW_STORIES_RESOURCE_URI,
			mimeType: "text/html;profile=mcp-app",
			text: appHtml,
			_meta: { ui: {
				prefersBorder: false,
				domain: origin,
				csp: {
					connectDomains: [origin],
					resourceDomains: [origin],
					frameDomains: [origin],
					baseUriDomains: [origin]
				}
			} }
		}] };
	});
	server.tool({
		name: PREVIEW_STORIES_TOOL_NAME,
		title: "Get story preview URLs",
		description: `Use this tool to get one or more Storybook preview URLs.
Always include each returned preview URL in your final user-facing response so users can open them directly.`,
		schema: PreviewStoriesInput,
		outputSchema: PreviewStoriesOutput,
		enabled: () => server.ctx.custom?.toolsets?.dev ?? true,
		_meta: { ui: { resourceUri: PREVIEW_STORIES_RESOURCE_URI } }
	}, async (input) => {
		try {
			const { origin, disableTelemetry } = server.ctx.custom ?? {};
			if (!origin) throw new Error("Origin is required in addon context");
			const index = await fetchStoryIndex(origin);
			const resolvedStories = findStoryIds(index, input.stories);
			const structuredResult = [];
			const textResult = [];
			for (const story of resolvedStories) {
				if ("errorMessage" in story) {
					structuredResult.push({
						input: story.input,
						error: story.errorMessage
					});
					textResult.push(story.errorMessage);
					continue;
				}
				const indexEntry = index.entries[story.id];
				if (!indexEntry) {
					structuredResult.push({
						input: story.input,
						error: `No story found for story ID "${story.id}"`
					});
					textResult.push(`No story found for story ID "${story.id}"`);
					continue;
				}
				let previewUrl = `${origin}/?path=/story/${story.id}`;
				const argsParam = buildArgsParam(story.input.props ?? {});
				if (argsParam) previewUrl += `&args=${argsParam}`;
				const globalsParam = buildArgsParam(story.input.globals ?? {});
				if (globalsParam) previewUrl += `&globals=${globalsParam}`;
				structuredResult.push({
					title: indexEntry.title,
					name: indexEntry.name,
					previewUrl
				});
				textResult.push(previewUrl);
			}
			if (!disableTelemetry) await collectTelemetry({
				event: "tool:previewStories",
				server,
				toolset: "dev",
				inputStoryCount: input.stories.length,
				outputStoryCount: structuredResult.length
			});
			return {
				content: textResult.map((text) => ({
					type: "text",
					text
				})),
				structuredContent: { stories: structuredResult }
			};
		} catch (error) {
			return errorToMCPContent(error);
		}
	});
}

//#endregion
//#region src/tools/run-story-tests.ts
/**
* Check if addon-vitest is available by trying to import its constants.
* Returns the constants if available, undefined otherwise.
*/
async function getAddonVitestConstants() {
	try {
		const mod = await import("@storybook/addon-vitest/constants");
		return {
			TRIGGER_TEST_RUN_REQUEST: mod.TRIGGER_TEST_RUN_REQUEST,
			TRIGGER_TEST_RUN_RESPONSE: mod.TRIGGER_TEST_RUN_RESPONSE
		};
	} catch {
		return;
	}
}
const RunStoryTestsInput = v.object({
	stories: v.optional(v.pipe(StoryInputArray, v.description(`Stories to test for focused feedback. Omit this field to run tests for all available stories.
Prefer running tests for specific stories while developing to get faster feedback,
and only omit this when you explicitly need to run all tests for comprehensive verification.
Prefer { storyId } when you don't already have story file context, since this avoids filesystem discovery.
Use { storyId } when IDs were discovered from documentation tools.
Use { absoluteStoryPath + exportName } only when you're currently working in a story file and already know those values.`))),
	a11y: v.optional(v.pipe(v.boolean(), v.description("Whether to run accessibility tests. Defaults to true. Disable if you only need component test results.")), true)
});
/**
* Creates a queue that ensures concurrent calls are executed in sequence.
* Call `wait()` to wait for your turn, then call the
* returned `done()` function when done to unblock the next caller.
*/
function createAsyncQueue() {
	let tail = Promise.resolve();
	/**
	* Wait for all previously queued operations to complete, then return
	* a `done` function that must be called when the current operation finishes.
	*/
	async function wait() {
		let done;
		const gate = new Promise((resolve) => {
			done = resolve;
		});
		const previousTail = tail;
		tail = previousTail.then(() => gate, () => gate);
		await previousTail.catch(() => {});
		return done;
	}
	return { wait };
}
async function addRunStoryTestsTool(server, { a11yEnabled }) {
	const addonVitestConstants = await getAddonVitestConstants();
	const testRunQueue = createAsyncQueue();
	const description = `Run story tests.
Provide stories for focused runs (faster while iterating),
or omit stories to run all tests for full-project verification.
Use this continuously to monitor test results as you work on your UI components and stories.
Results will include passing/failing status` + (a11yEnabled ? `, and accessibility violation reports.
For visual/design accessibility violations (for example color contrast), ask the user before changing styles.` : ".");
	server.tool({
		name: RUN_STORY_TESTS_TOOL_NAME,
		title: "Storybook Tests",
		description,
		schema: RunStoryTestsInput,
		enabled: () => {
			if (!addonVitestConstants) return false;
			return server.ctx.custom?.toolsets?.test ?? true;
		}
	}, async (input) => {
		let done;
		try {
			done = await testRunQueue.wait();
			const runA11y = input.a11y ?? true;
			const { origin, options, disableTelemetry } = server.ctx.custom ?? {};
			if (!origin) throw new Error("Origin is required in addon context");
			if (!options) throw new Error("Options are required in addon context");
			const channel = options.channel;
			if (!channel) throw new Error("Channel is not available");
			let storyIds;
			let inputStoryCount = 0;
			if (input.stories) {
				const resolvedStories = findStoryIds(await fetchStoryIndex(origin), input.stories);
				storyIds = resolvedStories.filter((story) => "id" in story).map((story) => story.id);
				inputStoryCount = input.stories.length;
				if (storyIds.length === 0) {
					const errorMessages = resolvedStories.filter((story) => "errorMessage" in story).map((story) => story.errorMessage).join("\n");
					if (!disableTelemetry) await collectTelemetry({
						event: "tool:runStoryTests",
						server,
						toolset: "test",
						runA11y,
						inputStoryCount,
						matchedStoryCount: 0,
						passingStoryCount: 0,
						failingStoryCount: 0,
						a11yViolationCount: 0,
						unhandledErrorCount: 0
					});
					return { content: [{
						type: "text",
						text: `No stories found matching the provided input.

${errorMessages}`
					}] };
				}
				logger.info(`Running focused tests for story IDs: ${storyIds.join(", ")}`);
			} else logger.info("Running tests for all stories");
			const testResults = (await triggerTestRun(channel, addonVitestConstants.TRIGGER_TEST_RUN_REQUEST, addonVitestConstants.TRIGGER_TEST_RUN_RESPONSE, storyIds, { a11y: runA11y })).result;
			if (!testResults) throw new Error("Test run response missing result data");
			const { text, summary } = formatRunStoryTestResults({
				testResults,
				runA11y,
				origin
			});
			if (!disableTelemetry) await collectTelemetry({
				event: "tool:runStoryTests",
				server,
				toolset: "test",
				runA11y,
				inputStoryCount,
				matchedStoryCount: testResults.storyIds?.length ?? storyIds?.length ?? 0,
				...summary
			});
			return { content: [{
				type: "text",
				text
			}] };
		} catch (error) {
			return errorToMCPContent(error);
		} finally {
			try {
				done?.();
			} catch (error) {
				logger.warn(`Failed to release test run queue: ${String(error)}`);
			}
		}
	});
}
/**
* Trigger a test run via Storybook channel events.
* This is the channel-based API for triggering tests in addon-vitest.
*/
function triggerTestRun(channel, triggerTestRunRequestEventName, triggerTestRunResponseEventName, storyIds, config) {
	return new Promise((resolve, reject) => {
		const requestId = `mcp-${Date.now()}`;
		let settled = false;
		const cleanup = () => {
			channel.off(triggerTestRunResponseEventName, handleResponse);
		};
		const settle = (callback) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const handleResponse = (payload) => {
			if (payload.requestId !== requestId) return;
			switch (payload.status) {
				case "completed":
					if (payload.result) settle(() => resolve(payload));
					else settle(() => reject(/* @__PURE__ */ new Error("Test run completed but no result was returned")));
					break;
				case "error":
					settle(() => reject(new Error(payload.error?.message ?? "Test run failed with unknown error")));
					break;
				case "cancelled":
					settle(() => reject(/* @__PURE__ */ new Error("Test run was cancelled")));
					break;
				default: settle(() => reject(/* @__PURE__ */ new Error("Unexpected test run response")));
			}
		};
		channel.on(triggerTestRunResponseEventName, handleResponse);
		const request = {
			requestId,
			actor: "addon-mcp",
			storyIds,
			config
		};
		try {
			channel.emit(triggerTestRunRequestEventName, request);
		} catch (error) {
			settle(() => reject(error instanceof Error ? error : new Error(String(error))));
		}
	});
}
function formatRunStoryTestResults({ testResults, runA11y, origin }) {
	const sections = [];
	const componentTestStatuses = testResults.componentTestStatuses;
	const passingStories = componentTestStatuses.filter((status) => status.value === "status-value:success");
	const failingStories = componentTestStatuses.filter((status) => status.value === "status-value:error");
	if (passingStories.length > 0) sections.push(formatPassingStoriesSection(passingStories));
	if (failingStories.length > 0) sections.push(formatFailingStoriesSection(failingStories));
	const a11yReports = testResults.a11yReports;
	const a11yViolationCount = runA11y ? countA11yViolations(a11yReports) : 0;
	if (runA11y && a11yReports && Object.keys(a11yReports).length > 0) {
		const a11ySection = formatA11yReportsSection({
			a11yReports,
			origin
		});
		if (a11ySection) sections.push(a11ySection);
	}
	if (testResults.unhandledErrors.length > 0) sections.push(formatUnhandledErrorsSection(testResults.unhandledErrors));
	return {
		text: sections.join("\n\n"),
		summary: {
			passingStoryCount: passingStories.length,
			failingStoryCount: failingStories.length,
			a11yViolationCount,
			unhandledErrorCount: testResults.unhandledErrors.length
		}
	};
}
function formatPassingStoriesSection(passingStories) {
	return `## Passing Stories

- ${passingStories.map((status) => status.storyId).join("\n- ")}`;
}
function formatFailingStoriesSection(statuses) {
	return `## Failing Stories

${statuses.map((status) => `### ${status.storyId}

${status.description || "No failure details available."}`).join("\n\n")}`;
}
function formatA11yReportsSection({ a11yReports, origin }) {
	const a11yViolationSections = [];
	for (const [storyId, reports] of Object.entries(a11yReports)) for (const report of reports) {
		if ("error" in report && report.error) {
			a11yViolationSections.push(`### ${storyId} - Error

${report.error.message}`);
			continue;
		}
		const violations = getA11yViolations(report);
		if (violations.length === 0) continue;
		for (const violation of violations) {
			const nodes = violation.nodes.map((node) => {
				const inspectLink = node.linkPath ? `${origin}${node.linkPath}` : void 0;
				const parts = [];
				if (node.impact) parts.push(`- **Impact**: ${node.impact}`);
				if (node.failureSummary || node.message) parts.push(`  **Message**: ${node.failureSummary || node.message}`);
				parts.push(`  **Element**: ${node.html || "(no html available)"}`);
				if (inspectLink) parts.push(`  **Inspect**: ${inspectLink}`);
				return parts.join("\n");
			}).join("\n");
			a11yViolationSections.push(`### ${storyId} - ${violation.id}

${violation.description}

#### Affected Elements
${nodes}`);
		}
	}
	if (a11yViolationSections.length === 0) return;
	return `## Accessibility Violations

${a11yViolationSections.join("\n\n")}`;
}
function formatUnhandledErrorsSection(errors) {
	return `## Unhandled Errors

${errors.map((unhandledError) => `### ${unhandledError.name || "Unknown Error"}

**Error message**: ${unhandledError.message || "No message available"}
**Path**: ${unhandledError.VITEST_TEST_PATH || "No path available"}
**Test name**: ${unhandledError.VITEST_TEST_NAME || "No test name available"}
**Stack trace**:
${unhandledError.stack || "No stack trace available"}`).join("\n\n")}`;
}
function countA11yViolations(a11yReports) {
	let count = 0;
	for (const reports of Object.values(a11yReports ?? {})) for (const report of reports) {
		if ("error" in report && report.error) continue;
		count += getA11yViolations(report).length;
	}
	return count;
}
function getA11yViolations(report) {
	if (!("violations" in report)) return [];
	const { violations } = report;
	if (!Array.isArray(violations)) return [];
	return violations.map((violation) => ({
		id: violation.id,
		description: violation.description,
		nodes: violation.nodes.map((node) => ({
			impact: typeof node.impact === "string" ? node.impact : void 0,
			failureSummary: typeof node.failureSummary === "string" ? node.failureSummary : void 0,
			html: typeof node.html === "string" ? node.html : void 0,
			linkPath: typeof node.linkPath === "string" ? node.linkPath : void 0
		}))
	}));
}

//#endregion
//#region src/instructions/storybook-story-instructions.md
var storybook_story_instructions_default = "# Writing User Interfaces\n\nWhen writing UI, prefer breaking larger components up into smaller parts.\n\nALWAYS write a Storybook story for any component written. If editing a component, ensure appropriate changes have been made to stories for that component.\n\n## How to write good stories\n\nGoal: Cover every distinct piece of business logic and state the component can reach (happy paths, error/edge states, loading, permissions/roles, empty states, variations from props/context). Avoid redundant stories that show the same logic.\n\nInteractivity: If the component is interactive, add Interaction tests using play functions that drive the UI with storybook/test utilities (e.g., fn, userEvent, expect). Simulate key user flows: clicking buttons/links, typing, focus/blur, keyboard nav, form submit, async responses, toggle/selection changes, pagination/filters, etc. When passing `fn` functions as `args` for callback functions, make sure to add a play function which interacts with the component and assert whether the callback function was actually called.\n\nData/setup: Provide realistic props, state, and mocked data. Include meaningful labels/text to make behaviors observable. Stub network/services with deterministic fixtures; keep stories reliable.\n\nAssertions: In play functions, assert the visible outcome of the interaction (text, aria state, enabled/disabled, class/state changes, emitted events). Prefer role/label-based queries.\n\nVariants to consider (pick only those that change behavior): default vs. alternate themes; loading vs. loaded vs. empty vs. error; validated vs. invalid input; permissions/roles/capabilities; feature flags; size/density/layout variants that alter logic.\n\nAccessibility: Use semantic roles/labels; ensure focusable/keyboard interactions are test-covered where relevant.\n\nNaming/structure: Use clear story names that describe the scenario (“Error state after failed submit”). Group related variants logically; don’t duplicate.\n\nImports/format: Import Meta/StoryObj from the framework package; import test helpers from storybook/test (not @storybook/test). Keep stories minimal—only what's needed to demonstrate behavior.\n\n## Storybook 9 Essential Changes for Story Writing\n\n### Package Consolidation\n\n#### `Meta` and `StoryObj` imports\n\nUpdate story imports to use the framework package:\n\n```diff\n- import { Meta, StoryObj } from '{{RENDERER}}';\n+ import { Meta, StoryObj } from '{{FRAMEWORK}}';\n```\n\n#### Test utility imports\n\nUpdate test imports to use `storybook/test` instead of `@storybook/test`\n\n```diff\n- import { fn } from '@storybook/test';\n+ import { fn } from 'storybook/test';\n```\n\n### Global State Changes\n\nThe `globals` annotation has be renamed to `initialGlobals`:\n\n```diff\n// .storybook/preview.js\nexport default {\n- globals: { theme: 'light' }\n+ initialGlobals: { theme: 'light' }\n};\n```\n\n### Autodocs Configuration\n\nInstead of `parameters.docs.autodocs` in main.js, use tags:\n\n```js\n// .storybook/preview.js or in individual stories\nexport default {\n	tags: ['autodocs'], // generates autodocs for all stories\n};\n```\n\n### Mocking imports in Storybook\n\nTo mock imports in Storybook, use Storybook's mocking features. ALWAYS mock external dependencies to ensure stories render consistently.\n\n1. **Register in the mock in Storybook's preview file**:\n   To mock dependendencies, you MUST register a module mock in `.storybook/preview.ts` (or equivalent):\n\n```js\nimport { sb } from 'storybook/test';\n\n// Prefer spy mocks (keeps functions, but allows to override them and spy on them)\nsb.mock(import('some-library'), { spy: true });\n```\n\n**Important: Use file extensions when referring to relative files!**\n\n```js\nsb.mock(import('./relative/module.ts'), { spy: true });\n```\n\n2. **Specify mock values in stories**:\n   You can override the behaviour of the mocks per-story using `beforeEach` and the `mocked()` type function:\n\n```js\nimport { expect, mocked, fn } from 'storybook/test';\nimport { library } from 'some-library';\n\nconst meta = {\n  component: AuthButton,\n  beforeEach: async () => {\n    mocked(library).mockResolvedValue({  user: 'data' });\n  },\n};\n\nexport const LoggedIn: Story = {\n  play: async ({ canvas }) => {\n    await expect(library).toHaveBeenCalled();\n  },\n};\n```\n\nBefore doing this ensure you have mocked the import in the preview file.\n\n### Play Function Parameters\n\n- The play function has a `canvas` parameter that can be used directly with testing-library-like query methods.\n- It also has a `canvasElement` which is the actual DOM element.\n- The `within`-function imported from `storybook/test` transforms a DOM element to an object with query methods, similar to `canvas`.\n\n**DO NOT** use `within(canvas)` - it is redundant because `canvas` already has the query methods, `canvas` is not a DOM element.\n\n```ts\n// ✅ Correct: Use canvas directly\nplay: async ({ canvas }) => {\n	await canvas.getByLabelText('Submit').click();\n};\n\n// ⚠️ Also acceptable: Use `canvasElement` with `within`\nimport { within } from 'storybook/test';\n\nplay: async ({ canvasElement }) => {\n	const canvas = within(canvasElement);\n	await canvas.getByLabelText('Submit').click();\n};\n\n// ❌ Wrong: Do NOT use within(canvas)\nplay: async ({ canvas }) => {\n	const screen = within(canvas); // Error!\n};\n```\n\n### Key Requirements\n\n- **Node.js 20+**, **TypeScript 4.9+**\n- React Native uses `.rnstorybook` directory\n\n## Story Linking Agent Behavior\n\n- ALWAYS provide story links after any changes to stories files, including changes to existing stories.\n- After changing any UI components, ALWAYS search for related stories that might cover the changes you've made. If you find any, provide the story links to the user. THIS IS VERY IMPORTANT, as it allows the user to visually inspect the changes you've made. Even later in a session when changing UI components or stories that have already been linked to previously, YOU MUST PROVIDE THE LINKS AGAIN.\n- Use the {{PREVIEW_STORIES_TOOL_NAME}} tool to get the correct URLs for links to stories.\n";

//#endregion
//#region src/instructions/story-testing-instructions.md
var story_testing_instructions_default = "## Story Testing Requirements\n\n**Run `{{RUN_STORY_TESTS_TOOL_NAME}}` after EVERY component or story change.** This includes creating, modifying, or refactoring components, stories, or their dependencies.\n\n### Workflow\n\n1. Make your change\n2. Run `{{RUN_STORY_TESTS_TOOL_NAME}}` with affected stories for focused feedback (faster while iterating)\n3. If tests fail: analyze, fix{{A11Y_FIX_SUFFIX}}, re-run\n4. Repeat until all tests pass\n\nDo not skip tests, ignore failures, or move on with failing tests. If stuck after multiple attempts, report to user.\n\n### Focused vs. full-suite test runs\n\n- Prefer focused runs (`stories` input) during development to validate the parts you changed quickly.\n- Run all tests (omit `stories`) before final handoff, after broad/refactor changes, or when impact is unclear and you need project-wide verification.\n";

//#endregion
//#region src/instructions/a11y-instructions.md
var a11y_instructions_default = "### Accessibility Violations\n\n**Fix automatically** (semantic/structural, no visual change):\n\n- ARIA attributes, roles, labels, alt text\n- Heading hierarchy, landmarks, table structure\n- Keyboard access (tabindex, focus, handlers)\n- Document-level: lang attr, frame titles, duplicate IDs\n\n**Confirm with user first** (visual/design changes):\n\n- Color contrast ratios\n- Font sizes, spacing, layout\n- Focus indicator styling\n\nDescribe the issue, ask how the user wants to proceed, and provide 2-3 concrete options.\nDo not auto-apply visual changes before user confirmation, and do not claim visual issues are fixed until they approve an option.\n";

//#endregion
//#region src/utils/is-addon-a11y-enabled.ts
/**
* Check if @storybook/addon-a11y is enabled in the Storybook configuration.
*/
async function isAddonA11yEnabled(options) {
	try {
		return await options.presets.apply("isAddonA11yEnabled", false);
	} catch {
		return false;
	}
}

//#endregion
//#region src/tools/get-storybook-story-instructions.ts
async function addGetUIBuildingInstructionsTool(server) {
	const addonVitestAvailable = !!await getAddonVitestConstants();
	server.tool({
		name: GET_UI_BUILDING_INSTRUCTIONS_TOOL_NAME,
		title: "Storybook Story Development Instructions",
		get description() {
			const testToolsetAvailable = (server.ctx.custom?.toolsets?.test ?? true) && addonVitestAvailable;
			const a11yAvailable = testToolsetAvailable && (server.ctx.custom?.a11yEnabled ?? false);
			return `Get comprehensive instructions for writing, testing, and fixing Storybook stories (.stories.tsx, .stories.ts, .stories.jsx, .stories.js, .stories.svelte, .stories.vue files).

CRITICAL: You MUST call this tool before:
- Creating new Storybook stories or story files
- Updating or modifying existing Storybook stories
- Adding new story variants or exports to story files
- Editing any file matching *.stories.* patterns
- Writing components that will need stories${testToolsetAvailable ? `
- Running story tests or fixing test failures` : ""}${a11yAvailable ? `
- Handling accessibility (a11y) violations in stories (fix semantic issues directly; ask before visual/design changes)` : ""}

This tool provides essential Storybook-specific guidance including:
- How to structure stories correctly for Storybook 9
- Required imports (Meta, StoryObj from framework package)
- Test utility imports (from 'storybook/test')
- Story naming conventions and best practices
- Play function patterns for interactive testing
- Mocking strategies for external dependencies
- Story variants and coverage requirements${testToolsetAvailable ? `
- How to handle test failures${a11yAvailable ? " and accessibility violations" : ""}` : ""}

Even if you're familiar with Storybook, call this tool to ensure you're following the correct patterns, import paths, and conventions for this specific Storybook setup.`;
		},
		enabled: () => server.ctx.custom?.toolsets?.dev ?? true
	}, async () => {
		try {
			const { options, disableTelemetry } = server.ctx.custom ?? {};
			if (!options) throw new Error("Options are required in addon context");
			if (!disableTelemetry) await collectTelemetry({
				event: "tool:getUIBuildingInstructions",
				server,
				toolset: "dev"
			});
			const frameworkPreset = await options.presets.apply("framework");
			const framework = typeof frameworkPreset === "string" ? frameworkPreset : frameworkPreset?.name;
			const renderer = frameworkToRendererMap[framework];
			let uiInstructions = storybook_story_instructions_default.replace("{{FRAMEWORK}}", framework).replace("{{RENDERER}}", renderer ?? framework).replace("{{PREVIEW_STORIES_TOOL_NAME}}", PREVIEW_STORIES_TOOL_NAME);
			if ((server.ctx.custom?.toolsets?.test ?? true) && !!await getAddonVitestConstants()) {
				const a11yEnabled = server.ctx.custom?.a11yEnabled ?? false;
				const a11yFixSuffix = a11yEnabled ? " (see a11y guidelines below)" : "";
				const storyTestingInstructions = story_testing_instructions_default.replaceAll("{{RUN_STORY_TESTS_TOOL_NAME}}", RUN_STORY_TESTS_TOOL_NAME).replace("{{A11Y_FIX_SUFFIX}}", a11yFixSuffix);
				uiInstructions += `\n\n${storyTestingInstructions}`;
				if (a11yEnabled) uiInstructions += `\n${a11y_instructions_default}`;
			}
			return { content: [{
				type: "text",
				text: uiInstructions
			}] };
		} catch (error) {
			return errorToMCPContent(error);
		}
	});
}
const frameworkToRendererMap = {
	"@storybook/react-vite": "@storybook/react",
	"@storybook/react-webpack5": "@storybook/react",
	"@storybook/nextjs": "@storybook/react",
	"@storybook/nextjs-vite": "@storybook/react",
	"@storybook/react-native-web-vite": "@storybook/react",
	"@storybook/vue3-vite": "@storybook/vue3",
	"@nuxtjs/storybook": "@storybook/vue3",
	"@storybook/angular": "@storybook/angular",
	"@storybook/svelte-vite": "@storybook/svelte",
	"@storybook/sveltekit": "@storybook/svelte",
	"@storybook/preact-vite": "@storybook/preact",
	"@storybook/web-components-vite": "@storybook/web-components",
	"@storybook/html-vite": "@storybook/html"
};

//#endregion
//#region src/tools/is-manifest-available.ts
const getManifestStatus = async (options) => {
	const [features, manifests, legacyComponentManifestGenerator] = await Promise.all([
		options.presets.apply("features"),
		options.presets.apply("experimental_manifests", void 0, { manifestEntries: [] }),
		options.presets.apply("experimental_componentManifestGenerator")
	]);
	const hasManifests = manifests && "components" in manifests || !!legacyComponentManifestGenerator;
	const hasFeatureFlag = !!(features?.componentsManifest ?? features?.experimentalComponentsManifest);
	return {
		available: hasFeatureFlag && hasManifests,
		hasManifests,
		hasFeatureFlag
	};
};

//#endregion
//#region src/utils/estimate-tokens.ts
/**
* Checks if a character code is whitespace (space, tab, newline, carriage return)
*
* Checking char codes is slightly faster than using regex or string methods.
*/
function isWhitespace(code) {
	return code === 32 || code === 9 || code === 10 || code === 13;
}
/**
* Checks if a character code is alphanumeric or underscore
* 0-9 (48-57), A-Z (65-90), a-z (97-122), underscore (95)
*
* Checking char codes is slightly faster than using regex or string methods.
*/
function isAlphanumeric(code) {
	return code >= 48 && code <= 57 || code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
}
/**
* Estimates token count from text using a fast approximation.
* Counts:
* - Continuous whitespace as a single token
* - Continuous alphanumeric sequences as single tokens
* - Each special character as an individual token
*
* This is a cheap approximation suitable for telemetry purposes.
*
* @param text - The text to estimate token count for
* @returns Estimated token count
*/
function estimateTokens(text) {
	if (!text) return 0;
	let tokenCount = 0;
	let i = 0;
	const len = text.length;
	while (i < len) {
		const code = text.charCodeAt(i);
		if (isWhitespace(code)) {
			tokenCount++;
			i++;
			while (i < len && isWhitespace(text.charCodeAt(i))) i++;
		} else if (isAlphanumeric(code)) {
			tokenCount++;
			i++;
			while (i < len && isAlphanumeric(text.charCodeAt(i))) i++;
		} else {
			tokenCount++;
			i++;
		}
	}
	return tokenCount;
}

//#endregion
//#region src/instructions/dev-instructions.md
var dev_instructions_default = "## UI Building and Story Writing Workflow\n\n- Before creating or editing components or stories, call **get-storybook-story-instructions**.\n- Treat that tool's output as the source of truth for framework-specific imports, story patterns, and testing conventions.\n- After changing any component or story, call **preview-stories**.\n- Always include every returned preview URL in your user-facing response so the user can verify the visual result.\n";

//#endregion
//#region src/instructions/test-instructions.md
var test_instructions_default = "## Validation Workflow\n\n- After each component or story change, run **run-story-tests**.\n- Use focused runs while iterating, then run a broad pass before final handoff when scope is unclear or wide.\n- Fix failing tests before reporting success. Do not report completion while story tests are failing.\n";

//#endregion
//#region src/instructions/build-server-instructions.ts
function buildServerInstructions(options) {
	const sections = ["Follow these workflows when working with UI and/or Storybook."];
	if (options.devEnabled) sections.push(dev_instructions_default.trim());
	if (options.testEnabled) sections.push(test_instructions_default.trim());
	if (options.docsEnabled) sections.push(STORYBOOK_MCP_INSTRUCTIONS.trim());
	if (sections.length === 1) return "";
	return sections.join("\n\n");
}

//#endregion
//#region src/mcp-handler.ts
let transport;
let origin;
let initialize;
let disableTelemetry;
let a11yEnabled;
const initializeMCPServer = async (options, multiSource) => {
	disableTelemetry = (await options.presets.apply("core", {}))?.disableTelemetry ?? false;
	const addonVitestConstants = await getAddonVitestConstants();
	const manifestStatus = await getManifestStatus(options);
	a11yEnabled = await isAddonA11yEnabled(options);
	let server;
	const serverOptions = {
		adapter: new ValibotJsonSchemaAdapter(),
		get instructions() {
			return buildServerInstructions({
				devEnabled: server?.ctx.custom?.toolsets?.dev ?? true,
				testEnabled: (server?.ctx.custom?.toolsets?.test ?? true) && !!addonVitestConstants,
				docsEnabled: (server?.ctx.custom?.toolsets?.docs ?? true) && manifestStatus.available
			});
		},
		capabilities: {
			tools: { listChanged: true },
			resources: { listChanged: true }
		}
	};
	server = new McpServer({
		name,
		version,
		description
	}, serverOptions).withContext();
	if (!disableTelemetry) server.on("initialize", async () => {
		await collectTelemetry({
			event: "session:initialized",
			server
		});
	});
	await addPreviewStoriesTool(server);
	await addGetUIBuildingInstructionsTool(server);
	await addRunStoryTestsTool(server, { a11yEnabled });
	if (manifestStatus.available) {
		logger.info("Experimental components manifest feature detected - registering component tools");
		const contextAwareEnabled = () => server.ctx.custom?.toolsets?.docs ?? true;
		await addListAllDocumentationTool(server, contextAwareEnabled);
		await addGetDocumentationTool(server, contextAwareEnabled, { multiSource });
		await addGetStoryDocumentationTool(server, contextAwareEnabled, { multiSource });
	}
	transport = new HttpTransport(server, { path: null });
	origin = `http://localhost:${options.port}`;
	logger.debug(`MCP server origin: ${origin}`);
	return server;
};
const mcpServerHandler = async ({ req, res, options, addonOptions, sources, manifestProvider, compositionAuth }) => {
	if (!initialize) initialize = initializeMCPServer(options, sources?.some((s) => s.url));
	const server = await initialize;
	const webRequest = await incomingMessageToWebRequest(req);
	const addonContext = {
		options,
		toolsets: getToolsets(webRequest, addonOptions),
		origin,
		disableTelemetry,
		a11yEnabled,
		request: webRequest,
		sources,
		manifestProvider,
		...!disableTelemetry && {
			onListAllDocumentation: async ({ manifests, resultText, sources: sourceManifests }) => {
				await collectTelemetry({
					event: "tool:listAllDocumentation",
					server,
					toolset: "docs",
					componentCount: Object.keys(manifests.componentManifest.components).length,
					docsCount: Object.keys(manifests.docsManifest?.docs || {}).length,
					resultTokenCount: estimateTokens(resultText),
					sourceCount: sourceManifests?.length
				});
			},
			onGetDocumentation: async ({ input, foundDocumentation, resultText }) => {
				await collectTelemetry({
					event: "tool:getDocumentation",
					server,
					toolset: "docs",
					componentId: input.id,
					found: !!foundDocumentation,
					resultTokenCount: estimateTokens(resultText ?? "")
				});
			}
		}
	};
	const response = await transport.respond(webRequest, addonContext);
	if (response) {
		const body = await response.arrayBuffer();
		await webResponseToServerResponse(compositionAuth.hadAuthError(webRequest) ? new Response("401 - Unauthorized", {
			status: 401,
			headers: {
				"Content-Type": "text/plain",
				"WWW-Authenticate": compositionAuth.buildWwwAuthenticate(origin)
			}
		}) : new Response(body, {
			status: response.status,
			headers: response.headers
		}), res);
	}
};
/**
* Converts a Node.js IncomingMessage to a Web Request.
*/
async function incomingMessageToWebRequest(req) {
	const host = req.headers.host || "localhost";
	const protocol = "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
	const url = new URL(req.url || "/", `${protocol}://${host}`);
	const bodyBuffer = await buffer(req);
	return new Request(url, {
		method: req.method,
		headers: req.headers,
		body: bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : void 0
	});
}
/**
* Converts a Web Response to a Node.js ServerResponse.
*/
async function webResponseToServerResponse(webResponse, nodeResponse) {
	nodeResponse.statusCode = webResponse.status;
	webResponse.headers.forEach((value, key) => {
		nodeResponse.setHeader(key, value);
	});
	if (webResponse.body) {
		const reader = webResponse.body.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				nodeResponse.write(value);
			}
		} finally {
			reader.releaseLock();
		}
	}
	nodeResponse.end();
}
function getToolsets(request, addonOptions) {
	const toolsetHeader = request.headers.get("X-MCP-Toolsets");
	if (!toolsetHeader || toolsetHeader.trim() === "") return addonOptions.toolsets;
	const toolsets = {
		dev: false,
		docs: false,
		test: false
	};
	const enabledToolsets = toolsetHeader.split(",");
	for (const enabledToolset of enabledToolsets) {
		const trimmedToolset = enabledToolset.trim();
		if (trimmedToolset in toolsets) toolsets[trimmedToolset] = true;
	}
	return toolsets;
}

//#endregion
//#region src/template.html
var template_default = "<!doctype html>\n<html>\n	<head>\n		<style>\n			@font-face {\n				font-family: 'Nunito Sans';\n				font-style: normal;\n				font-weight: 400;\n				font-display: swap;\n				src: url('./sb-common-assets/nunito-sans-regular.woff2') format('woff2');\n			}\n\n			* {\n				margin: 0;\n				padding: 0;\n				box-sizing: border-box;\n			}\n\n			html,\n			body {\n				height: 100%;\n				font-family:\n					'Nunito Sans',\n					-apple-system,\n					BlinkMacSystemFont,\n					'Segoe UI',\n					Roboto,\n					Oxygen,\n					Ubuntu,\n					Cantarell,\n					sans-serif;\n			}\n\n			body {\n				display: flex;\n				flex-direction: column;\n				justify-content: center;\n				align-items: center;\n				text-align: center;\n				padding: 2rem;\n				background-color: #ffffff;\n				color: rgb(46, 52, 56);\n				line-height: 1.6;\n			}\n\n			p {\n				margin-bottom: 1rem;\n			}\n\n			code {\n				font-family: 'Monaco', 'Courier New', monospace;\n				background: #f5f5f5;\n				padding: 0.2em 0.4em;\n				border-radius: 3px;\n			}\n\n			a {\n				color: #1ea7fd;\n			}\n\n			.container {\n				display: flex;\n				flex-direction: column;\n				align-items: center;\n			}\n\n			.toolsets {\n				margin: 1.5rem 0;\n				text-align: left;\n				max-width: 500px;\n			}\n\n			.toolsets h3 {\n				font-size: 1rem;\n				margin-bottom: 0.75rem;\n				text-align: center;\n			}\n\n			.toolset {\n				margin-bottom: 1rem;\n				padding: 0.75rem 1rem;\n				border-radius: 6px;\n				background: #f8f9fa;\n				border: 1px solid #e9ecef;\n			}\n\n			.toolset-header {\n				display: flex;\n				align-items: center;\n				gap: 0.5rem;\n				font-weight: 600;\n				margin-bottom: 0.5rem;\n			}\n\n			.toolset-status {\n				display: inline-block;\n				padding: 0.15em 0.5em;\n				border-radius: 3px;\n				font-size: 0.75rem;\n				font-weight: 500;\n				text-transform: uppercase;\n			}\n\n			.toolset-status.enabled {\n				background: #d4edda;\n				color: #155724;\n			}\n\n			.toolset-status.disabled {\n				background: #f8d7da;\n				color: #721c24;\n			}\n\n			.toolset-tools {\n				font-size: 0.875rem;\n				color: #6c757d;\n				padding-left: 1.5rem;\n				margin: 0;\n			}\n\n			.toolset-tools li {\n				margin-bottom: 0.25rem;\n			}\n\n			.toolset-tools code {\n				font-size: 0.8rem;\n			}\n\n			.toolset-notice {\n				font-size: 0.8rem;\n				color: #856404;\n				background: #fff3cd;\n				padding: 0.5rem;\n				border-radius: 4px;\n				margin-top: 0.5rem;\n			}\n\n			.toolset-notice a {\n				color: #533f03;\n			}\n\n			@media (prefers-color-scheme: dark) {\n				body {\n					background-color: rgb(34, 36, 37);\n					color: rgb(201, 205, 207);\n				}\n\n				code {\n					background: rgba(255, 255, 255, 0.1);\n				}\n\n				.toolset {\n					background: rgba(255, 255, 255, 0.05);\n					border-color: rgba(255, 255, 255, 0.1);\n				}\n\n				.toolset-tools {\n					color: #adb5bd;\n				}\n\n				.toolset-status.enabled {\n					background: rgba(40, 167, 69, 0.2);\n					color: #75d67e;\n				}\n\n				.toolset-status.disabled {\n					background: rgba(220, 53, 69, 0.2);\n					color: #f5a6ad;\n				}\n\n				.toolset-notice {\n					background: rgba(255, 193, 7, 0.15);\n					color: #ffc107;\n				}\n\n				.toolset-notice a {\n					color: #ffe066;\n				}\n			}\n		</style>\n	</head>\n	<body>\n		<div class=\"container\">\n			<p>\n				Storybook MCP server successfully running via\n				<code>@storybook/addon-mcp</code>.\n			</p>\n			<p>\n				See how to connect to it from your coding agent in\n				<a\n					target=\"_blank\"\n					href=\"https://github.com/storybookjs/mcp/tree/main/packages/addon-mcp#configuring-your-agent\"\n					>the addon's README</a\n				>.\n			</p>\n\n			<div class=\"toolsets\">\n				<h3>Available Toolsets</h3>\n\n				<div class=\"toolset\">\n					<div class=\"toolset-header\">\n						<span>dev</span>\n						<span class=\"toolset-status {{DEV_STATUS}}\">{{DEV_STATUS}}</span>\n					</div>\n					<ul class=\"toolset-tools\">\n						<li><code>preview-stories</code></li>\n						<li><code>get-storybook-story-instructions</code></li>\n					</ul>\n				</div>\n\n				<div class=\"toolset\">\n					<div class=\"toolset-header\">\n						<span>docs</span>\n						<span class=\"toolset-status {{DOCS_STATUS}}\">{{DOCS_STATUS}}</span>\n					</div>\n					<ul class=\"toolset-tools\">\n						<li><code>list-all-documentation</code></li>\n						<li><code>get-documentation</code></li>\n					</ul>\n					{{DOCS_NOTICE}}\n				</div>\n\n				<div class=\"toolset\">\n					<div class=\"toolset-header\">\n						<span>test</span>\n						<span class=\"toolset-status {{TEST_STATUS}}\">{{TEST_STATUS}}</span>\n					</div>\n					<ul class=\"toolset-tools\">\n						<li><code>run-story-tests</code>{{A11Y_BADGE}}</li>\n					</ul>\n					{{TEST_NOTICE}}\n				</div>\n			</div>\n\n			{{MANIFEST_DEBUGGER_LINK}}\n		</div>\n	</body>\n</html>\n";

//#endregion
//#region src/auth/composition-auth.ts
/**
* Composition authentication for fetching manifests from private Storybooks.
*
* This class handles OAuth discovery and token-based manifest fetching for
* composed Storybooks (refs). It acts as a proxy for OAuth metadata, allowing
* MCP clients like VS Code to handle the OAuth flow with Chromatic.
*/
const OAuthResourceMetadata = v.object({
	resource: v.optional(v.string()),
	authorization_servers: v.pipe(v.array(v.string()), v.minLength(1)),
	scopes_supported: v.optional(v.array(v.string()))
});
const OAuthServerMetadata = v.object({
	issuer: v.string(),
	authorization_endpoint: v.string(),
	token_endpoint: v.string(),
	scopes_supported: v.optional(v.array(v.string()))
});
const MANIFEST_CACHE_TTL = 3600 * 1e3;
const REVALIDATION_TTL = 60 * 1e3;
var AuthenticationError = class extends Error {
	constructor(url) {
		super(`Authentication failed for ${url}. Your token may be invalid or expired.`);
		this.name = "AuthenticationError";
	}
};
var CompositionAuth = class {
	#authRequirement = null;
	#authRequiredUrls = [];
	#refsWithManifests = [];
	#manifestCache = /* @__PURE__ */ new Map();
	#lastToken = null;
	#authErrors = /* @__PURE__ */ new WeakMap();
	/** Initialize by checking which refs require authentication and have manifests. */
	async initialize(refs) {
		for (const ref of refs) try {
			const result = await this.#checkRef(ref.url);
			if (result === "no-manifest") continue;
			this.#refsWithManifests.push(ref);
			if (result === "public") continue;
			this.#authRequiredUrls.push(ref.url);
			if (!this.#authRequirement) this.#authRequirement = result;
			else {
				const existingServer = this.#authRequirement.resourceMetadata.authorization_servers[0];
				const newServer = result.resourceMetadata.authorization_servers[0];
				if (existingServer !== newServer) console.warn(`[addon-mcp] Composed ref "${ref.title}" uses a different OAuth server (${newServer}) than the first authenticated ref (${existingServer}). Only the first OAuth server will be used for authentication.`);
			}
		} catch (error) {
			console.warn(`[addon-mcp] Failed to check auth for composed ref "${ref.title}" (${ref.url}): ${error instanceof Error ? error.message : String(error)}. Skipping this ref.`);
		}
	}
	get requiresAuth() {
		return this.#authRequiredUrls.length > 0;
	}
	get authUrls() {
		return this.#authRequiredUrls;
	}
	/** Check if a request encountered an auth error during manifest fetching. */
	hadAuthError(request) {
		return this.#authErrors.has(request);
	}
	/** Check if a URL requires authentication based on discovered auth requirements. */
	#isAuthRequiredUrl(url) {
		return this.#authRequiredUrls.some((authUrl) => url.startsWith(authUrl));
	}
	/** Build .well-known/oauth-protected-resource response. */
	buildWellKnown(origin) {
		if (!this.#authRequirement) return null;
		return {
			resource: `${origin}/mcp`,
			authorization_servers: this.#authRequirement.resourceMetadata.authorization_servers,
			scopes_supported: this.#authRequirement.resourceMetadata.scopes_supported
		};
	}
	/** Build WWW-Authenticate header for 401 responses */
	buildWwwAuthenticate(origin) {
		return `Bearer error="unauthorized", error_description="Authorization needed for composed Storybooks", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
	}
	/** Build sources configuration: local first, then refs that have manifests. */
	buildSources() {
		return [{
			id: "local",
			title: "Local"
		}, ...this.#refsWithManifests.map((ref) => ({
			id: ref.id,
			title: ref.title,
			url: ref.url
		}))];
	}
	/** Create a manifest provider for multi-source mode. */
	createManifestProvider(localOrigin) {
		return async (request, path, source) => {
			const token = extractBearerToken(request?.headers.get("Authorization"));
			const baseUrl = source?.url ?? localOrigin;
			const manifestUrl = `${baseUrl}${path.replace("./", "/")}`;
			const isRemote = !!source?.url;
			const tokenForRequest = isRemote && this.#isAuthRequiredUrl(baseUrl) ? token : null;
			if (token && token !== this.#lastToken) {
				this.#manifestCache.clear();
				this.#lastToken = token;
			}
			if (isRemote) {
				const cached = this.#manifestCache.get(manifestUrl);
				if (cached) if (Date.now() - cached.timestamp > MANIFEST_CACHE_TTL) this.#manifestCache.delete(manifestUrl);
				else {
					if (!cached.lastRevalidatedAt || Date.now() - cached.lastRevalidatedAt > REVALIDATION_TTL) {
						cached.lastRevalidatedAt = Date.now();
						this.#fetchManifest(manifestUrl, tokenForRequest).then((text) => this.#manifestCache.set(manifestUrl, {
							text,
							timestamp: Date.now(),
							lastRevalidatedAt: Date.now()
						})).catch(() => {});
					}
					return cached.text;
				}
			}
			try {
				const text = await this.#fetchManifest(manifestUrl, tokenForRequest);
				if (isRemote) this.#manifestCache.set(manifestUrl, {
					text,
					timestamp: Date.now()
				});
				return text;
			} catch (error) {
				if (error instanceof AuthenticationError && request) this.#authErrors.set(request, error);
				throw error;
			}
		};
	}
	/**
	* Fetch a manifest with optional auth token.
	* If the response is 200 but not a valid manifest, checks /mcp for auth issues.
	*/
	async #fetchManifest(url, token) {
		const headers = { Accept: "application/json" };
		if (token) headers["Authorization"] = `Bearer ${token}`;
		const response = await fetch(url, { headers });
		if (response.status === 401) throw new AuthenticationError(url);
		if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
		const text = await response.text();
		const schema = url.includes("docs.json") ? DocsManifestMap : ComponentManifestMap;
		if (v.safeParse(v.pipe(v.string(), v.parseJson(), schema), text).success) return text;
		if (await this.#isMcpUnauthorized(new URL(url).origin)) throw new AuthenticationError(url);
		throw new Error(`Invalid manifest response from ${url}: expected valid JSON manifest but got unexpected content.`);
	}
	/**
	* Check a ref to determine if it has a manifest and whether it requires auth.
	* Returns 'public' if the ref has a valid manifest without auth,
	* 'no-manifest' if no manifest is available, or an AuthRequirement if auth is needed.
	*/
	async #checkRef(refUrl) {
		const response = await fetch(`${refUrl}/manifests/components.json`, { headers: { Accept: "application/json" } });
		const authReq = await this.#parseAuthFromResponse(response);
		if (authReq) return authReq;
		if (response.ok) {
			const text = await response.text();
			if (v.safeParse(v.pipe(v.string(), v.parseJson(), ComponentManifestMap), text).success) return "public";
		}
		const mcpAuth = await this.#checkMcpAuth(refUrl);
		if (mcpAuth) return mcpAuth;
		return "no-manifest";
	}
	/** Check /mcp endpoint for 401 auth requirement. */
	async #checkMcpAuth(refUrl) {
		const response = await fetch(`${refUrl}/mcp`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list"
			})
		});
		return this.#parseAuthFromResponse(response);
	}
	/** Quick check: does the remote /mcp return 401? */
	async #isMcpUnauthorized(origin) {
		try {
			return (await fetch(`${origin}/mcp`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list"
				})
			})).status === 401;
		} catch {
			return false;
		}
	}
	/** Extract auth requirement from a 401 response's WWW-Authenticate header. */
	async #parseAuthFromResponse(response) {
		if (response.status !== 401) return null;
		const wwwAuth = response.headers.get("WWW-Authenticate");
		if (!wwwAuth) return null;
		const match = wwwAuth.match(/resource_metadata="([^"]+)"/);
		if (!match?.[1]) return null;
		const resourceMetadataUrl = match[1];
		const resourceResponse = await fetch(resourceMetadataUrl);
		if (!resourceResponse.ok) {
			console.warn(`[addon-mcp] Failed to fetch OAuth resource metadata from ${resourceMetadataUrl}: ${resourceResponse.status}`);
			return null;
		}
		const resourceResult = v.safeParse(OAuthResourceMetadata, await resourceResponse.json());
		if (!resourceResult.success) {
			console.warn(`[addon-mcp] Invalid OAuth resource metadata from ${resourceMetadataUrl}: ${resourceResult.issues.map((i) => i.message).join(", ")}`);
			return null;
		}
		const serverMetadataUrl = `${resourceResult.output.authorization_servers[0]}/.well-known/oauth-authorization-server`;
		const serverResponse = await fetch(serverMetadataUrl);
		if (!serverResponse.ok) {
			console.warn(`[addon-mcp] Failed to fetch OAuth server metadata from ${serverMetadataUrl}: ${serverResponse.status}`);
			return null;
		}
		const serverResult = v.safeParse(OAuthServerMetadata, await serverResponse.json());
		if (!serverResult.success) {
			console.warn(`[addon-mcp] Invalid OAuth server metadata from ${serverMetadataUrl}: ${serverResult.issues.map((i) => i.message).join(", ")}`);
			return null;
		}
		return {
			resourceMetadataUrl,
			resourceMetadata: resourceResult.output,
			serverMetadata: serverResult.output
		};
	}
};
/**
* Extract Bearer token from Authorization header.
* Handles both Node.js (string | string[] | undefined) and Web API (string | null) headers.
*/
function extractBearerToken(authHeader) {
	const bearer = (Array.isArray(authHeader) ? authHeader : [authHeader]).find((value) => typeof value === "string" && value.startsWith("Bearer "));
	return bearer ? bearer.slice(7) : null;
}

//#endregion
//#region src/preset.ts
const previewAnnotations = async (existingAnnotations = []) => {
	return [...existingAnnotations, path.join(import.meta.dirname, "preview.js")];
};
const experimental_devServer = async (app, options) => {
	const addonOptions = v.parse(AddonOptions, { toolsets: "toolsets" in options ? options.toolsets : {} });
	const origin = `http://localhost:${options.port}`;
	const refs = await getRefsFromConfig(options);
	const compositionAuth = new CompositionAuth();
	let sources;
	let manifestProvider;
	if (refs.length > 0) {
		logger.info(`Initializing composition with ${refs.length} remote Storybook(s)`);
		await compositionAuth.initialize(refs);
		if (compositionAuth.requiresAuth) logger.info(`Auth required for: ${compositionAuth.authUrls.join(", ")}`);
		sources = compositionAuth.buildSources();
		logger.info(`Sources: ${sources.map((s) => s.id).join(", ")}`);
		manifestProvider = compositionAuth.createManifestProvider(origin);
	}
	app.get("/.well-known/oauth-protected-resource", (_req, res) => {
		const wellKnown = compositionAuth.buildWellKnown(origin);
		if (!wellKnown) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(wellKnown));
	});
	const requireAuth = (req, res) => {
		const token = extractBearerToken(req.headers["authorization"]);
		if (compositionAuth.requiresAuth && !token) {
			res.writeHead(401, {
				"Content-Type": "text/plain",
				"WWW-Authenticate": compositionAuth.buildWwwAuthenticate(origin)
			});
			res.end("401 - Unauthorized");
			return true;
		}
		return false;
	};
	app.post("/mcp", (req, res) => {
		if (requireAuth(req, res)) return;
		return mcpServerHandler({
			req,
			res,
			options,
			addonOptions,
			sources,
			manifestProvider,
			compositionAuth
		});
	});
	const manifestStatus = await getManifestStatus(options);
	const addonVitestConstants = await getAddonVitestConstants();
	const a11yEnabled = await isAddonA11yEnabled(options);
	const isDevEnabled = addonOptions.toolsets?.dev ?? true;
	const isDocsEnabled = manifestStatus.available && (addonOptions.toolsets?.docs ?? true);
	const isTestEnabled = !!addonVitestConstants && (addonOptions.toolsets?.test ?? true);
	app.get("/mcp", (req, res) => {
		if (!req.headers["accept"]?.includes("text/html")) {
			if (requireAuth(req, res)) return;
			return mcpServerHandler({
				req,
				res,
				options,
				addonOptions,
				sources,
				manifestProvider,
				compositionAuth
			});
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		let docsNotice = "";
		if (!manifestStatus.hasManifests) docsNotice = `<div class="toolset-notice">
				This toolset is only supported in React-based setups.
			</div>`;
		else if (!manifestStatus.hasFeatureFlag) docsNotice = `<div class="toolset-notice">
				This toolset requires enabling the component manifest feature.
				<a target="_blank" href="https://github.com/storybookjs/mcp/tree/main/packages/addon-mcp#docs-tools-experimental">Learn how to enable it</a>
			</div>`;
		const testNoticeLines = [!addonVitestConstants && `This toolset requires Storybook 10.3.0+ with <code>@storybook/addon-vitest</code>. <a target="_blank" href="https://storybook.js.org/docs/writing-tests/test-addon">Learn how to set it up</a>`, !a11yEnabled && `Add <code>@storybook/addon-a11y</code> for accessibility testing. <a target="_blank" href="https://storybook.js.org/docs/writing-tests/accessibility-testing">Learn more</a>`].filter(Boolean);
		const testNotice = testNoticeLines.length ? `<div class="toolset-notice">${testNoticeLines.join("<br>")}</div>` : "";
		const a11yBadge = a11yEnabled ? " <span class=\"toolset-status enabled\">+ accessibility</span>" : "";
		const html = template_default.replaceAll("{{DEV_STATUS}}", isDevEnabled ? "enabled" : "disabled").replaceAll("{{DOCS_STATUS}}", isDocsEnabled ? "enabled" : "disabled").replace("{{DOCS_NOTICE}}", docsNotice).replaceAll("{{TEST_STATUS}}", isTestEnabled ? "enabled" : "disabled").replace("{{TEST_NOTICE}}", testNotice).replace("{{MANIFEST_DEBUGGER_LINK}}", manifestStatus.available ? "<p>View the <a href=\"/manifests/components.html\">component manifest debugger</a>.</p>" : "").replace("{{A11Y_BADGE}}", a11yBadge);
		res.end(html);
	});
	return app;
};
const features = async (existingFeatures) => {
	return {
		...existingFeatures,
		componentsManifest: true
	};
};
/**
* Get composed Storybook refs from Storybook config.
* See: https://storybook.js.org/docs/sharing/storybook-composition
*/
async function getRefsFromConfig(options) {
	try {
		const refs = await options.presets.apply("refs", {});
		if (!refs || typeof refs !== "object") return [];
		return Object.entries(refs).map(([key, value]) => ({
			id: key,
			title: value.title || key,
			url: value.url
		})).filter((ref) => ref.url);
	} catch {
		return [];
	}
}

//#endregion
export { experimental_devServer, features, previewAnnotations };