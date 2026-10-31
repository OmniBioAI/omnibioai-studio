import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("alpha_diversity");
export default function AlphaDiversityRenderer(props) { return <Page {...props} />; }
