import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("amr_gene_classifier");
export default function AmrGeneClassifierRenderer(props) { return <Page {...props} />; }
