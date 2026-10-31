import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("protein_quantification");
export default function ProteinQuantificationRenderer(props) { return <Page {...props} />; }
