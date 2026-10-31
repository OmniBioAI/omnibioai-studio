import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("cell_comm_visualization");
export default function CellCommVisualizationRenderer(props) { return <Page {...props} />; }
