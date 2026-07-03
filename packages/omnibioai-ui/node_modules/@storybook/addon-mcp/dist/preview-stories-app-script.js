//#region src/constants.ts
const MCP_APP_PARAM = "mcp-app";
const MCP_APP_SIZE_CHANGED_EVENT = "storybook-mcp:size-changed";

//#endregion
//#region package.json
var version = "0.6.0";

//#endregion
//#region src/tools/preview-stories/preview-stories-app-script.ts
/**
* Current protocol version - must match LATEST_PROTOCOL_VERSION from ext-apps
* @see https://github.com/modelcontextprotocol/ext-apps
*/
const LATEST_PROTOCOL_VERSION = "2025-11-21";
/**
* MCP Apps SEP protocol method constants
* These match the `method` field values from @modelcontextprotocol/ext-apps type definitions:
* - McpUiInitializeRequest: "ui/initialize"
* - McpUiInitializedNotification: "ui/notifications/initialized"
* - McpUiToolInputNotification: "ui/notifications/tool-input"
* - McpUiToolInputPartialNotification: "ui/notifications/tool-input-partial"
* - McpUiToolResultNotification: "ui/notifications/tool-result"
* - McpUiHostContextChangedNotification: "ui/notifications/host-context-changed"
* - McpUiSizeChangedNotification: "ui/notifications/size-changed"
* - McpUiResourceTeardownRequest: "ui/resource-teardown"
*
* @see https://github.com/modelcontextprotocol/ext-apps/blob/main/src/spec.types.ts
*/
const METHODS = {
	INITIALIZE: "ui/initialize",
	INITIALIZED: "ui/notifications/initialized",
	TOOL_INPUT: "ui/notifications/tool-input",
	TOOL_INPUT_PARTIAL: "ui/notifications/tool-input-partial",
	TOOL_RESULT: "ui/notifications/tool-result",
	TOOL_CANCELLED: "ui/notifications/tool-cancelled",
	HOST_CONTEXT_CHANGED: "ui/notifications/host-context-changed",
	SIZE_CHANGED: "ui/notifications/size-changed",
	RESOURCE_TEARDOWN: "ui/resource-teardown",
	TOOLS_CALL: "tools/call",
	NOTIFICATIONS_MESSAGE: "notifications/message",
	OPEN_LINK: "ui/open-link",
	MESSAGE: "ui/message"
};
let nextId = 1;
function sendHostRequest(method, params) {
	const id = nextId++;
	const { promise, resolve, reject } = Promise.withResolvers();
	window.parent.postMessage({
		jsonrpc: "2.0",
		id,
		method,
		params
	}, "*");
	window.addEventListener("message", function listener(event) {
		if (event.data?.id !== id) return;
		window.removeEventListener("message", listener);
		if (event.data?.result) resolve(event.data.result);
		else if (event.data?.error) reject(new Error(String(event.data.error)));
	});
	return promise;
}
function sendHostNotification(method, params) {
	window.parent.postMessage({
		jsonrpc: "2.0",
		method,
		params
	}, "*");
}
function onHostNotification(method, handler) {
	window.addEventListener("message", function listener(event) {
		if (event.data?.method === method) handler(event.data.params);
	});
}
applyHostStyles((await sendHostRequest(METHODS.INITIALIZE, {
	appInfo: {
		name: "storybook-story-preview",
		version
	},
	appCapabilities: {},
	protocolVersion: LATEST_PROTOCOL_VERSION
}))?.hostContext);
onHostNotification(METHODS.TOOL_RESULT, loadStoryIframes);
onHostNotification(METHODS.HOST_CONTEXT_CHANGED, applyHostStyles);
sendHostNotification(METHODS.INITIALIZED, {});
window.addEventListener("message", function(event) {
	if (event.data?.type !== MCP_APP_SIZE_CHANGED_EVENT) return;
	const iframes = document.querySelectorAll(".story-iframe");
	let hasResizedIframes = false;
	for (const iframe of iframes) if (iframe.contentWindow === event.source) {
		iframe.style.height = (event.data.height ?? 0) + "px";
		hasResizedIframes = true;
		break;
	}
	if (hasResizedIframes) resizeApp();
});
function applyHostStyles(hostContext) {
	if (hostContext?.theme) document.documentElement.setAttribute("data-theme", hostContext.theme);
	if (!hostContext?.styles?.variables) return;
	for (const [key, value] of Object.entries(hostContext.styles.variables)) if (value) document.documentElement.style.setProperty(key, value);
	resizeApp();
}
function resizeApp() {
	console.log("Resizing app to fit content", {
		width: document.body.scrollWidth,
		height: document.body.scrollHeight
	});
	sendHostNotification(METHODS.SIZE_CHANGED, {
		width: document.body.scrollWidth,
		height: document.body.scrollHeight
	});
}
function loadStoryIframes(params) {
	const stories = params.structuredContent?.stories;
	if (!stories || stories.length === 0) {
		console.warn("No preview URLs found in tool result.");
		return;
	}
	const template = document.getElementById("preview-template");
	for (const storyResult of stories) {
		if ("error" in storyResult) {
			console.warn("Skipping story with error:", storyResult.error);
			continue;
		}
		const clone = template.content.cloneNode(true);
		const article = clone.querySelector("article");
		const heading = clone.querySelector("h1");
		const iframe = clone.querySelector("iframe");
		heading.textContent = `${storyResult.title} - ${storyResult.name}`;
		iframe.style.width = "100%";
		iframe.style.height = "0";
		const iframeSrc = storyResult.previewUrl.replace("/?path=/story/", "/iframe.html?id=");
		const url = new URL(iframeSrc);
		url.searchParams.set(MCP_APP_PARAM, "true");
		iframe.src = url.toString();
		document.body.appendChild(article);
	}
	resizeApp();
}

//#endregion
export {  };