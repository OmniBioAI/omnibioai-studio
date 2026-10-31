import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("spatial_domain_classifier");
export default function SpatialDomainClassifierRenderer(props) { return <Page {...props} />; }
