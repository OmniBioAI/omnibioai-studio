import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("microbiome_report");
export default function MicrobiomeReportRenderer(props) { return <Page {...props} />; }
