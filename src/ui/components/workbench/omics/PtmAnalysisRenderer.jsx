import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("ptm_analysis");
export default function PtmAnalysisRenderer(props) { return <Page {...props} />; }
