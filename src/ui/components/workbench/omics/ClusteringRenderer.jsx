import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("clustering");
export default function ClusteringRenderer(props) { return <Page {...props} />; }
