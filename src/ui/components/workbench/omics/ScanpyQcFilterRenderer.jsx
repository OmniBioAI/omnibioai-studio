import React from "react";
import { createOmicsCategoryRenderer } from "../OmicsCategoryReactRenderers";
const Page = createOmicsCategoryRenderer("scanpy_qc_filter");
export default function ScanpyQcFilterRenderer(props) { return <Page {...props} />; }
