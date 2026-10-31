import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("scanpy_clustering");
export default function ScanpyClusteringRenderer(props) { return <Page {...props} />; }
