import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("adv_single_cell");
export default function AdvSingleCellRenderer(props) { return <Page {...props} />; }
