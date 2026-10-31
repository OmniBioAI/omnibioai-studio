import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("single_cell_annotation");
export default function SingleCellAnnotationRenderer(props) { return <Page {...props} />; }
