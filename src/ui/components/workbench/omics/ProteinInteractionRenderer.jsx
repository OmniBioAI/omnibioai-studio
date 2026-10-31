import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("protein_interaction");
export default function ProteinInteractionRenderer(props) { return <Page {...props} />; }
