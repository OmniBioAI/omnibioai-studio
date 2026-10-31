import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("citeseq_celltype_classifier");
export default function CiteseqCelltypeClassifierRenderer(props) { return <Page {...props} />; }
