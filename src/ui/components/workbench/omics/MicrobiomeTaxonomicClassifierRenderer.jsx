import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("microbiome_taxonomic_classifier");
export default function MicrobiomeTaxonomicClassifierRenderer(props) { return <Page {...props} />; }
