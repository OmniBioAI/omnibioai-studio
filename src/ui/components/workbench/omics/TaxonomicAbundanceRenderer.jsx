import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("taxonomic_abundance");
export default function TaxonomicAbundanceRenderer(props) { return <Page {...props} />; }
