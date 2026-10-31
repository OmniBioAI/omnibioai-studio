import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("qc_plots");
export default function QcPlotsRenderer(props) { return <Page {...props} />; }
