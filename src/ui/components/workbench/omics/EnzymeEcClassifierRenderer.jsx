import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("enzyme_ec_classifier");
export default function EnzymeEcClassifierRenderer(props) { return <Page {...props} />; }
