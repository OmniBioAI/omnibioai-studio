import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("scanpy_qc_metrics");
export default function ScanpyQcMetricsRenderer(props) { return <Page {...props} />; }
