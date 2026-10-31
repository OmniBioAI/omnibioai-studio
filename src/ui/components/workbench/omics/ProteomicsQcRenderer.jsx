import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("proteomics_qc");
export default function ProteomicsQcRenderer(props) { return <Page {...props} />; }
