import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("spatial_analysis");
export default function SpatialAnalysisRenderer(props) { return <Page {...props} />; }
