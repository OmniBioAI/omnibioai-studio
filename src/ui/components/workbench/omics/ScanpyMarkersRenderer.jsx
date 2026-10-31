import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("scanpy_markers");
export default function ScanpyMarkersRenderer(props) { return <Page {...props} />; }
