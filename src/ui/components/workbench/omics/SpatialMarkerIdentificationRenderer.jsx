import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("spatial_marker_identification");
export default function SpatialMarkerIdentificationRenderer(props) { return <Page {...props} />; }
