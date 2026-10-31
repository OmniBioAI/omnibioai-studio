import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("threshold_recommendation");
export default function ThresholdRecommendationRenderer(props) { return <Page {...props} />; }
