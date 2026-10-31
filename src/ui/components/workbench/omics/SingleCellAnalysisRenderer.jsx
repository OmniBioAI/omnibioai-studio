import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("single_cell_analysis");
export default function SingleCellAnalysisRenderer(props) { return <Page {...props} />; }
