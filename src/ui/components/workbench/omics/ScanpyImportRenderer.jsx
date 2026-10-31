import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("scanpy_import");
export default function ScanpyImportRenderer(props) { return <Page {...props} />; }
