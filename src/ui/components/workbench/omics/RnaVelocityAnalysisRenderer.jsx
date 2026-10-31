import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("rna_velocity_analysis");
export default function RnaVelocityAnalysisRenderer(props) { return <Page {...props} />; }
