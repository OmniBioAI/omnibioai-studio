import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("beta_diversity");
export default function BetaDiversityRenderer(props) { return <Page {...props} />; }
