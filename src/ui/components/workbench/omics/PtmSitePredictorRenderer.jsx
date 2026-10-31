import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("ptm_site_predictor");
export default function PtmSitePredictorRenderer(props) { return <Page {...props} />; }
