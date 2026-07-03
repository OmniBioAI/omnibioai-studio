//#region src/constants.ts
const MCP_APP_PARAM = "mcp-app";
const MCP_APP_SIZE_CHANGED_EVENT = "storybook-mcp:size-changed";

//#endregion
//#region src/preview.ts
/**
* Storybook MCP App Script
*
* This script runs inside Storybook's iframe and communicates dimensions
* to the parent preview.html frame via postMessage (cross-origin safe).
*
* Only activates when the iframe is loaded with `mcp-app=true` query parameter,
* which is set by the MCP Apps preview.html wrapper.
*/
if (new URLSearchParams(window.location.search).has(MCP_APP_PARAM)) {
	const SIZE_CHANGE_THRESHOLD = 2;
	let debounceTimer = null;
	let lastSentHeight = 0;
	const DEBOUNCE_MS = 100;
	function sendSizeToParent() {
		const height = document.body.scrollHeight;
		if (Math.abs(height - lastSentHeight) <= SIZE_CHANGE_THRESHOLD) return;
		lastSentHeight = height;
		window.parent.postMessage({
			type: MCP_APP_SIZE_CHANGED_EVENT,
			height
		}, "*");
	}
	function debouncedSendSize() {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(sendSizeToParent, DEBOUNCE_MS);
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sendSizeToParent);
	else sendSizeToParent();
	window.addEventListener("load", sendSizeToParent);
	new ResizeObserver(debouncedSendSize).observe(document.body);
	new MutationObserver(debouncedSendSize).observe(document.body, {
		childList: true,
		subtree: true,
		attributes: true
	});
}

//#endregion
export {  };