import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("marker_identification");
export default function MarkerIdentificationRenderer(props) { return <Page {...props} />; }
