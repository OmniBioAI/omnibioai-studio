import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("spatial_clustering");
export default function SpatialClusteringRenderer(props) { return <Page {...props} />; }
