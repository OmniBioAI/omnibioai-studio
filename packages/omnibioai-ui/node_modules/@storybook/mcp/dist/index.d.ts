import { t as instructions_default } from "./instructions-Cl0vcW2j.js";
import { McpServer } from "tmcp";
import * as v from "valibot";

//#region src/types.d.ts
/**
 * Represents a single Storybook source (local or remote).
 */
type Source = {
  /** Unique identifier for this source (e.g., 'local', 'tetra') */id: string; /** Human-readable title (e.g., 'Local', 'Tetra Design System') */
  title: string; /** Remote URL, undefined for local source */
  url?: string;
};
/**
 * All manifests for a single source.
 */
type SourceManifests = {
  source: Source;
  componentManifest: ComponentManifestMap;
  docsManifest?: DocsManifestMap; /** Error message if fetching this source failed */
  error?: string;
};
/**
 * Custom context passed to MCP server and tools.
 * Contains the request object and optional manifest provider.
 */
type StorybookContext = {
  /**
   * The incoming HTTP request being processed.
   */
  request?: Request;
  /**
   * Optional function to provide custom manifest retrieval logic.
   * If provided, this function will be called instead of the default fetch-based provider.
   * The function receives the request object, a path to the manifest file, and optionally
   * a source (in multi-source mode).
   * The default provider requires a request object and constructs the manifest URL from the request origin,
   * replacing /mcp with /manifests/components.json.
   * Custom providers can use the request parameter to determine the manifest source, or ignore it entirely.
   */
  manifestProvider?: (request: Request | undefined, path: string, source?: Source) => Promise<string>;
  /**
   * Sources configuration for multi-source mode.
   * When provided, tools will fetch and display manifests grouped by source.
   */
  sources?: Source[];
  /**
   * Optional handler called when list-all-documentation tool is invoked.
   * Receives the context and the component manifest.
   */
  onListAllDocumentation?: (params: {
    context: StorybookContext;
    manifests: AllManifests;
    resultText: string; /** Present in multi-source mode — all source manifests including errors */
    sources?: SourceManifests[];
  }) => void | Promise<void>;
  /**
   * Optional handler called when get-documentation tool is invoked.
   * Receives the context, input parameters, and the found component (if any).
   */
  onGetDocumentation?: (params: {
    context: StorybookContext;
    input: {
      id: string;
      storybookId?: string;
    };
  } & ({
    foundDocumentation: ComponentManifest | Doc;
    resultText: string;
  } | {
    foundDocumentation?: never;
    resultText?: never;
  })) => void | Promise<void>;
};
/**
 * A docs entry represents MDX documentation that can be attached to a component
 * or standalone (unattached).
 */
declare const Doc: v.ObjectSchema<{
  readonly id: v.StringSchema<undefined>;
  readonly name: v.StringSchema<undefined>;
  readonly title: v.StringSchema<undefined>;
  readonly path: v.StringSchema<undefined>;
  readonly content: v.StringSchema<undefined>;
  readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
  readonly error: v.OptionalSchema<v.ObjectSchema<{
    readonly name: v.StringSchema<undefined>;
    readonly message: v.StringSchema<undefined>;
  }, undefined>, undefined>;
}, undefined>;
type Doc = v.InferOutput<typeof Doc>;
declare const ComponentManifest: v.ObjectSchema<{
  readonly id: v.StringSchema<undefined>;
  readonly stories: v.OptionalSchema<v.ArraySchema<v.ObjectSchema<{
    readonly id: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly snippet: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly name: v.StringSchema<undefined>;
    readonly description: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly jsDocTags: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>, undefined>;
    readonly error: v.OptionalSchema<v.ObjectSchema<{
      readonly name: v.StringSchema<undefined>;
      readonly message: v.StringSchema<undefined>;
    }, undefined>, undefined>;
  }, undefined>, undefined>, undefined>;
  readonly subcomponents: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ObjectSchema<{
    readonly path: v.StringSchema<undefined>;
    readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly import: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly reactDocgen: v.OptionalSchema<v.AnySchema, undefined>;
    readonly reactDocgenTypescript: v.OptionalSchema<v.AnySchema, undefined>;
    readonly reactComponentMeta: v.OptionalSchema<v.AnySchema, undefined>;
    readonly name: v.StringSchema<undefined>;
    readonly description: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly jsDocTags: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>, undefined>;
    readonly error: v.OptionalSchema<v.ObjectSchema<{
      readonly name: v.StringSchema<undefined>;
      readonly message: v.StringSchema<undefined>;
    }, undefined>, undefined>;
  }, undefined>, undefined>, undefined>;
  readonly docs: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ObjectSchema<{
    readonly id: v.StringSchema<undefined>;
    readonly name: v.StringSchema<undefined>;
    readonly title: v.StringSchema<undefined>;
    readonly path: v.StringSchema<undefined>;
    readonly content: v.StringSchema<undefined>;
    readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly error: v.OptionalSchema<v.ObjectSchema<{
      readonly name: v.StringSchema<undefined>;
      readonly message: v.StringSchema<undefined>;
    }, undefined>, undefined>;
  }, undefined>, undefined>, undefined>;
  readonly path: v.StringSchema<undefined>;
  readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
  readonly import: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
  readonly reactDocgen: v.OptionalSchema<v.AnySchema, undefined>;
  readonly reactDocgenTypescript: v.OptionalSchema<v.AnySchema, undefined>;
  readonly reactComponentMeta: v.OptionalSchema<v.AnySchema, undefined>;
  readonly name: v.StringSchema<undefined>;
  readonly description: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
  readonly jsDocTags: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>, undefined>;
  readonly error: v.OptionalSchema<v.ObjectSchema<{
    readonly name: v.StringSchema<undefined>;
    readonly message: v.StringSchema<undefined>;
  }, undefined>, undefined>;
}, undefined>;
type ComponentManifest = v.InferOutput<typeof ComponentManifest>;
declare const ComponentManifestMap: v.ObjectSchema<{
  readonly v: v.NumberSchema<undefined>;
  readonly components: v.RecordSchema<v.StringSchema<undefined>, v.ObjectSchema<{
    readonly id: v.StringSchema<undefined>;
    readonly stories: v.OptionalSchema<v.ArraySchema<v.ObjectSchema<{
      readonly id: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly snippet: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly name: v.StringSchema<undefined>;
      readonly description: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly jsDocTags: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>, undefined>;
      readonly error: v.OptionalSchema<v.ObjectSchema<{
        readonly name: v.StringSchema<undefined>;
        readonly message: v.StringSchema<undefined>;
      }, undefined>, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly subcomponents: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ObjectSchema<{
      readonly path: v.StringSchema<undefined>;
      readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly import: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly reactDocgen: v.OptionalSchema<v.AnySchema, undefined>;
      readonly reactDocgenTypescript: v.OptionalSchema<v.AnySchema, undefined>;
      readonly reactComponentMeta: v.OptionalSchema<v.AnySchema, undefined>;
      readonly name: v.StringSchema<undefined>;
      readonly description: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly jsDocTags: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>, undefined>;
      readonly error: v.OptionalSchema<v.ObjectSchema<{
        readonly name: v.StringSchema<undefined>;
        readonly message: v.StringSchema<undefined>;
      }, undefined>, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly docs: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ObjectSchema<{
      readonly id: v.StringSchema<undefined>;
      readonly name: v.StringSchema<undefined>;
      readonly title: v.StringSchema<undefined>;
      readonly path: v.StringSchema<undefined>;
      readonly content: v.StringSchema<undefined>;
      readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
      readonly error: v.OptionalSchema<v.ObjectSchema<{
        readonly name: v.StringSchema<undefined>;
        readonly message: v.StringSchema<undefined>;
      }, undefined>, undefined>;
    }, undefined>, undefined>, undefined>;
    readonly path: v.StringSchema<undefined>;
    readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly import: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly reactDocgen: v.OptionalSchema<v.AnySchema, undefined>;
    readonly reactDocgenTypescript: v.OptionalSchema<v.AnySchema, undefined>;
    readonly reactComponentMeta: v.OptionalSchema<v.AnySchema, undefined>;
    readonly name: v.StringSchema<undefined>;
    readonly description: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly jsDocTags: v.OptionalSchema<v.RecordSchema<v.StringSchema<undefined>, v.ArraySchema<v.StringSchema<undefined>, undefined>, undefined>, undefined>;
    readonly error: v.OptionalSchema<v.ObjectSchema<{
      readonly name: v.StringSchema<undefined>;
      readonly message: v.StringSchema<undefined>;
    }, undefined>, undefined>;
  }, undefined>, undefined>;
}, undefined>;
type ComponentManifestMap = v.InferOutput<typeof ComponentManifestMap>;
/**
 * Manifest for unattached/standalone documentation entries.
 * Served at /manifests/docs.json
 */
declare const DocsManifestMap: v.ObjectSchema<{
  readonly v: v.NumberSchema<undefined>;
  readonly docs: v.RecordSchema<v.StringSchema<undefined>, v.ObjectSchema<{
    readonly id: v.StringSchema<undefined>;
    readonly name: v.StringSchema<undefined>;
    readonly title: v.StringSchema<undefined>;
    readonly path: v.StringSchema<undefined>;
    readonly content: v.StringSchema<undefined>;
    readonly summary: v.OptionalSchema<v.StringSchema<undefined>, undefined>;
    readonly error: v.OptionalSchema<v.ObjectSchema<{
      readonly name: v.StringSchema<undefined>;
      readonly message: v.StringSchema<undefined>;
    }, undefined>, undefined>;
  }, undefined>, undefined>;
}, undefined>;
type DocsManifestMap = v.InferOutput<typeof DocsManifestMap>;
type AllManifests = {
  componentManifest: ComponentManifestMap;
  docsManifest?: DocsManifestMap;
};
//#endregion
//#region src/tools/list-all-documentation.d.ts
declare const LIST_TOOL_NAME = "list-all-documentation";
declare function addListAllDocumentationTool(server: McpServer<any, StorybookContext>, enabled?: Parameters<McpServer<any, StorybookContext>['tool']>[0]['enabled']): Promise<void>;
//#endregion
//#region src/tools/get-documentation.d.ts
declare const GET_TOOL_NAME = "get-documentation";
declare function addGetDocumentationTool(server: McpServer<any, StorybookContext>, enabled?: Parameters<McpServer<any, StorybookContext>['tool']>[0]['enabled'], options?: {
  multiSource?: boolean;
}): Promise<void>;
//#endregion
//#region src/tools/get-documentation-for-story.d.ts
declare const GET_STORY_TOOL_NAME = "get-documentation-for-story";
declare function addGetStoryDocumentationTool(server: McpServer<any, StorybookContext>, enabled?: Parameters<McpServer<any, StorybookContext>['tool']>[0]['enabled'], options?: {
  multiSource?: boolean;
}): Promise<void>;
//#endregion
//#region src/utils/get-manifest.d.ts
/**
 * The paths to the manifest files relative to the Storybook build
 */
declare const COMPONENT_MANIFEST_PATH = "./manifests/components.json";
declare const DOCS_MANIFEST_PATH = "./manifests/docs.json";
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
declare function getMultiSourceManifests(sources: Source[], request?: Request, manifestProvider?: (request: Request | undefined, path: string, source?: Source) => Promise<string>): Promise<SourceManifests[]>;
//#endregion
//#region src/index.d.ts
type InitializeRequestParams = {
  protocolVersion: string;
  capabilities: {
    experimental?: {} | undefined;
    sampling?: {} | undefined;
    elicitation?: {} | undefined;
    roots?: {
      listChanged?: boolean | undefined;
    } | undefined;
  };
  clientInfo: {
    icons?: {
      src: string;
      mimeType?: string | undefined;
      sizes?: string[] | undefined;
    }[] | undefined;
    version: string;
    websiteUrl?: string | undefined;
    name: string;
    title?: string | undefined;
  };
};
/**
 * Options for creating a Storybook MCP handler.
 * Extends StorybookContext with server-level configuration.
 */
interface StorybookMcpHandlerOptions extends StorybookContext {
  /**
   * Optional handler called when an MCP session is initialized.
   * This is only valid at the handler creation level, not per-request.
   * Receives the initialize request parameters from the MCP protocol.
   */
  onSessionInitialize?: (initializeRequestParams: InitializeRequestParams) => void | Promise<void>;
}
type Handler = (req: Request, context?: StorybookContext) => Promise<Response>;
declare const createStorybookMcpHandler: (options?: StorybookMcpHandlerOptions) => Promise<Handler>;
//#endregion
export { COMPONENT_MANIFEST_PATH, type ComponentManifest, ComponentManifestMap, DOCS_MANIFEST_PATH, DocsManifestMap, GET_STORY_TOOL_NAME, GET_TOOL_NAME, LIST_TOOL_NAME, instructions_default as STORYBOOK_MCP_INSTRUCTIONS, type Source, type SourceManifests, type StorybookContext, StorybookMcpHandlerOptions, addGetDocumentationTool, addGetStoryDocumentationTool, addListAllDocumentationTool, createStorybookMcpHandler, getMultiSourceManifests };