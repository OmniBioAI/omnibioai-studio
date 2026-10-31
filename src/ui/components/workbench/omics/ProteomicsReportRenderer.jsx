import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("proteomics_report");
export default function ProteomicsReportRenderer(props) { return <Page {...props} />; }
