import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("spatial_report_generation");
export default function SpatialReportGenerationRenderer(props) { return <Page {...props} />; }
